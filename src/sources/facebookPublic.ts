/**
 * Facebook — DISABLED. Login required for all access. Returns 0 leads.
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
    note: 'Facebook requires login for all access. Disabled.',
    fetchedAt: new Date(),
  };
}
