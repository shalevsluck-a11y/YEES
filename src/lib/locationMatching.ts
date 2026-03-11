import { SERVICE_AREAS } from '@/config/areas';

// Extract and match location from text against service areas
export function matchLocation(text: string): { areaMatched: string; location: string } {
  const lower = text.toLowerCase();

  // Check each service area in priority order
  for (const area of SERVICE_AREAS) {
    for (const term of area.searchTerms) {
      if (lower.includes(term.toLowerCase())) {
        return {
          areaMatched: area.label,
          location: extractLocationPhrase(text, term) || area.label,
        };
      }
    }
  }

  return { areaMatched: '', location: extractGenericLocation(text) };
}

// Try to extract a location phrase around the matched term
function extractLocationPhrase(text: string, term: string): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return '';

  // Grab surrounding context (40 chars each side)
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + term.length + 20);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

// Extract any location-like phrase from text
function extractGenericLocation(text: string): string {
  // Look for "in [City]", "near [City]", "[City], NY/NJ" patterns
  const patterns = [
    /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /\bnear\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*(?:NY|NJ|New York|New Jersey)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return '';
}

// Score location relevance: 15 for exact match, 5 for partial, 0 for none
export function locationScore(areaMatched: string, requestedAreaKey: string): number {
  if (!areaMatched) return 0;
  if (requestedAreaKey === 'all') return 5; // Any match is fine when searching all
  const area = SERVICE_AREAS.find(a => a.key === requestedAreaKey);
  if (!area) return 0;
  if (areaMatched === area.label) return 15;
  return 5; // Partial match
}
