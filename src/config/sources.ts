import type { SourceConfig } from '@/types/source';

// ============================================================
// SOURCE CONFIGURATION
// Each source has an expected status based on current
// scraping feasibility. Be honest about limitations.
// ============================================================

export const SOURCE_CONFIGS: SourceConfig[] = [
  {
    key: 'craigslist',
    name: 'Craigslist',
    description: 'Direct RSS feed adapter for gigs sections. Best source for actual homeowner requests.',
    enabled: true,
    phase: 1,
    expectedStatus: 'Working',
  },
  {
    key: 'reddit',
    name: 'Reddit / Public Forums',
    description: 'Searches public subreddits for homeowner requests. Uses Reddit public JSON API.',
    enabled: true,
    phase: 1,
    expectedStatus: 'Working',
  },
  {
    key: 'classifieds',
    name: 'Public Classifieds',
    description: 'Searches Locanto and similar public classified sites.',
    enabled: true,
    phase: 1,
    expectedStatus: 'Partial',
  },
  {
    key: 'offerup',
    name: 'OfferUp',
    description: 'OfferUp blocks automated access. No reliable public search without login.',
    enabled: true,
    phase: 2,
    expectedStatus: 'Blocked',
  },
  {
    key: 'facebook',
    name: 'Facebook Marketplace',
    description: 'Facebook requires login for all Marketplace access. Cannot be scraped publicly.',
    enabled: true,
    phase: 2,
    expectedStatus: 'Blocked',
  },
  {
    key: 'yelp',
    name: 'Yelp / Request Pages',
    description: 'Yelp Request-a-Quote is behind login. Limited public data available.',
    enabled: true,
    phase: 2,
    expectedStatus: 'Partial',
  },
  {
    key: 'fallback',
    name: 'Fallback Discovery (Bing)',
    description: 'Uses Bing search with site: operators when direct source access fails. Fallback only.',
    enabled: true,
    phase: 1,
    expectedStatus: 'Fallback Mode',
  },
];

export function getSourceConfig(key: string): SourceConfig | undefined {
  return SOURCE_CONFIGS.find(s => s.key === key);
}
