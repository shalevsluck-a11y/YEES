import type { DateAccuracy } from '@/types/lead';

export interface ResolvedDate {
  date: Date | null;
  accuracy: DateAccuracy;
}

// Parse a date from various formats found in scraped content
export function resolveDate(
  rawDate: string | null | undefined,
  fallbackText?: string
): ResolvedDate {
  if (!rawDate && !fallbackText) {
    return { date: null, accuracy: 'Unknown' };
  }

  // 1. Try parsing raw date string directly
  if (rawDate) {
    const parsed = tryParseExact(rawDate);
    if (parsed) return { date: parsed, accuracy: 'Exact' };
  }

  // 2. Try relative timestamps from text (e.g. "2 hours ago", "posted today")
  const textToSearch = (rawDate ?? '') + ' ' + (fallbackText ?? '');
  const relative = tryParseRelative(textToSearch);
  if (relative) return { date: relative, accuracy: 'Estimated' };

  // 3. Can't resolve
  return { date: null, accuracy: 'Unknown' };
}

function tryParseExact(raw: string): Date | null {
  // Remove timezone abbreviations that confuse Date parser
  const cleaned = raw.trim();

  const attempt = new Date(cleaned);
  if (!isNaN(attempt.getTime())) {
    // Sanity check: must be within last 2 years
    const now = Date.now();
    const twoYearsAgo = now - 1000 * 60 * 60 * 24 * 365 * 2;
    if (attempt.getTime() > twoYearsAgo && attempt.getTime() <= now + 86400000) {
      return attempt;
    }
  }

  return null;
}

function tryParseRelative(text: string): Date | null {
  const lower = text.toLowerCase();
  const now = new Date();

  // "just now" / "moments ago"
  if (/just now|moments ago|a moment ago/.test(lower)) {
    return new Date(now.getTime() - 5 * 60 * 1000);
  }

  // "X minutes ago"
  const minsMatch = lower.match(/(\d+)\s*min(?:ute)?s?\s*ago/);
  if (minsMatch) {
    return new Date(now.getTime() - parseInt(minsMatch[1]) * 60 * 1000);
  }

  // "X hours ago"
  const hoursMatch = lower.match(/(\d+)\s*hours?\s*ago/);
  if (hoursMatch) {
    return new Date(now.getTime() - parseInt(hoursMatch[1]) * 3600 * 1000);
  }

  // "today"
  if (/\btoday\b/.test(lower)) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  }

  // "yesterday"
  if (/\byesterday\b/.test(lower)) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return y;
  }

  // "X days ago"
  const daysMatch = lower.match(/(\d+)\s*days?\s*ago/);
  if (daysMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(daysMatch[1]));
    return d;
  }

  // "this week"
  if (/this week/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 3); // estimate middle of this week
    return d;
  }

  // "last week"
  if (/last week/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 9);
    return d;
  }

  return null;
}

// Check if a date falls within the requested time window
export function isWithinTimeFilter(
  date: Date | null,
  accuracy: DateAccuracy,
  timeFilter: 'today' | 'this_week'
): boolean {
  // If date is unknown, include it (don't exclude based on uncertainty)
  if (!date || accuracy === 'Unknown') return true;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (timeFilter === 'today') {
    return date >= startOfToday;
  } else {
    return date >= startOfWeek;
  }
}

// Format date for display
export function formatDate(date: Date | null, accuracy: DateAccuracy): string {
  if (!date) return 'Unknown date';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  const accuracyLabel = accuracy === 'Estimated' ? ' (est.)' : accuracy === 'Unknown' ? ' (unknown)' : '';

  if (diffHours < 1) return `Just now${accuracyLabel}`;
  if (diffHours < 24) return `${Math.round(diffHours)}h ago${accuracyLabel}`;
  if (diffDays < 2) return `Yesterday${accuracyLabel}`;
  if (diffDays < 7) return `${Math.floor(diffDays)} days ago${accuracyLabel}`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + accuracyLabel;
}
