export type LeadClassification =
  | 'Very Likely Lead'
  | 'Possible Lead'
  | 'Business Ad / Ignore';

export type DateAccuracy = 'Exact' | 'Estimated' | 'Unknown';

export type SourceStatus = 'Working' | 'Partial' | 'Blocked' | 'Fallback Mode';

export interface Lead {
  id: string;
  source: string;
  sourceStatus: SourceStatus;
  title: string;
  actualPostUrl: string;
  snippet: string;
  location: string;
  areaMatched: string;
  postedAt: string | null;       // ISO date string
  postedAtAccuracy: DateAccuracy;
  matchedKeyword: string;
  leadScore: number;
  classification: LeadClassification;
  confidenceReason: string;
  isFallbackDiscovered: boolean;
  isUrlResolved: boolean;
  rawMetadata: Record<string, unknown>;
  isSaved?: boolean;
  isContacted?: boolean;
}

export interface SearchFilters {
  timeFilter: 'today' | 'this_week';
  areaFilter: string;   // 'all' or area key
  sourceFilter: string; // 'all' or source key
  hideBusinessAds: boolean;
  freshestFirst: boolean;
  deduplicateResults: boolean;
}

export interface SearchResponse {
  leads: Lead[];
  sourceStatuses: SourceStatusSummary[];
  totalFound: number;
  veryLikelyCount: number;
  possibleCount: number;
  businessAdCount: number;
  fetchedAt: string;
}

export interface SourceStatusSummary {
  sourceKey: string;
  sourceName: string;
  status: SourceStatus;
  leadsFound: number;
  error?: string;
  note?: string;
}
