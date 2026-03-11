import type { SourceConfig } from '@/types/source';

// ============================================================
// SOURCE CONFIGURATION
// Only active sources are listed — permanently blocked ones
// (Facebook, OfferUp, Yelp) have been removed. Their coverage
// is handled indirectly by Bing and Google/Serper queries.
// ============================================================

export const SOURCE_CONFIGS: SourceConfig[] = [
  {
    key: 'craigslist',
    name: 'Craigslist',
    description: 'RSS feed of gigs/labor sections. Best source for direct homeowner requests. Requires SCRAPER_API_KEY to bypass datacenter IP block.',
    enabled: true,
    phase: 1,
    expectedStatus: 'Working',
  },
  {
    key: 'reddit',
    name: 'Reddit / Public Forums',
    description: 'Uses Reddit public JSON API (no auth needed). Searches r/HomeImprovement, r/DIY, and area-specific subs like r/brooklyn, r/longisland.',
    enabled: true,
    phase: 1,
    expectedStatus: 'Partial',
  },
  {
    key: 'classifieds',
    name: 'Public Classifieds (Locanto / Oodle / Geebo / Hoobly)',
    description: 'Scrapes four free classified sites for garage door service requests in NYC/NJ.',
    enabled: true,
    phase: 1,
    expectedStatus: 'Partial',
  },
  {
    key: 'bing',
    name: 'Bing Search (Nextdoor / Reddit / Facebook / Forums)',
    description: 'Bing API searches across Nextdoor, Reddit, Patch.com, and Facebook public pages. Free 1,000 searches/month on Azure F0 tier. Add BING_API_KEY to enable.',
    enabled: true,
    phase: 1,
    expectedStatus: 'Blocked',
  },
  {
    key: 'bark',
    name: 'Bark.com (Service Requests)',
    description: 'Scrapes Bark.com results pages where homeowners post garage door service requests. No login required. Works better with SCRAPER_API_KEY.',
    enabled: true,
    phase: 1,
    expectedStatus: 'Partial',
  },
  {
    key: 'patch',
    name: 'Patch.com (Local Classifieds)',
    description: 'Scrapes local classifieds on Patch.com for NYC boroughs and North Jersey neighborhoods. No login required.',
    enabled: true,
    phase: 1,
    expectedStatus: 'Partial',
  },
  {
    key: 'fallback',
    name: 'Google Search (Serper)',
    description: 'Google Search API via Serper.dev. Searches Reddit, Nextdoor, Craigslist, Patch, Facebook, and Bark through Google index. Free 2,500 searches, no credit card. Add SERPER_API_KEY to enable.',
    enabled: true,
    phase: 1,
    expectedStatus: 'Blocked',
  },
];

export function getSourceConfig(key: string): SourceConfig | undefined {
  return SOURCE_CONFIGS.find(s => s.key === key);
}
