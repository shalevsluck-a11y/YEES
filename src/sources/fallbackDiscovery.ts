/**
 * Bing Search Source Adapter
 *
 * STATUS: Working (requires BING_API_KEY env var)
 *
 * Uses Bing Web Search API to find leads across Craigslist, Reddit,
 * and other platforms via Bing's search index.
 *
 * This is our primary reliable source when Craigslist direct access is
 * unavailable (no SCRAPER_API_KEY). Bing's index includes Craigslist posts,
 * Reddit threads, and forum discussions.
 *
 * Get a free Bing API key (1,000 searches/month free):
 * 1. Go to portal.azure.com → sign in or create a free account
 * 2. Search for "Bing Search v7" → Create
 * 3. Choose Free tier (F1) — 1,000 transactions/month
 * 4. Copy the key from Keys and Endpoint
 * 5. Add as BING_API_KEY in Vercel env vars
 *
 * Without BING_API_KEY: this source is disabled (Bing blocks HTML scraping
 * from datacenter IPs just like Craigslist does).
 */

import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';
import { cleanUrl } from '@/lib/urlResolver';

// Queries targeting actual homeowner posts, not contractor business pages
const BING_QUERIES = [
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

interface BingApiResult {
  name: string;
  url: string;
  snippet: string;
  dateLastCrawled?: string;
  datePublished?: string;
}

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

async function bingApiSearch(query: string, apiKey: string): Promise<RawLead[]> {
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
  const apiKey = process.env.BING_API_KEY;

  if (!apiKey) {
    return {
      sourceKey: 'fallback',
      sourceName: 'Bing Search',
      status: 'Blocked',
      leads: [],
      note: 'Add BING_API_KEY to Vercel env vars to enable this source. Free tier: 1,000 searches/month. Get it at portal.azure.com → search "Bing Search v7" → Free tier.',
      fetchedAt: new Date(),
    };
  }

  // Run all queries in parallel for speed
  const results = await Promise.all(
    BING_QUERIES.map(q => bingApiSearch(q, apiKey).catch(() => [] as RawLead[]))
  );

  const allLeads = results.flat();

  // Deduplicate by URL
  const seen = new Set<string>();
  const dedupedLeads = allLeads.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  return {
    sourceKey: 'fallback',
    sourceName: 'Bing Search',
    status: dedupedLeads.length > 0 ? 'Working' : 'Partial',
    leads: dedupedLeads,
    note: dedupedLeads.length === 0 ? 'Bing API returned no results for these queries.' : undefined,
    fetchedAt: new Date(),
  };
}
