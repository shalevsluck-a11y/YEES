import { v4 as uuidv4 } from 'uuid';
import type { Lead, SourceStatus, DateAccuracy } from '@/types/lead';
import type { RawLead } from '@/types/source';
import { scoreLead } from './leadScoring';
import { matchLocation } from './locationMatching';
import { resolvePostUrl } from './urlResolver';
import { formatDate } from './dateResolution';

export interface NormalizationContext {
  source: string;
  sourceStatus: SourceStatus;
  areaKey: string;
  timeFilter: 'today' | 'this_week';
  isFallbackDiscovered: boolean;
}

export function normalizeLead(raw: RawLead, ctx: NormalizationContext): Lead {
  const { areaMatched, location } = matchLocation(
    `${raw.title} ${raw.snippet} ${raw.location ?? ''}`
  );

  const { url: resolvedUrl, isResolved } = resolvePostUrl(raw.url);

  const postedAt = raw.postedAt ?? null;
  const postedAtAccuracy: DateAccuracy = raw.postedAtAccuracy ?? 'Unknown';

  const { score: rawScore, classification: rawClass, confidenceReason } = scoreLead(
    raw.title,
    raw.snippet,
    areaMatched,
    ctx.areaKey,
    postedAt,
    ctx.timeFilter,
    raw.matchedKeyword ?? ''
  );

  // Search-engine leads (Google/Bing) are pre-filtered by title relevance and
  // job-posting filters before scoring, so surviving results are more likely to
  // be genuine homeowner posts. Give a modest +15 boost to offset the penalty
  // caused by contractor ad language that appears in Google-generated snippets.
  // Only boost if the raw score shows some homeowner signals (>= 40), not for junk.
  const score = ctx.isFallbackDiscovered && rawScore >= 40
    ? Math.min(100, rawScore + 15)
    : rawScore;

  // For search-engine leads (Google/Bing), apply slightly lenient thresholds.
  // Raised "Possible Lead" floor from 55 → 62 to cut low-quality results.
  const classification = ctx.isFallbackDiscovered
    ? score >= 75 ? 'Very Likely Lead'
      : score >= 62 ? 'Possible Lead'
      : 'Business Ad / Ignore'
    : score >= 80 ? 'Very Likely Lead'
      : score >= 62 ? 'Possible Lead'
      : rawClass;

  return {
    id: uuidv4(),
    source: ctx.source,
    sourceStatus: ctx.sourceStatus,
    title: raw.title.trim(),
    actualPostUrl: resolvedUrl || raw.url,
    snippet: raw.snippet.trim().slice(0, 400),
    location: location || raw.location || '',
    areaMatched,
    postedAt: postedAt ? postedAt.toISOString() : null,
    postedAtAccuracy,
    matchedKeyword: raw.matchedKeyword ?? '',
    leadScore: score,
    classification,
    confidenceReason,
    isFallbackDiscovered: ctx.isFallbackDiscovered,
    isUrlResolved: isResolved,
    rawMetadata: raw.rawMetadata ?? {},
    isSaved: false,
    isContacted: false,
  };
}

// Sort leads: freshest first, then by score
export function sortLeads(leads: Lead[], freshestFirst: boolean): Lead[] {
  return [...leads].sort((a, b) => {
    if (freshestFirst) {
      // Primary: freshness
      const dateA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
      const dateB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
      if (dateA !== dateB) return dateB - dateA; // Newest first
    }
    // Secondary: lead score
    return b.leadScore - a.leadScore;
  });
}

// Truncate a string for display
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
