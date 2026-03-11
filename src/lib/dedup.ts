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

// Simple string similarity (0–1) using character overlap
function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const longerLen = longer.length;

  if (longerLen === 0) return 1;

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }

  return matches / longerLen;
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
