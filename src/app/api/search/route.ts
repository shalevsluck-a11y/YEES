import { NextRequest, NextResponse } from 'next/server';
import type { SearchFilters, SearchResponse, Lead } from '@/types/lead';
import type { SourceResult } from '@/types/source';

// Tell Vercel to allow up to 60s for this function (requires Pro plan).
// On Hobby plan Vercel caps at 10s — upgrade to Pro for full functionality.
export const maxDuration = 60;

// Active sources — all return real leads without requiring login
import { fetchCraigslistLeads } from '@/sources/craigslist';
import { fetchForumLeads }      from '@/sources/forums';
import { fetchClassifiedLeads } from '@/sources/classifieds';
import { fetchBingLeads }       from '@/sources/bing';
import { fetchBarkLeads }       from '@/sources/bark';
import { fetchPatchLeads }      from '@/sources/patch';
import { fetchFallbackLeads }   from '@/sources/fallbackDiscovery';

// Removed sources (permanently blocked — no public access):
//   Facebook Marketplace  → covered via site:facebook.com queries in Bing + Serper
//   OfferUp               → requires JS rendering + Cloudflare, no public API
//   Yelp                  → returns only competitor business listings, not homeowner requests

import { normalizeLead, sortLeads } from '@/lib/normalization';
import { deduplicateLeads } from '@/lib/dedup';
import { isWithinTimeFilter } from '@/lib/dateResolution';


export async function POST(req: NextRequest) {
  let filters: SearchFilters;

  try {
    filters = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { timeFilter, areaFilter, sourceFilter, hideBusinessAds, freshestFirst, deduplicateResults } = filters;

  // Run sources concurrently, but with a timeout wrapper per source
  const sourceResults = await runSources(sourceFilter, areaFilter, timeFilter);

  // Normalize all raw leads into the unified Lead format
  let allLeads: Lead[] = [];

  for (const sourceResult of sourceResults) {
    for (const rawLead of sourceResult.leads) {
      const lead = normalizeLead(rawLead, {
        source: sourceResult.sourceName,
        sourceStatus: sourceResult.status,
        areaKey: areaFilter,
        timeFilter,
        isFallbackDiscovered: sourceResult.sourceKey === 'fallback',
      });
      allLeads.push(lead);
    }
  }

  // Filter by time window
  allLeads = allLeads.filter(lead => {
    const date = lead.postedAt ? new Date(lead.postedAt) : null;
    return isWithinTimeFilter(date, lead.postedAtAccuracy, timeFilter);
  });

  // Deduplicate if requested
  if (deduplicateResults) {
    allLeads = deduplicateLeads(allLeads);
  }

  // Sort
  allLeads = sortLeads(allLeads, freshestFirst);

  // Counts before filtering
  const veryLikelyCount = allLeads.filter(l => l.classification === 'Very Likely Lead').length;
  const possibleCount   = allLeads.filter(l => l.classification === 'Possible Lead').length;
  const businessAdCount = allLeads.filter(l => l.classification === 'Business Ad / Ignore').length;

  // Filter out business ads if requested
  if (hideBusinessAds) {
    allLeads = allLeads.filter(l => l.classification !== 'Business Ad / Ignore');
  }

  // Build source status summaries
  const sourceStatuses = sourceResults.map(sr => ({
    sourceKey: sr.sourceKey,
    sourceName: sr.sourceName,
    status: sr.status,
    leadsFound: sr.leads.length,
    error: sr.error,
    note: sr.note,
  }));

  const response: SearchResponse = {
    leads: allLeads,
    sourceStatuses,
    totalFound: allLeads.length,
    veryLikelyCount,
    possibleCount,
    businessAdCount,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}

// Run all active sources in parallel, each with a per-source timeout
async function runSources(
  sourceFilter: string,
  areaKey: string,
  timeFilter: 'today' | 'this_week'
): Promise<SourceResult[]> {
  const shouldRun = (key: string) => sourceFilter === 'all' || sourceFilter === key;

  const sourceFns: [string, () => Promise<SourceResult>][] = [
    ['craigslist', () => fetchCraigslistLeads(areaKey, timeFilter)],
    ['reddit',     () => fetchForumLeads(areaKey, timeFilter)],
    ['classifieds',() => fetchClassifiedLeads(areaKey, timeFilter)],
    ['bing',       () => fetchBingLeads(areaKey, timeFilter)],
    ['bark',       () => fetchBarkLeads(areaKey, timeFilter)],
    ['patch',      () => fetchPatchLeads(areaKey, timeFilter)],
    ['fallback',   () => fetchFallbackLeads(areaKey, timeFilter)],
  ];

  const results = await Promise.all(
    sourceFns
      .filter(([key]) => shouldRun(key))
      .map(([key, fn]) =>
        withTimeout(fn(), 8_000, key).catch(err => ({
          sourceKey: key,
          sourceName: key,
          status: 'Blocked' as const,
          leads: [],
          error: String(err),
          fetchedAt: new Date(),
        }))
      )
  );

  return results;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Source "${label}" timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      val => { clearTimeout(timer); resolve(val); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}
