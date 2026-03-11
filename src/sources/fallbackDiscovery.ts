/**
 * Web Search Source Adapter (Brave Search API)
 *
 * STATUS: Working (requires BRAVE_SEARCH_API_KEY env var)
 *
 * Uses Brave Search API to find leads across Craigslist, Reddit,
 * and other platforms. Brave's index includes Craigslist posts,
 * Reddit threads, and forum discussions.
 *
 * Get a free Brave Search API key (2,000 queries/month free, no credit card):
 * 1. Go to api.search.brave.com
 * 2. Click "Get Started" → sign up free
 * 3. Create a new subscription (Free plan)
 * 4. Copy your API key
 * 5. Add as BRAVE_SEARCH_API_KEY in Vercel env vars
 *
 * Also supports BING_API_KEY as fallback if you already have one.
 */

import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';
import { cleanUrl } from '@/lib/urlResolver';

// Queries targeting actual homeowner posts, not contractor business pages
const SEARCH_QUERIES = [
  'site:craigslist.org "garage door" "broken" OR "stuck" OR "spring" -"call now" -"free estimate"',
  'site:craigslist.org "garage door" "need" OR "looking for" OR "help" -"licensed" -"insured"',
  'site:reddit.com "garage door" "broken" OR "stuck" OR "help" "brooklyn" OR "queens" OR "bronx" OR "long island" OR "new jersey"',
  'site:reddit.com "garage door spring" OR "garage opener" "not working" OR "broke" OR "snapped"',
  '"garage door repair" "brooklyn" OR "queens" OR "bronx" OR "staten island" OR "long island" "need" OR "help" OR "broken" -site:yelp.com -site:angi.com -site:thumbtack.com',
];

const SKIP_DOMAINS = [
  'yelp.com', 'angi.com', 'thumbtack.com', 'homeadvisor.com',
  'houzz.com', 'bbb.org', 'yellowpages.com', 'angieslist.com',
];

function shouldSkipUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (SKIP_DOMAINS.some(d => host.includes(d))) return true;
    if (u.pathname === '/' || u.pathname === '') return true;
    if (/\/search[/?]/.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

interface BraveResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  page_age?: string;
}

async function braveSearch(query: string, apiKey: string): Promise<RawLead[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20&freshness=pw&search_lang=en&country=us`;

  const result = await fetchPage(url, {
    acceptJson: true,
    timeout: 10_000,
    extraHeaders: {
      'X-Subscription-Token': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!result.ok) {
    console.warn(`[brave] API failed (${result.status})`);
    return [];
  }

  try {
    const json = JSON.parse(result.text) as { web?: { results?: BraveResult[] } };
    const items = json?.web?.results ?? [];
    const leads: RawLead[] = [];

    for (const item of items) {
      const cleanedUrl = cleanUrl(item.url);
      if (shouldSkipUrl(cleanedUrl)) continue;
      const rawDate = item.age ?? item.page_age;
      const { date: postedAt, accuracy } = resolveDate(rawDate);
      leads.push({
        title: item.title,
        url: cleanedUrl,
        snippet: item.description,
        postedAt,
        postedAtAccuracy: accuracy,
        matchedKeyword: query,
        rawMetadata: { source: 'brave-search', age: rawDate },
      });
    }

    return leads;
  } catch (err) {
    console.error('[brave] JSON parse error:', err);
    return [];
  }
}

interface BingApiResult {
  name: string;
  url: string;
  snippet: string;
  dateLastCrawled?: string;
  datePublished?: string;
}

async function bingSearch(query: string, apiKey: string): Promise<RawLead[]> {
  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=20&freshness=Week&mkt=en-US`;

  const result = await fetchPage(url, {
    acceptJson: true,
    timeout: 10_000,
    extraHeaders: { 'Ocp-Apim-Subscription-Key': apiKey },
  });

  if (!result.ok) {
    console.warn(`[bing] API failed (${result.status})`);
    return [];
  }

  try {
    const json = JSON.parse(result.text) as { webPages?: { value?: BingApiResult[] } };
    const items = json?.webPages?.value ?? [];
    const leads: RawLead[] = [];

    for (const item of items) {
      const cleanedUrl = cleanUrl(item.url);
      if (shouldSkipUrl(cleanedUrl)) continue;
      const { date: postedAt, accuracy } = resolveDate(item.datePublished ?? item.dateLastCrawled);
      leads.push({
        title: item.name,
        url: cleanedUrl,
        snippet: item.snippet,
        postedAt,
        postedAtAccuracy: accuracy,
        matchedKeyword: query,
        rawMetadata: { source: 'bing-api', dateLastCrawled: item.dateLastCrawled },
      });
    }

    return leads;
  } catch (err) {
    console.error('[bing] JSON parse error:', err);
    return [];
  }
}

export async function fetchFallbackLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  const bingKey = process.env.BING_API_KEY;
  const apiKey = braveKey ?? bingKey;
  const provider = braveKey ? 'Brave Search' : bingKey ? 'Bing Search' : null;

  if (!apiKey || !provider) {
    return {
      sourceKey: 'fallback',
      sourceName: 'Web Search',
      status: 'Blocked',
      leads: [],
      note: 'Add BRAVE_SEARCH_API_KEY to Vercel env vars to enable this source. Free at api.search.brave.com (2,000 searches/month, no credit card).',
      fetchedAt: new Date(),
    };
  }

  const searchFn = braveKey
    ? (q: string) => braveSearch(q, braveKey)
    : (q: string) => bingSearch(q, bingKey!);

  // Run all queries in parallel for speed
  const results = await Promise.all(
    SEARCH_QUERIES.map(q => searchFn(q).catch(() => [] as RawLead[]))
  );

  const allLeads = results.flat();

  const seen = new Set<string>();
  const dedupedLeads = allLeads.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  return {
    sourceKey: 'fallback',
    sourceName: provider,
    status: dedupedLeads.length > 0 ? 'Working' : 'Partial',
    leads: dedupedLeads,
    note: dedupedLeads.length === 0 ? `${provider} API returned no results for these queries.` : undefined,
    fetchedAt: new Date(),
  };
}
