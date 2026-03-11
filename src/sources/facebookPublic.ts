/**
 * Facebook Marketplace / Public Posts Source Adapter
 *
 * STATUS: Blocked
 *
 * Facebook requires login for ALL access to:
 *   - Marketplace listings
 *   - Group posts
 *   - Neighborhood posts
 *
 * There is no public API or unauthenticated access point.
 * Meta actively blocks scrapers and regularly updates bot detection.
 *
 * This adapter returns Blocked status immediately.
 *
 * Do NOT fake support for this source.
 */

import type { SourceResult } from '@/types/source';

export async function fetchFacebookLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  return {
    sourceKey: 'facebook',
    sourceName: 'Facebook Marketplace',
    status: 'Blocked',
    leads: [],
    note: 'Facebook requires login for all Marketplace and group access. Cannot be scraped publicly. No workaround available without violating Facebook ToS.',
    fetchedAt: new Date(),
  };
}
