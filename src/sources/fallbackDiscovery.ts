/**
 * Web Search Source Adapter (Serper.dev — Google Search API)
 *
 * STATUS: Working (requires SERPER_API_KEY env var)
 *
 * Uses Serper.dev — returns Google search results via clean API.
 * Free tier: 2,500 searches, no credit card required.
 *
 * Setup (2 minutes):
 *   1. Go to serper.dev → sign up with email
 *   2. Copy your API key from the dashboard
 *   3. Add SERPER_API_KEY to Vercel env vars → Redeploy
 */

import type { SourceResult, RawLead } from '@/types/source';
import { resolveDate } from '@/lib/dateResolution';
import { cleanUrl } from '@/lib/urlResolver';

const SEARCH_QUERIES = [
  'site:craigslist.org "garage door" "broken" OR "stuck" OR "spring"',
  'site:craigslist.org "garage door" "need" OR "looking for" OR "help"',
  'site:reddit.com "garage door" broken OR stuck "brooklyn" OR "queens" OR "bronx" OR "long island" OR "new jersey"',
  '"garage door" broken OR stuck "brooklyn" OR "queens" OR "bronx" OR "long island" -site:yelp.com -site:angi.com -site:thumbtack.com',
];

const SKIP_DOMAINS = [
  'yelp.com', 'angi.com', 'thumbtack.com', 'homeadvisor.com',
  'houzz.com', 'bbb.org', 'yellowpages.com', 'angieslist.com',
];

function shouldSkipUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    return SKIP_DOMAINS.some(d => host.includes(d)) || u.pathname === '/' || u.pathname === '';
  } catch {
    return false;
  }
}

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

interface SerperResponse {
  organic?: SerperResult[];
}

async function serperSearch(query: string, apiKey: string): Promise<RawLead[]> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: 10, tbs: 'qdr:w' }), // past week
  });

  if (!response.ok) {
    console.warn(`[serper] API failed (${response.status})`);
    return [];
  }

  try {
    const json = await response.json() as SerperResponse;
    const leads: RawLead[] = [];

    for (const item of json.organic ?? []) {
      const cleanedUrl = cleanUrl(item.link);
      if (shouldSkipUrl(cleanedUrl)) continue;

      const { date: postedAt, accuracy } = resolveDate(item.date);

      leads.push({
        title: item.title,
        url: cleanedUrl,
        snippet: item.snippet,
        postedAt,
        postedAtAccuracy: accuracy,
        matchedKeyword: query,
        rawMetadata: { source: 'serper' },
      });
    }

    return leads;
  } catch (err) {
    console.error('[serper] parse error:', err);
    return [];
  }
}

export async function fetchFallbackLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    return {
      sourceKey: 'fallback',
      sourceName: 'Google Search',
      status: 'Blocked',
      leads: [],
      note: 'Add SERPER_API_KEY to Vercel env vars. Free at serper.dev (2,500 searches, no credit card).',
      fetchedAt: new Date(),
    };
  }

  const results = await Promise.all(
    SEARCH_QUERIES.map(q => serperSearch(q, apiKey).catch(() => [] as RawLead[]))
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
    note: dedupedLeads.length === 0 ? 'No results found. Your SERPER_API_KEY may be invalid or exhausted.' : undefined,
    fetchedAt: new Date(),
  };
}
