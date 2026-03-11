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

// ─── Search queries ───────────────────────────────────────────────────────────
//
// STRATEGY: Every query is built so that Google only returns pages where
// "garage door" is central to the page — not in a sidebar ad. We achieve
// this by combining garage terms with strong homeowner-intent signals and
// restricting to platforms where homeowners actually post.
//
// 11 queries × 10 results = up to 110 raw candidates (deduped before scoring).

const SEARCH_QUERIES = [
  // ── Craigslist labor-gigs section (/lbg) — homeowners requesting work ──────
  // The /lbg path is the "Labor Gigs" board where HOMEOWNERS post tasks they
  // need done. /svc is contractors advertising. We target /lbg exclusively
  // and exclude hiring/employment language to prevent job ads from sneaking in.
  'site:craigslist.org/lbg "garage door" (broken OR stuck OR spring OR "won\'t open" OR "need help")',
  'site:craigslist.org "garage door" ("need" OR "looking for" OR "can anyone") -"will train" -"general labor" -"we are hiring" -"apply now" -"full time" -"part time"',

  // ── Reddit homeowner help threads ─────────────────────────────────────────
  // Restrict to posts where garage door IS the topic (not incidentally mentioned).
  // Titles on Reddit threads always start with the problem, so a title-containing
  // garage term is a strong signal the post is about garage door service.
  'site:reddit.com "garage door" (broken OR stuck OR "not working" OR "won\'t open" OR spring OR cable) (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island" OR nyc) -intitle:"how to fix" -intitle:"DIY guide"',
  'site:reddit.com intitle:"garage door" (broken OR stuck OR spring OR repair OR help OR recommend)',

  // ── Facebook public groups / community pages ──────────────────────────────
  // Google indexes many public Facebook Group posts. Neighborhood pages
  // frequently have homeowners asking for contractor recommendations.
  'site:facebook.com intitle:"garage door" (broken OR stuck OR "need" OR "recommend" OR "won\'t open") (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island")',
  'site:facebook.com "garage door" ("can anyone recommend" OR "looking for" OR "need someone to fix" OR "need a good" OR "spring broke" OR "cable broke") (nyc OR brooklyn OR queens OR "long island" OR "new jersey")',

  // ── Nextdoor (public posts indexed by Google) ─────────────────────────────
  'site:nextdoor.com "garage door" (broken OR stuck OR "need" OR "recommend" OR repair) (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island")',

  // ── Patch.com community / classifieds ────────────────────────────────────
  // Restrict to posts where the title mentions garage door to avoid news articles
  // where "garage door" only appears in a sidebar ad.
  'site:patch.com intitle:"garage door" (broken OR stuck OR repair OR spring OR "won\'t open" OR need)',

  // ── Open web: personal first-person language (never appears on contractor sites)
  '("my garage door" OR "our garage door") (broken OR "won\'t open" OR "won\'t close" OR stuck OR "spring broke" OR "cable broke" OR "off track") (brooklyn OR queens OR bronx OR nyc OR "long island" OR "new jersey" OR "staten island") -site:yelp.com -site:angi.com -site:thumbtack.com -site:homeadvisor.com -site:houzz.com',

  // ── Neighbor recommendation requests (highest intent — actively choosing) ──
  '("recommend" OR "can anyone suggest" OR "who do you use" OR "looking for a good") "garage door" (repair OR company OR service OR tech) (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island") -site:yelp.com -site:angi.com -site:thumbtack.com',

  // ── Twitter/X public posts (Google indexes public tweets) ─────────────────
  '(site:twitter.com OR site:x.com) "garage door" (broken OR stuck OR "spring broke" OR "won\'t open" OR "need help") (brooklyn OR queens OR bronx OR nyc OR "long island" OR "new jersey")',
];

// ─── Domain skip list ─────────────────────────────────────────────────────────
// Business directories and contractor listing sites — never homeowner posts.

const SKIP_DOMAINS = [
  'yelp.com', 'angi.com', 'thumbtack.com', 'homeadvisor.com',
  'houzz.com', 'bbb.org', 'yellowpages.com', 'angieslist.com',
  'amazon.com', 'homedepot.com', 'lowes.com', 'wikipedia.org',
  'fixr.com', 'costimates.com', 'improvenet.com', 'porch.com',
  'networx.com', 'manta.com', 'superpages.com', 'citysearch.com',
  'bobvila.com', 'thisoldhouse.com', 'familyhandyman.com',
  'houselogic.com', 'doityourself.com', 'hunker.com',
  'indeed.com', 'ziprecruiter.com', 'monster.com', 'glassdoor.com',
];

// ─── Title relevance guard ────────────────────────────────────────────────────
// Google sometimes returns pages where "garage door" appears only in a sidebar
// ad while the page itself is completely unrelated (e.g., a news article about
// a celebrity). The TITLE of a genuine homeowner post always mentions the
// problem, so we require the title to contain a garage-related term.
// If the title doesn't say "garage", it's almost certainly not a homeowner post.

const TITLE_GARAGE_TERMS = [
  'garage', 'overhead door', 'opener', 'torsion spring', 'door spring',
];

function titleHasGarageContext(title: string): boolean {
  const lower = title.toLowerCase();
  return TITLE_GARAGE_TERMS.some(t => lower.includes(t));
}

// ─── Job posting filter ───────────────────────────────────────────────────────
// Craigslist labor gigs include both homeowner task posts AND employer job ads.
// These signals reliably identify employer job postings, not homeowner requests.

const JOB_POST_SIGNALS = [
  'will train', 'we are hiring', 'help wanted', 'job listing', 'apply now',
  'monday through friday', 'hiring now', 'full-time', 'part-time',
  'full time employee', 'part time employee', 'benefits include',
  'submit your resume', 'send resume', 'per hour', 'hourly rate',
  'weekends required', 'driver license required', 'background check required',
];

function isJobPosting(title: string, snippet: string): boolean {
  const text = `${title} ${snippet}`.toLowerCase();
  return JOB_POST_SIGNALS.some(s => text.includes(s));
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

      // ── Title must mention garage — filters out unrelated pages where
      //    "garage door" only appears in sidebar ads (e.g., news articles) ──
      if (!titleHasGarageContext(item.title)) continue;

      // ── Skip employer job ads masquerading as gig posts ──
      if (isJobPosting(item.title, item.snippet)) continue;

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
