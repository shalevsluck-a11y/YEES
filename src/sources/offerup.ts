/**
 * OfferUp Source Adapter
 *
 * STATUS: Blocked
 *
 * OfferUp actively blocks automated access:
 *   - Requires JavaScript rendering (React SPA)
 *   - Implements bot detection (Cloudflare, fingerprinting)
 *   - No public RSS or JSON API
 *   - Login required for contact info
 *
 * This adapter returns a Blocked status immediately.
 * Phase 2 could potentially use a headless browser service (Puppeteer/Playwright)
 * to access OfferUp, but that adds significant complexity and hosting cost.
 *
 * Do NOT fake support for this source.
 */

import type { SourceResult } from '@/types/source';

export async function fetchOfferUpLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  return {
    sourceKey: 'offerup',
    sourceName: 'OfferUp',
    status: 'Blocked',
    leads: [],
    note: 'OfferUp requires JavaScript rendering and blocks automated access. No public API available. Phase 2: could use headless browser.',
    fetchedAt: new Date(),
  };
}
