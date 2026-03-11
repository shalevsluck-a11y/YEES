/**
 * Public Classifieds Source Adapter
 *
 * STATUS: Working (uses SERPER_API_KEY — same key as Google Search)
 *
 * Locanto, Oodle, Geebo, Hoobly all block scrapers or require JS rendering.
 * Direct HTML scraping from Vercel returns nothing usable.
 * Workaround: Search these sites (plus Craigslist gigs) via Google/Serper.
 *
 * This source covers:
 *   - Craigslist gigs/labor section (homeowner task posts)
 *   - Locanto classifieds
 *   - TaskRabbit public request pages
 *   - Nextdoor public posts (supplement to Google Search source)
 *   - General classifieds searches
 */

import type { SourceResult } from '@/types/source';
import { runSerperQueries } from '@/lib/serperSearch';

const CLASSIFIEDS_QUERIES = [
  // Craigslist labor gigs — homeowners posting tasks they need done
  'site:craigslist.org "garage door" (broken OR stuck OR spring OR "need help" OR "looking for" OR "won\'t open") (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island") -"will train" -"general labor" -"hiring"',

  // Locanto NYC classifieds
  'site:locanto.com "garage door" (repair OR broken OR stuck OR spring OR install) ("new york" OR brooklyn OR queens OR bronx OR "long island" OR "new jersey")',

  // TaskRabbit public task request pages
  'site:taskrabbit.com "garage door" (repair OR install OR broken OR spring OR opener) (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR nyc)',

  // Geebo / Hoobly / other free classifieds
  '(site:geebo.com OR site:hoobly.com OR site:oodle.com) "garage door" (repair OR broken OR stuck OR help) ("new york" OR brooklyn OR queens OR "new jersey")',
];

export async function fetchClassifiedLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    return {
      sourceKey: 'classifieds',
      sourceName: 'Classifieds (Craigslist/TaskRabbit/Locanto)',
      status: 'Blocked',
      leads: [],
      note: 'Requires SERPER_API_KEY (same key as Google Search). Classifieds sites block direct scraping from Vercel; this source searches them via Google index.',
      fetchedAt: new Date(),
    };
  }

  const leads = await runSerperQueries(CLASSIFIEDS_QUERIES, apiKey);

  return {
    sourceKey: 'classifieds',
    sourceName: 'Classifieds (Craigslist/TaskRabbit/Locanto)',
    status: leads.length > 0 ? 'Working' : 'Partial',
    leads,
    note: leads.length === 0
      ? 'No classifieds results found this week. Google may not have indexed recent posts yet.'
      : undefined,
    fetchedAt: new Date(),
  };
}
