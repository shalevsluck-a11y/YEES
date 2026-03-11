/**
 * Yelp Source Adapter
 *
 * STATUS: Partial
 *
 * Yelp's "Request-a-Quote" system is entirely behind login —
 * there is no public-facing request board for homeowners.
 *
 * What IS publicly accessible:
 *   - Business listings (not what we want — these are competitors)
 *   - Public reviews (not useful for leads)
 *
 * We attempt to search Yelp for "garage door" in our service area
 * and return only results that look like homeowner posts or Q&A,
 * not business listings.
 *
 * In practice, this source returns very little useful data.
 * It is included for completeness and marked Partial.
 */

import type { SourceResult } from '@/types/source';

export async function fetchYelpLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  // Yelp's search results are business listings, not homeowner requests.
  // We don't want to return competitor ads.
  // Return Partial with explanation.

  return {
    sourceKey: 'yelp',
    sourceName: 'Yelp',
    status: 'Partial',
    leads: [],
    note: 'Yelp\'s Request-a-Quote is behind login. Public Yelp pages only contain business listings (competitors), not customer requests. Not a useful lead source without API access.',
    fetchedAt: new Date(),
  };
}
