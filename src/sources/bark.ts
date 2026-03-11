/**
 * Service Marketplaces Source Adapter
 *
 * STATUS: Working (uses SERPER_API_KEY — same key as Google Search)
 *
 * Covers service marketplace sites where homeowners post job requests:
 *   - Bark.com — customer enquiry pages
 *   - TaskRabbit — public task listings
 *   - Thumbtack — customer project request pages
 *   - Angi — project/cost request pages
 *
 * Direct scraping of these sites fails from Vercel (JS rendering required).
 * Workaround: search them via Google/Serper (site: queries).
 */

import type { SourceResult } from '@/types/source';
import { runSerperQueries } from '@/lib/serperSearch';

const MARKETPLACE_QUERIES = [
  // Bark.com customer enquiry pages (publicly indexed when not behind paywall)
  'site:bark.com "garage door" (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island" OR nyc OR "new york")',

  // TaskRabbit public task listings
  'site:taskrabbit.com "garage door" (repair OR install OR spring OR opener OR broken) (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR nyc)',

  // Thumbtack project request pages — these show real customer requests
  'site:thumbtack.com "garage door" (repair OR install OR broken OR spring OR opener) (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR nyc)',

  // Angi project pages — customer cost requests by location
  'site:angi.com "garage door" (repair OR installation OR spring OR opener) (brooklyn OR queens OR "long island" OR "new jersey" OR nyc)',
];

export async function fetchBarkLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    return {
      sourceKey: 'bark',
      sourceName: 'Service Marketplaces (Bark/TaskRabbit/Thumbtack)',
      status: 'Blocked',
      leads: [],
      note: 'Requires SERPER_API_KEY (same key as Google Search). Marketplace sites require JS rendering for direct access; this source searches them via Google index.',
      fetchedAt: new Date(),
    };
  }

  const leads = await runSerperQueries(MARKETPLACE_QUERIES, apiKey);

  return {
    sourceKey: 'bark',
    sourceName: 'Service Marketplaces (Bark/TaskRabbit/Thumbtack)',
    status: leads.length > 0 ? 'Working' : 'Partial',
    leads,
    note: leads.length === 0
      ? 'No marketplace results found this week. Google may not have indexed recent job requests yet.'
      : undefined,
    fetchedAt: new Date(),
  };
}
