/**
 * Google Search Source Adapter (Serper.dev)
 *
 * STATUS: Working (requires SERPER_API_KEY env var)
 *
 * Covers sources not handled by dedicated adapters:
 *   - Facebook public groups / neighborhood pages
 *   - Nextdoor public posts
 *   - Twitter/X public posts
 *   - Open web (personal homeowner language, not tied to one platform)
 *
 * Reddit → handled by forums.ts
 * Craigslist/TaskRabbit/Locanto → handled by classifieds.ts
 * Bark.com → handled by bark.ts
 *
 * Setup (2 minutes):
 *   1. Go to serper.dev → sign up with email
 *   2. Copy your API key from the dashboard
 *   3. Add SERPER_API_KEY to Vercel env vars → Redeploy
 */

import type { SourceResult } from '@/types/source';
import { runSerperQueries } from '@/lib/serperSearch';

const SEARCH_QUERIES = [
  // ── Facebook public groups / community pages ───────────────────────────────
  // Do NOT use intitle: — Facebook HTML page titles are "Facebook" or group name.
  'site:facebook.com "garage door" (broken OR stuck OR "won\'t open" OR "need someone" OR "can anyone recommend" OR "spring broke") (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island")',
  'site:facebook.com "garage door" ("looking for" OR "need a good" OR "recommend" OR "cable broke" OR "off track") (nyc OR brooklyn OR queens OR "long island" OR "new jersey" OR "staten island")',

  // ── Nextdoor public posts indexed by Google ────────────────────────────────
  'site:nextdoor.com "garage door" (broken OR stuck OR "need" OR "recommend" OR repair) (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island")',

  // ── Twitter/X public posts ─────────────────────────────────────────────────
  '(site:twitter.com OR site:x.com) "garage door" (broken OR stuck OR "spring broke" OR "won\'t open" OR "need help") (brooklyn OR queens OR bronx OR nyc OR "long island" OR "new jersey")',

  // ── Open web: personal first-person language ───────────────────────────────
  // "my garage door" / "our garage door" never appears on contractor ad pages
  '("my garage door" OR "our garage door") (broken OR "won\'t open" OR "won\'t close" OR stuck OR "spring broke" OR "cable broke" OR "off track") (brooklyn OR queens OR bronx OR nyc OR "long island" OR "new jersey" OR "staten island") -site:yelp.com -site:angi.com -site:thumbtack.com -site:homeadvisor.com -site:houzz.com',

  // ── Recommendation requests (person actively choosing a contractor) ─────────
  '("recommend" OR "can anyone suggest" OR "who do you use" OR "looking for a good") "garage door" (repair OR company OR service OR tech) (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island") -site:yelp.com -site:angi.com -site:thumbtack.com',

  // ── Patch.com community posts ──────────────────────────────────────────────
  'site:patch.com "garage door" (broken OR stuck OR repair OR spring OR "won\'t open" OR need OR recommend) (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island")',
];

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

  const leads = await runSerperQueries(SEARCH_QUERIES, apiKey);

  return {
    sourceKey: 'fallback',
    sourceName: 'Google Search',
    status: leads.length > 0 ? 'Working' : 'Partial',
    leads,
    note: leads.length === 0 ? 'No results found. Your SERPER_API_KEY may be invalid or exhausted.' : undefined,
    fetchedAt: new Date(),
  };
}
