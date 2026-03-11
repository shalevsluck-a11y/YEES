import type { LeadClassification } from '@/types/lead';
import { HIGH_INTENT_TERMS, BUSINESS_AD_TERMS, SERVICE_KEYWORDS } from '@/config/keywords';
import { locationScore } from './locationMatching';

export interface ScoringResult {
  score: number;
  classification: LeadClassification;
  confidenceReason: string;
  matchedSignals: string[];
  businessAdSignals: string[];
}

export function scoreLead(
  title: string,
  snippet: string,
  areaMatched: string,
  requestedAreaKey: string,
  postedAt: Date | null,
  timeFilter: 'today' | 'this_week',
  matchedKeyword: string
): ScoringResult {
  const fullText = `${title} ${snippet}`.toLowerCase();
  const matchedSignals: string[] = [];
  const businessAdSignals: string[] = [];
  let score = 30; // Base score

  // ── Service keyword match ───────────────────────────────────────────────
  let serviceMatches = 0;
  for (const kw of SERVICE_KEYWORDS) {
    if (fullText.includes(kw.toLowerCase())) {
      serviceMatches++;
      if (serviceMatches <= 3) matchedSignals.push(kw); // Report first 3
    }
  }
  score += Math.min(serviceMatches * 6, 20); // Up to +20

  // ── High-intent / urgency signals ──────────────────────────────────────
  let intentMatches = 0;
  for (const term of HIGH_INTENT_TERMS) {
    if (fullText.includes(term.toLowerCase())) {
      intentMatches++;
      if (intentMatches <= 3) matchedSignals.push(term);
    }
  }
  score += Math.min(intentMatches * 5, 20); // Up to +20

  // ── Business ad signals ────────────────────────────────────────────────
  let adMatches = 0;
  for (const term of BUSINESS_AD_TERMS) {
    if (fullText.includes(term.toLowerCase())) {
      adMatches++;
      if (adMatches <= 3) businessAdSignals.push(term);
    }
  }
  score -= Math.min(adMatches * 8, 40); // Up to -40

  // ── Location match ─────────────────────────────────────────────────────
  const locScore = locationScore(areaMatched, requestedAreaKey);
  score += locScore;
  if (locScore > 0) matchedSignals.push(areaMatched || 'area match');

  // ── Freshness bonus ────────────────────────────────────────────────────
  if (postedAt) {
    const ageHours = (Date.now() - postedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours <= 6) {
      score += 15;
      matchedSignals.push('posted < 6 hours ago');
    } else if (ageHours <= 24) {
      score += 10;
      matchedSignals.push('posted today');
    } else if (ageHours <= 72) {
      score += 5;
      matchedSignals.push('posted this week');
    }
  }

  // ── Question / help-seeking language patterns ──────────────────────────
  if (/\?/.test(title + snippet)) {
    score += 3;
    matchedSignals.push('question format');
  }
  if (/\bcan (anyone|someone|you)\b|\bwho (can|does)\b|\blooking for\b/i.test(fullText)) {
    score += 5;
    matchedSignals.push('help-seeking phrasing');
  }

  // ── Price/quote-seeking ────────────────────────────────────────────────
  if (/\bhow much\b|\bprice\b|\bcost\b|\bquote\b|\bestimate\b/i.test(fullText)) {
    score += 4;
    matchedSignals.push('price inquiry');
  }

  // ── Cap and floor ──────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));

  // ── Classify ───────────────────────────────────────────────────────────
  let classification: LeadClassification;
  if (score >= 80) {
    classification = 'Very Likely Lead';
  } else if (score >= 55) {
    classification = 'Possible Lead';
  } else {
    classification = 'Business Ad / Ignore';
  }

  // ── Build confidence reason ────────────────────────────────────────────
  const reasons: string[] = [];
  if (matchedSignals.length > 0) {
    reasons.push(`Matched: ${matchedSignals.slice(0, 4).join(', ')}`);
  }
  if (businessAdSignals.length > 0) {
    reasons.push(`Ad signals: ${businessAdSignals.slice(0, 2).join(', ')}`);
  }
  if (!areaMatched) {
    reasons.push('No area match detected');
  }

  return {
    score,
    classification,
    confidenceReason: reasons.join(' | ') || 'No strong signals detected',
    matchedSignals,
    businessAdSignals,
  };
}
