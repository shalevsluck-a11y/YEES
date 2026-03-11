import type { Lead } from '@/types/lead';

// Normalize a URL for comparison (strip tracking params, trailing slashes, etc.)
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove common tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'].forEach(p =>
      u.searchParams.delete(p)
    );
    return u.origin + u.pathname.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/$/, '');
  }
}

// Word-level Jaccard similarity (0–1).
// Two strings are "similar" if they share a high proportion of unique words.
// This correctly distinguishes two different garage-door posts (they share
// domain vocabulary but differ in meaning) from true duplicates (same post
// scraped twice with slightly different URLs).
function similarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().trim().split(/\W+/).filter(w => w.length > 2));

  const wordsA = tokenize(a);
  const wordsB = tokenize(b);

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;

  return intersection / union;
}

// Deduplicate leads by URL, title similarity, and snippet similarity
export function deduplicateLeads(leads: Lead[]): Lead[] {
  const seen = new Map<string, Lead>();
  const result: Lead[] = [];

  for (const lead of leads) {
    const normUrl = normalizeUrl(lead.actualPostUrl);

    // Exact URL match
    if (seen.has(normUrl)) {
      // Keep the one with higher score
      const existing = seen.get(normUrl)!;
      if (lead.leadScore > existing.leadScore) {
        seen.set(normUrl, lead);
        const idx = result.findIndex(l => normalizeUrl(l.actualPostUrl) === normUrl);
        if (idx !== -1) result[idx] = lead;
      }
      continue;
    }

    // Check title similarity against recent results
    let isDuplicate = false;
    for (const [, existing] of seen) {
      // Title similarity check
      const titleSim = similarity(lead.title, existing.title);
      // Snippet similarity check (first 100 chars)
      const snippetSim = similarity(
        lead.snippet.slice(0, 100),
        existing.snippet.slice(0, 100)
      );

      if (titleSim > 0.85 && snippetSim > 0.7) {
        isDuplicate = true;
        // Keep higher score
        if (lead.leadScore > existing.leadScore) {
          const existingNorm = normalizeUrl(existing.actualPostUrl);
          seen.delete(existingNorm);
          seen.set(normUrl, lead);
          const idx = result.findIndex(l => l.id === existing.id);
          if (idx !== -1) result[idx] = lead;
        }
        break;
      }
    }

    if (!isDuplicate) {
      seen.set(normUrl, lead);
      result.push(lead);
    }
  }

  return result;
}
