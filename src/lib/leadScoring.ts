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

  // ── Hard overrides: explicit business-ad vs homeowner signals ──────────
  // Any matching business ad phrase forces score below 30 (auto-hidden).
  const HARD_AD_PHRASES = [
    'we offer', 'call now', 'free estimate', 'licensed & insured',
    'serving nyc', 'years of experience', 'our technicians',
    'professional team', 'visit our', 'our company',
    // Additional ad patterns
    'call today', 'call us today', 'get a free', 'schedule service',
    'schedule a service', 'we provide', 'we specialize', 'top 10 best',
    'read reviews and see', 'see ratings for', 'we service all',
    'i repair all', 'i install all', 'call for a free',
    'best in the area', 'top rated', '#1 rated', 'award winning',
    'certified garage', 'our prices', 'get an estimate', 'book now',
    'serving the tri', 'serving all of', 'serving new york', 'serving new jersey',
  ];
  // Any matching homeowner phrase (with no ad phrase present) ensures score >= 55.
  const HOMEOWNER_PHRASES = [
    'my garage', 'need help', 'broken', 'stuck', "won't open",
    'need someone', 'looking for', 'can anyone', 'asap', 'urgent', 'help me',
  ];
  const hasHardAd = HARD_AD_PHRASES.some(p => fullText.includes(p));
  if (hasHardAd) {
    score = Math.min(score, 29);
    businessAdSignals.push(...HARD_AD_PHRASES.filter(p => fullText.includes(p)).slice(0, 2));
  } else if (HOMEOWNER_PHRASES.some(p => fullText.includes(p))) {
    score = Math.max(score, 55);
  }

  // ── Out-of-area geographic penalty ─────────────────────────────────────
  // If the text contains explicit non-target cities/states AND no target area
  // was matched, this is an out-of-area result — force it out.
  const OUT_OF_AREA_TERMS = [
    'cleveland', 'indianapolis', 'chicago', 'los angeles', 'san francisco',
    'san diego', 'houston', 'dallas', 'atlanta', 'denver', 'seattle',
    'phoenix', 'miami', 'pittsburgh', 'nashville', 'minneapolis', 'charlotte',
    'raleigh', 'columbus, oh', 'santa barbara', 'santa clarita', 'buellton',
    'pawtucket', 'fall river', 'worcester', 'springfield, ma',
    ', ca ', ', tx ', ', fl ', ', oh ', ', il ', ', ga ',
    ', wa ', ', mn ', ', nc ', ', tn ', ', az ', ', co ',
  ];
  if (!areaMatched && OUT_OF_AREA_TERMS.some(t => fullText.includes(t))) {
    score = Math.min(score, 29);
    businessAdSignals.push('out of service area');
  }

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
