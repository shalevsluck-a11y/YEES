/**
 * Bing Web Search Source Adapter
 *
 * STATUS: Requires BING_API_KEY env var
 *
 * Free tier: 1,000 searches/month at no cost (Azure Cognitive Services F0 plan).
 * Searches Bing's full index — includes Reddit threads, Nextdoor public posts,
 * local community forums, neighborhood Facebook pages (public), Patch.com, etc.
 *
 * Setup (5 minutes):
 *   1. Go to portal.azure.com → Create resource → "Bing Search v7"
 *   2. Choose Free (F0) tier → Create → copy the API Key
 *   3. Add BING_API_KEY to Vercel env vars → Redeploy
 */

import type { SourceResult, RawLead } from '@/types/source';
import { resolveDate } from '@/lib/dateResolution';
import { cleanUrl } from '@/lib/urlResolver';

const BING_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';

const SKIP_DOMAINS = [
  'yelp.com', 'angi.com', 'thumbtack.com', 'homeadvisor.com',
  'bbb.org', 'yellowpages.com', 'angieslist.com', 'amazon.com',
  'homedepot.com', 'lowes.com', 'wikipedia.org',
];

// Queries to run — Bing searches across Reddit, Nextdoor, forums, local news, etc.
const BING_QUERIES = [
  // Nextdoor public posts (many are indexed by Bing)
  'site:nextdoor.com "garage door" brooklyn OR queens OR bronx OR "long island" OR "new jersey"',
  // Reddit threads from the NYC area
  'site:reddit.com "garage door" (broken OR stuck OR spring OR cable OR opener) (brooklyn OR queens OR bronx OR manhattan OR "long island" OR "new jersey")',
  // Broad homeowner request search — Patch.com, local news sites, community boards
  '"garage door" (broken OR stuck OR "need repair" OR "not working" OR "won\'t open") (brooklyn OR queens OR bronx OR manhattan OR "long island" OR "staten island" OR "new jersey") -site:yelp.com -site:angi.com -site:thumbtack.com -site:homeadvisor.com',
  // Local community / neighborhood sites
  '"looking for" "garage door" (repair OR service OR fix OR company) (nyc OR brooklyn OR queens OR bronx OR "long island" OR "new jersey")',
  // Facebook public community page posts that Bing indexes
  'site:facebook.com "garage door" (broken OR "need help" OR "recommend") brooklyn OR queens OR bronx',
];

interface BingResult {
  name: string;
  url: string;
  snippet: string;
  dateLastCrawled?: string;
  datePublished?: string;
}

interface BingResponse {
  webPages?: {
    value?: BingResult[];
  };
}

function shouldSkip(url: string): boolean {
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

async function bingSearch(query: string, apiKey: string): Promise<RawLead[]> {
  const params = new URLSearchParams({
    q: query,
    count: '10',
    mkt: 'en-US',
    freshness: 'Week',   // Only results indexed in the past week
    safeSearch: 'Off',
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

  if (!response.ok) {
    console.warn(`[bing] API error ${response.status}`);
    return [];
  }

  let json: BingResponse;
  try {
    json = await response.json() as BingResponse;
  } catch {
    return [];
  }

  const leads: RawLead[] = [];
  for (const item of json.webPages?.value ?? []) {
    const url = cleanUrl(item.url);
    if (shouldSkip(url)) continue;

    const rawDate = item.datePublished ?? item.dateLastCrawled;
    const { date: postedAt, accuracy } = resolveDate(rawDate);

    leads.push({
      title: item.name,
      url,
      snippet: item.snippet,
      postedAt,
      postedAtAccuracy: accuracy,
      matchedKeyword: query,
      rawMetadata: { source: 'bing' },
    });
  }

  return leads;
}

export async function fetchBingLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const apiKey = process.env.BING_API_KEY;

  if (!apiKey) {
    return {
      sourceKey: 'bing',
      sourceName: 'Bing Search (Nextdoor/Reddit/Forums)',
      status: 'Blocked',
      leads: [],
      note: 'Add BING_API_KEY to Vercel env vars. Free 1,000 searches/month: portal.azure.com → Create "Bing Search v7" → Free F0 tier.',
      fetchedAt: new Date(),
    };
  }

  const results = await Promise.allSettled(
    BING_QUERIES.map(q => bingSearch(q, apiKey))
  );

  const allLeads = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  // Deduplicate by URL
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
