/**
 * Bing Web Search Source Adapter
 *
 * PRIMARY: Bing Search API (BING_API_KEY) — searches Bing's index
 * FALLBACK: Serper/Google Search (SERPER_API_KEY) — Nextdoor/forums via Google
 *
 * Free Bing tier: 1,000 searches/month at no cost (Azure F0 plan).
 * Setup: portal.azure.com → Create "Bing Search v7" → Free F0 tier → copy key
 *
 * Without BING_API_KEY: falls back to Serper with Nextdoor/forum queries
 * so the source still returns leads without requiring a second API key.
 */

import type { SourceResult, RawLead } from '@/types/source';
import { resolveDate } from '@/lib/dateResolution';
import { cleanUrl } from '@/lib/urlResolver';
import { runSerperQueries } from '@/lib/serperSearch';

const BING_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';

const SKIP_DOMAINS = [
  'yelp.com', 'angi.com', 'thumbtack.com', 'homeadvisor.com',
  'bbb.org', 'yellowpages.com', 'angieslist.com', 'amazon.com',
  'homedepot.com', 'lowes.com', 'wikipedia.org',
];

const BING_QUERIES = [
  'site:nextdoor.com "garage door" brooklyn OR queens OR bronx OR "long island" OR "new jersey"',
  'site:reddit.com "garage door" (broken OR stuck OR spring OR cable OR opener) (brooklyn OR queens OR bronx OR manhattan OR "long island" OR "new jersey")',
  '"garage door" (broken OR stuck OR "need repair" OR "not working" OR "won\'t open") (brooklyn OR queens OR bronx OR manhattan OR "long island" OR "staten island" OR "new jersey") -site:yelp.com -site:angi.com -site:thumbtack.com -site:homeadvisor.com',
  '"looking for" "garage door" (repair OR service OR fix OR company) (nyc OR brooklyn OR queens OR bronx OR "long island" OR "new jersey")',
  'site:facebook.com "garage door" (broken OR "need help" OR "recommend") brooklyn OR queens OR bronx',
];

// Serper fallback: Nextdoor + neighborhood forum queries
const SERPER_FALLBACK_QUERIES = [
  'site:nextdoor.com "garage door" (broken OR stuck OR repair OR recommend OR "need") (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island")',
  '"garage door" (broken OR "won\'t open" OR spring OR recommend OR "need someone") (brooklyn OR queens OR "long island" OR "new jersey") -site:yelp.com -site:angi.com -site:thumbtack.com -site:homeadvisor.com -site:reddit.com -site:facebook.com',
  '"garage door" (broken OR stuck OR "need help" OR recommend) ("brooklyn heights" OR "park slope" OR "crown heights" OR flushing OR astoria OR hoboken OR "jersey city" OR "bay ridge" OR "forest hills") -site:yelp.com -site:angi.com',
];

interface BingResult {
  name: string;
  url: string;
  snippet: string;
  dateLastCrawled?: string;
  datePublished?: string;
}

interface BingResponse {
  webPages?: { value?: BingResult[] };
}

function shouldSkip(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (SKIP_DOMAINS.some(d => host.includes(d))) return true;
    if (u.pathname === '/' || u.pathname === '') return true;
    return false;
  } catch { return false; }
}

async function bingSearch(query: string, apiKey: string): Promise<RawLead[]> {
  const params = new URLSearchParams({
    q: query, count: '10', mkt: 'en-US', freshness: 'Week', safeSearch: 'Off',
  });

  let response: Response;
  try {
    response = await fetch(`${BING_ENDPOINT}?${params}`, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    });
  } catch (err) {
    console.warn('[bing] fetch error:', err);
    return [];
  }

  if (!response.ok) { console.warn(`[bing] API error ${response.status}`); return []; }

  let json: BingResponse;
  try { json = await response.json() as BingResponse; } catch { return []; }

  const leads: RawLead[] = [];
  for (const item of json.webPages?.value ?? []) {
    const url = cleanUrl(item.url);
    if (shouldSkip(url)) continue;
    const rawDate = item.datePublished ?? item.dateLastCrawled;
    const { date: postedAt, accuracy } = resolveDate(rawDate);
    leads.push({
      title: item.name, url, snippet: item.snippet,
      postedAt, postedAtAccuracy: accuracy,
      matchedKeyword: query, rawMetadata: { source: 'bing' },
    });
  }
  return leads;
}

export async function fetchBingLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const bingKey = process.env.BING_API_KEY;
  const serperKey = process.env.SERPER_API_KEY;

  // ── Primary: Bing Search API ──────────────────────────────────────────────
  if (bingKey) {
    const results = await Promise.allSettled(BING_QUERIES.map(q => bingSearch(q, bingKey)));
    const allLeads = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const seen = new Set<string>();
    const deduped = allLeads.filter(l => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });
    return {
      sourceKey: 'bing',
      sourceName: 'Bing Search (Nextdoor/Reddit/Forums)',
      status: deduped.length > 0 ? 'Working' : 'Partial',
      leads: deduped,
      note: deduped.length === 0 ? 'Bing returned no results. BING_API_KEY may be invalid or quota exhausted.' : undefined,
      fetchedAt: new Date(),
    };
  }

  // ── Fallback: Serper with Nextdoor/forum-focused queries ──────────────────
  if (serperKey) {
    const leads = await runSerperQueries(SERPER_FALLBACK_QUERIES, serperKey);
    return {
      sourceKey: 'bing',
      sourceName: 'Nextdoor / Forums (via Google)',
      status: leads.length > 0 ? 'Working' : 'Partial',
      leads,
      note: leads.length === 0
        ? 'No Nextdoor/forum results found. Add BING_API_KEY for dedicated Bing search.'
        : 'Results via Google index. Add BING_API_KEY (free Azure F0) for native Bing coverage.',
      fetchedAt: new Date(),
    };
  }

  // ── No keys available ─────────────────────────────────────────────────────
  return {
    sourceKey: 'bing',
    sourceName: 'Bing Search (Nextdoor/Reddit/Forums)',
    status: 'Blocked',
    leads: [],
    note: 'Add BING_API_KEY to Vercel env vars. Free 1,000 searches/month: portal.azure.com → Create "Bing Search v7" → Free F0 tier.',
    fetchedAt: new Date(),
  };
}
