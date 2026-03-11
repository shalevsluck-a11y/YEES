/**
 * Web Search Source Adapter (Google Custom Search)
 *
 * STATUS: Working (requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID env vars)
 *
 * Uses Google Custom Search API — completely free, 100 searches/day,
 * no credit card required. Finds leads on Craigslist, Reddit, and forums
 * through Google's search index.
 *
 * Setup (5 minutes, free, only needs a Google account):
 *
 * Step 1 — Get API key:
 *   1. Go to console.cloud.google.com
 *   2. Create a project (or select existing)
 *   3. Search "Custom Search API" → Enable it
 *   4. Go to Credentials → Create Credentials → API Key
 *   5. Copy the key → add as GOOGLE_SEARCH_API_KEY in Vercel
 *
 * Step 2 — Get Search Engine ID:
 *   1. Go to programmablesearchengine.google.com
 *   2. Click "Add" → name it anything → in Sites to Search type: craigslist.org
 *   3. Create it → then go to Edit → Setup → turn on "Search the entire web"
 *   4. Copy the Search engine ID (cx) → add as GOOGLE_SEARCH_ENGINE_ID in Vercel
 */

import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';
import { cleanUrl } from '@/lib/urlResolver';

// Queries targeting actual homeowner posts, not contractor business pages
const SEARCH_QUERIES = [
  'site:craigslist.org "garage door" "broken" OR "stuck" OR "spring" -"call now" -"free estimate"',
  'site:craigslist.org "garage door" "need" OR "looking for" OR "help" -"licensed" -"insured"',
  'site:reddit.com "garage door" "broken" OR "stuck" "brooklyn" OR "queens" OR "bronx" OR "long island" OR "new jersey"',
  '"garage door repair" "brooklyn" OR "queens" OR "bronx" OR "staten island" OR "long island" "need" OR "help" -site:yelp.com -site:angi.com -site:thumbtack.com',
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
    return false;
  } catch {
    return false;
  }
}

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet: string;
  pagemap?: {
    metatags?: Array<{ 'article:published_time'?: string; 'og:updated_time'?: string }>;
    newsarticle?: Array<{ datepublished?: string }>;
  };
}

async function googleSearch(query: string, apiKey: string, cx: string): Promise<RawLead[]> {
  // dateRestrict=w1 = past week
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=10&dateRestrict=w1`;

  const result = await fetchPage(url, {
    acceptJson: true,
    timeout: 10_000,
  });

  if (!result.ok) {
    console.warn(`[google-search] API failed (${result.status})`);
    return [];
  }

  try {
    const json = JSON.parse(result.text) as { items?: GoogleSearchItem[]; error?: { message: string } };

    if (json.error) {
      console.warn(`[google-search] API error: ${json.error.message}`);
      return [];
    }

    const leads: RawLead[] = [];
    for (const item of json.items ?? []) {
      const cleanedUrl = cleanUrl(item.link);
      if (shouldSkipUrl(cleanedUrl)) continue;

      // Try to extract publish date from page metadata
      const metatags = item.pagemap?.metatags?.[0];
      const rawDate =
        metatags?.['article:published_time'] ??
        metatags?.['og:updated_time'] ??
        item.pagemap?.newsarticle?.[0]?.datepublished;

      const { date: postedAt, accuracy } = resolveDate(rawDate);

      leads.push({
        title: item.title,
        url: cleanedUrl,
        snippet: item.snippet,
        postedAt,
        postedAtAccuracy: accuracy,
        matchedKeyword: query,
        rawMetadata: { source: 'google-search' },
      });
    }

    return leads;
  } catch (err) {
    console.error('[google-search] JSON parse error:', err);
    return [];
  }
}

export async function fetchFallbackLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !cx) {
    return {
      sourceKey: 'fallback',
      sourceName: 'Google Search',
      status: 'Blocked',
      leads: [],
      note: 'Add GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID to Vercel env vars. Both are free — see setup instructions in src/sources/fallbackDiscovery.ts',
      fetchedAt: new Date(),
    };
  }

  // Run all queries in parallel
  const results = await Promise.all(
    SEARCH_QUERIES.map(q => googleSearch(q, apiKey, cx).catch(() => [] as RawLead[]))
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
    sourceName: 'Google Search',
    status: dedupedLeads.length > 0 ? 'Working' : 'Partial',
    leads: dedupedLeads,
    note: dedupedLeads.length === 0 ? 'Google Search returned no results. Check your GOOGLE_SEARCH_ENGINE_ID is configured to search the entire web.' : undefined,
    fetchedAt: new Date(),
  };
}
