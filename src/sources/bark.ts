/**
 * Bark.com Source Adapter
 *
 * STATUS: Working (uses SERPER_API_KEY — same key as Google Search)
 *
 * Bark.com requires JavaScript rendering to load customer requests.
 * Direct scraping from Vercel always returns an empty JS shell.
 * Workaround: Google indexes Bark's public customer enquiry pages.
 * We search them via Serper (site:bark.com queries).
 *
 * Bark pages that are publicly indexed often contain the customer's
 * request text, location, and date — exactly what we need.
 */

import type { SourceResult } from '@/types/source';
import { runSerperQueries } from '@/lib/serperSearch';

const BARK_QUERIES = [
  // Bark customer enquiry pages indexed by Google
  'site:bark.com "garage door" (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island" OR nyc OR "new york")',
  'site:bark.com "garage" (repair OR install OR broken OR spring OR opener) ("new york" OR "new jersey" OR brooklyn OR queens OR "long island")',
];

export async function fetchBarkLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    return {
      sourceKey: 'bark',
      sourceName: 'Bark.com (Service Requests)',
      status: 'Blocked',
      leads: [],
      note: 'Requires SERPER_API_KEY (same key as Google Search). Bark.com requires JS rendering for direct access; this source searches Bark via Google index.',
      fetchedAt: new Date(),
    };
  }

  const leads = await runSerperQueries(BARK_QUERIES, apiKey);

  return {
    sourceKey: 'bark',
    sourceName: 'Bark.com (Service Requests)',
    status: leads.length > 0 ? 'Working' : 'Partial',
    leads,
    note: leads.length === 0
      ? 'No Bark.com results found this week. Google may not have indexed recent Bark enquiries yet.'
      : undefined,
    fetchedAt: new Date(),
  };
}
