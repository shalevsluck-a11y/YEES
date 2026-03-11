/**
 * Reddit / Public Forums Source Adapter
 *
 * STATUS: Blocked
 *
 * Reddit's API now requires manual approval for new applications.
 * Submit a request at: https://support.reddithelp.com/hc/en-us/requests/new?ticket_form_id=14868593862164
 *
 * Until approved, this source is skipped to avoid wasting the Vercel
 * function timeout on requests that will be rejected.
 *
 * Alternative: The Bing fallback source (BING_API_KEY) will search Reddit
 * posts indirectly via Bing's index at no cost.
 */

import type { SourceResult } from '@/types/source';

export async function fetchForumLeads(
  _areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  return {
    sourceKey: 'reddit',
    sourceName: 'Reddit / Public Forums',
    status: 'Blocked',
    leads: [],
    note: 'Reddit API now requires manual approval for new apps. Skipped. The Bing source (set BING_API_KEY) searches Reddit posts indirectly through Bing\'s index.',
    fetchedAt: new Date(),
  };
}
