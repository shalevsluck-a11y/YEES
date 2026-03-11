import { NextRequest, NextResponse } from 'next/server';
import type { SearchFilters, SearchResponse, Lead } from '@/types/lead';
import type { SourceResult } from '@/types/source';

import { fetchCraigslistLeads } from '@/sources/craigslist';
import { fetchForumLeads } from '@/sources/forums';
import { fetchClassifiedLeads } from '@/sources/classifieds';
import { fetchOfferUpLeads } from '@/sources/offerup';
import { fetchFacebookLeads } from '@/sources/facebookPublic';
import { fetchYelpLeads } from '@/sources/yelpPublic';
import { fetchFallbackLeads } from '@/sources/fallbackDiscovery';

import { normalizeLead, sortLeads } from '@/lib/normalization';
import { deduplicateLeads } from '@/lib/dedup';
import { isWithinTimeFilter } from '@/lib/dateResolution';

// How many leads a source needs to return before we skip fallback
const FALLBACK_THRESHOLD = 5;

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
  const possibleCount = allLeads.filter(l => l.classification === 'Possible Lead').length;
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

// Run all relevant sources, catching individual failures
async function runSources(
  sourceFilter: string,
  areaKey: string,
  timeFilter: 'today' | 'this_week'
): Promise<SourceResult[]> {
  const shouldRun = (key: string) => sourceFilter === 'all' || sourceFilter === key;

  // Map of source key → fetch function
  const sourceFns: [string, () => Promise<SourceResult>][] = [
    ['craigslist', () => fetchCraigslistLeads(areaKey, timeFilter)],
    ['reddit', () => fetchForumLeads(areaKey, timeFilter)],
    ['classifieds', () => fetchClassifiedLeads(areaKey, timeFilter)],
    ['offerup', () => fetchOfferUpLeads(areaKey, timeFilter)],
    ['facebook', () => fetchFacebookLeads(areaKey, timeFilter)],
    ['yelp', () => fetchYelpLeads(areaKey, timeFilter)],
  ];

  // Run all sources concurrently with per-source timeout
  const results = await Promise.all(
    sourceFns
      .filter(([key]) => shouldRun(key))
      .map(([key, fn]) =>
        withTimeout(fn(), 30_000, key).catch(err => ({
          sourceKey: key,
          sourceName: key,
          status: 'Blocked' as const,
          leads: [],
          error: String(err),
          fetchedAt: new Date(),
        }))
      )
  );

  // Decide if fallback is needed
  const primaryLeadCount = results.reduce((sum, r) => sum + r.leads.length, 0);
  const needsFallback =
    (sourceFilter === 'all' || sourceFilter === 'fallback') &&
    primaryLeadCount < FALLBACK_THRESHOLD;

  if (needsFallback) {
    console.log(`[search] Primary sources returned ${primaryLeadCount} leads — running fallback.`);
    const fallbackResult = await withTimeout(
      fetchFallbackLeads(areaKey, timeFilter),
      30_000,
      'fallback'
    ).catch(err => ({
      sourceKey: 'fallback',
      sourceName: 'Fallback Discovery (Bing)',
      status: 'Blocked' as const,
      leads: [],
      error: String(err),
      fetchedAt: new Date(),
    }));
    results.push(fallbackResult);
  } else if (sourceFilter === 'fallback') {
    // User explicitly requested fallback source
    const fallbackResult = await withTimeout(
      fetchFallbackLeads(areaKey, timeFilter),
      30_000,
      'fallback'
    ).catch(err => ({
      sourceKey: 'fallback',
      sourceName: 'Fallback Discovery (Bing)',
      status: 'Blocked' as const,
      leads: [],
      error: String(err),
      fetchedAt: new Date(),
    }));
    results.push(fallbackResult);
  }

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
