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

// ─── Search queries ──────────────────────────────────────────────────────────
// Each query is purpose-built to return homeowner posts, not contractor pages.
// We run them all in parallel (11 queries × 10 results = up to 110 raw results).

const SEARCH_QUERIES = [
  // ── Craigslist gigs section (homeowners post here when they need work done)
  'site:craigslist.org "garage door" ("broken" OR "stuck" OR "spring" OR "won\'t open")',
  'site:craigslist.org "garage door" ("need" OR "looking for" OR "help wanted" OR "can anyone")',

  // ── Reddit homeowner help threads (local subreddits + r/HomeImprovement)
  'site:reddit.com "garage door" (broken OR stuck OR "not working" OR "won\'t open") (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island" OR nyc)',
  'site:reddit.com ("my garage door" OR "our garage door") (broken OR stuck OR spring OR cable OR "off track" OR "won\'t open") -intitle:"how to fix" -intitle:"DIY"',

  // ── Nextdoor public posts (neighborhood requests, often indexed by Google)
  'site:nextdoor.com "garage door" (broken OR stuck OR "need" OR "recommend" OR "repair") (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island")',

  // ── Facebook public groups and community pages (Google indexes public FB posts)
  'site:facebook.com "garage door" (broken OR "won\'t open" OR stuck OR "need someone" OR "can anyone recommend") (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island")',
  'site:facebook.com ("need a garage door" OR "garage door broken" OR "garage door stuck" OR "recommend a garage door") (nyc OR "new york" OR "new jersey" OR brooklyn OR queens)',

  // ── Patch.com local classifieds / community posts
  'site:patch.com "garage door" (broken OR stuck OR "need help" OR spring OR "won\'t open") (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island")',

  // ── Bark.com / TaskRabbit / Thumbtack customer request pages
  'site:bark.com "garage door" (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island" OR "new york")',

  // ── Open web: strong homeowner-intent phrasing (personal language, not ads)
  '("my garage door" OR "our garage door") (broken OR "won\'t open" OR "won\'t close" OR stuck OR "spring broke" OR "cable broke" OR "off track") (brooklyn OR queens OR bronx OR nyc OR "long island" OR "new jersey" OR "staten island") -site:yelp.com -site:angi.com -site:thumbtack.com -site:homeadvisor.com -site:houzz.com',

  // ── Neighbor recommendation requests (high-value: person actively choosing a contractor)
  '("recommend" OR "looking for" OR "can anyone suggest" OR "who do you use") "garage door" (repair OR fix OR service OR company) (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island") -site:yelp.com -site:angi.com',
];

// ─── Domain skip list ────────────────────────────────────────────────────────
// Contractor directories and business listing sites — never homeowner posts

const SKIP_DOMAINS = [
  'yelp.com', 'angi.com', 'thumbtack.com', 'homeadvisor.com',
  'houzz.com', 'bbb.org', 'yellowpages.com', 'angieslist.com',
  'amazon.com', 'homedepot.com', 'lowes.com', 'wikipedia.org',
  'fixr.com', 'costimates.com', 'improvenet.com', 'porch.com',
  'networx.com', 'manta.com', 'superpages.com', 'citysearch.com',
  'bobvila.com', 'thisoldhouse.com', 'familyhandyman.com',
  'houselogic.com', 'doityourself.com', 'hunker.com', 'hunterdon.com',
];

// ─── Relevance guard ─────────────────────────────────────────────────────────
// Google sometimes returns pages where "garage door" appears only in an ad/sidebar.
// Require the title OR snippet to contain a garage-related term.

const RELEVANCE_TERMS = [
  'garage', 'overhead door', 'opener', 'spring', 'door repair',
];

function isGarageRelevant(title: string, snippet: string): boolean {
  const text = `${title} ${snippet}`.toLowerCase();
  return RELEVANCE_TERMS.some(t => text.includes(t));
}

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

      // ── Relevance guard: skip if title+snippet have nothing garage-related ──
      if (!isGarageRelevant(item.title, item.snippet)) continue;

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
