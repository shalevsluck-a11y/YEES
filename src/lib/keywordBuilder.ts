import { CRAIGSLIST_QUERIES, ALL_SEARCH_KEYWORDS } from '@/config/keywords';
import { SERVICE_AREAS, getArea, ALL_AREAS_KEY } from '@/config/areas';

// Build Craigslist query strings for a given area key
export function buildCraigslistQueries(areaKey: string): string[] {
  const areaTerms =
    areaKey === ALL_AREAS_KEY
      ? [] // No area term - searches broadly
      : getArea(areaKey)?.searchTerms.slice(0, 2) ?? []; // Use first 2 area terms

  const queries: string[] = [];

  for (const kw of CRAIGSLIST_QUERIES) {
    if (areaTerms.length === 0) {
      queries.push(kw);
    } else {
      // Add one version with area term, one without (Craigslist is already area-filtered by domain)
      queries.push(kw);
      // Also try with area keyword for better relevance
      queries.push(`${kw} ${areaTerms[0]}`);
    }
  }

  // Deduplicate
  return [...new Set(queries)];
}

// Build Reddit search queries combining keywords and area terms
export function buildRedditQueries(areaKey: string): string[] {
  const areaTerms =
    areaKey === ALL_AREAS_KEY
      ? SERVICE_AREAS.flatMap(a => a.searchTerms.slice(0, 1)) // First term from each area
      : getArea(areaKey)?.searchTerms.slice(0, 3) ?? [];

  const coreKeywords = [
    'garage door repair',
    'broken spring',
    'garage door stuck',
    'garage opener not working',
    'garage door installation',
    'garage door off track',
    'garage door emergency',
  ];

  const queries: string[] = [];

  for (const kw of coreKeywords) {
    for (const area of areaTerms) {
      queries.push(`${kw} ${area}`);
    }
  }

  return [...new Set(queries)];
}

// Build generic search queries for fallback/classifieds
export function buildGenericQueries(areaKey: string): string[] {
  const areaTerms =
    areaKey === ALL_AREAS_KEY
      ? ['nyc', 'brooklyn', 'queens', 'long island', 'north jersey']
      : getArea(areaKey)?.searchTerms.slice(0, 3) ?? ['nyc'];

  const coreKws = [
    'garage door repair',
    'broken garage door spring',
    'garage opener repair',
    'garage door stuck',
    'garage door installation',
  ];

  const queries: string[] = [];
  for (const kw of coreKws) {
    for (const area of areaTerms) {
      queries.push(`${kw} ${area}`);
    }
  }

  return [...new Set(queries)].slice(0, 15); // Cap to avoid hammering sites
}

// Determine which area term was matched in a text
export function detectAreaMatch(text: string, areaKey: string): string {
  const lower = text.toLowerCase();
  const areas =
    areaKey === ALL_AREAS_KEY ? SERVICE_AREAS : SERVICE_AREAS.filter(a => a.key === areaKey);

  for (const area of areas) {
    for (const term of area.searchTerms) {
      if (lower.includes(term.toLowerCase())) {
        return area.label;
      }
    }
  }
  return '';
}
