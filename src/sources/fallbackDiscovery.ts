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
  // Craigslist gigs — homeowners posting directly
  'site:craigslist.org "garage door" "broken" OR "stuck" OR "spring"',
  'site:craigslist.org "garage door" "need" OR "looking for" OR "help"',

  // Reddit homeowner posts in local subs
  'site:reddit.com "garage door" broken OR stuck "brooklyn" OR "queens" OR "bronx" OR "long island" OR "new jersey"',
  'site:reddit.com "my garage door" (broken OR stuck OR "not working" OR "won\'t open" OR spring OR cable) -"how to fix" -"i fixed"',

  // Patch.com local classifieds and community posts
  'site:patch.com "garage door" (broken OR stuck OR repair OR spring OR "need help") (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island")',

  // Nextdoor public posts indexed by Google
  'site:nextdoor.com "garage door" (broken OR stuck OR repair OR "need") (brooklyn OR queens OR "long island" OR "new jersey")',

  // Bark.com customer service requests
  'site:bark.com "garage door" (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "new york")',

  // Facebook public community groups (Google indexes some)
  'site:facebook.com "garage door" (broken OR "need repair" OR "recommend") (brooklyn OR queens OR "new york" OR "new jersey")',

  // Broad homeowner-intent search — catches anything not on directories
  '"my garage door" (broken OR "won\'t open" OR stuck OR "off track" OR "spring broke" OR "cable broke") (brooklyn OR queens OR bronx OR nyc OR "long island" OR "new jersey") -site:yelp.com -site:angi.com -site:thumbtack.com -site:homeadvisor.com',

  // Local community boards / neighborhood forums
  '"looking for" "garage door" (repair OR fix OR service) (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island") -site:yelp.com -site:angi.com',

  // General fresh posts with strong homeowner intent signals
  '"garage door" ("broken spring" OR "broken cable" OR "off track" OR "won\'t close" OR "won\'t open" OR "stuck open" OR "stuck closed") (nyc OR brooklyn OR queens OR bronx OR "long island" OR "new jersey")',
];

const SKIP_DOMAINS = [
  'yelp.com', 'angi.com', 'thumbtack.com', 'homeadvisor.com',
  'houzz.com', 'bbb.org', 'yellowpages.com', 'angieslist.com',
  'amazon.com', 'homedepot.com', 'lowes.com', 'wikipedia.org',
  'fixr.com', 'costimates.com', 'improvenet.com', 'porch.com',
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
