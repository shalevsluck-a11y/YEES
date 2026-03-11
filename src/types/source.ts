import type { SourceStatus } from './lead';

export interface RawLead {
  title: string;
  url: string;
  snippet: string;
  location?: string;
  postedAt?: Date | null;
  postedAtAccuracy?: 'Exact' | 'Estimated' | 'Unknown';
  matchedKeyword?: string;
  rawMetadata?: Record<string, unknown>;
}

export interface SourceResult {
  sourceKey: string;
  sourceName: string;
  status: SourceStatus;
  leads: RawLead[];
  error?: string;
  note?: string;
  fetchedAt: Date;
}

export interface SourceConfig {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  phase: 1 | 2 | 3;
  expectedStatus: SourceStatus;
}
