/**
 * Reddit / Public Forums Source Adapter
 *
 * STATUS: Working (uses SERPER_API_KEY — same key as Google Search)
 *
 * Reddit's JSON API is blocked from Vercel datacenter IPs.
 * Workaround: Google indexes Reddit posts. We search Reddit via Serper
 * (site:reddit.com queries) which works from any IP.
 *
 * Subreddits targeted: r/HomeImprovement, r/DIY, r/garagedoorservice,
 * plus local subs: r/nyc, r/brooklyn, r/queens, r/longisland, r/newjersey
 */

import type { SourceResult } from '@/types/source';
import { runSerperQueries } from '@/lib/serperSearch';

const REDDIT_QUERIES = [
  // r/HomeImprovement and r/DIY — most homeowner garage requests go here
  'site:reddit.com/r/HomeImprovement "garage door" (broken OR stuck OR spring OR cable OR "won\'t open" OR "off track" OR repair OR recommend)',
  'site:reddit.com/r/DIY "garage door" (broken OR stuck OR spring OR cable OR "won\'t open" OR repair)',

  // r/garagedoorservice — dedicated subreddit for this exact service
  'site:reddit.com/r/garagedoorservice (broken OR stuck OR spring OR help OR recommend OR repair OR install)',

  // NYC/NJ local subreddits — homeowners asking neighbors for recommendations
  'site:reddit.com "garage door" (broken OR stuck OR "won\'t open" OR spring OR recommend OR "need help") (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR nyc OR "staten island")',
];

export async function fetchForumLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    return {
      sourceKey: 'reddit',
      sourceName: 'Reddit / Public Forums',
      status: 'Blocked',
      leads: [],
      note: 'Requires SERPER_API_KEY (same key as Google Search). Reddit direct API is blocked from Vercel IPs; this source searches Reddit via Google index.',
      fetchedAt: new Date(),
    };
  }

  const leads = await runSerperQueries(REDDIT_QUERIES, apiKey);

  return {
    sourceKey: 'reddit',
    sourceName: 'Reddit / Public Forums',
    status: leads.length > 0 ? 'Working' : 'Partial',
    leads,
    note: leads.length === 0
      ? 'No Reddit results found this week. Try again later or check SERPER_API_KEY quota.'
      : undefined,
    fetchedAt: new Date(),
  };
}
