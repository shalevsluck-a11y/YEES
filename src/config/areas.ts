// ============================================================
// SERVICE AREA CONFIGURATION
// Edit this file to add/remove service areas.
// ============================================================

export interface AreaConfig {
  key: string;
  label: string;
  searchTerms: string[];       // Terms added to search queries
  craigslistDomains: string[]; // Craigslist subdomains to search
  redditSubs: string[];        // Subreddits to include in searches
}

export const SERVICE_AREAS: AreaConfig[] = [
  {
    key: 'nyc',
    label: 'NYC (All Boroughs)',
    searchTerms: ['nyc', 'new york city', 'manhattan', 'new york'],
    craigslistDomains: ['newyork'],
    redditSubs: ['r/nyc', 'r/AskNYC', 'r/manhattan'],
  },
  {
    key: 'brooklyn',
    label: 'Brooklyn',
    searchTerms: ['brooklyn', 'bk', 'bed stuy', 'bushwick', 'flatbush', 'bensonhurst', 'bay ridge', 'sunset park', 'crown heights', 'park slope'],
    craigslistDomains: ['newyork'],
    redditSubs: ['r/brooklyn'],
  },
  {
    key: 'queens',
    label: 'Queens',
    searchTerms: ['queens', 'flushing', 'jamaica', 'astoria', 'jackson heights', 'forest hills', 'bayside', 'howard beach', 'ozone park'],
    craigslistDomains: ['newyork'],
    redditSubs: ['r/queens'],
  },
  {
    key: 'bronx',
    label: 'Bronx',
    searchTerms: ['bronx', 'the bronx', 'yonkers', 'riverdale', 'fordham', 'hunts point'],
    craigslistDomains: ['newyork'],
    redditSubs: ['r/TheBronx'],
  },
  {
    key: 'staten_island',
    label: 'Staten Island',
    searchTerms: ['staten island', 'si', 'st george', 'tottenville', 'great kills'],
    craigslistDomains: ['newyork'],
    redditSubs: ['r/StatenIsland'],
  },
  {
    key: 'long_island',
    label: 'Long Island',
    searchTerms: ['long island', 'nassau', 'suffolk', 'hempstead', 'brentwood', 'babylon', 'huntington', 'islip', 'smithtown', 'garden city'],
    craigslistDomains: ['longisland'],
    redditSubs: ['r/longisland'],
  },
  {
    key: 'north_jersey',
    label: 'North New Jersey',
    searchTerms: ['north jersey', 'bergen county', 'hudson county', 'essex county', 'jersey city', 'newark', 'hoboken', 'hackensack', 'teaneck', 'fort lee', 'paramus', 'clifton', 'passaic'],
    craigslistDomains: ['newjersey'],
    redditSubs: ['r/newjersey', 'r/jerseycity', 'r/newark'],
  },
];

export const ALL_AREAS_KEY = 'all';

// Get area config by key
export function getArea(key: string): AreaConfig | undefined {
  return SERVICE_AREAS.find(a => a.key === key);
}

// Get all Craigslist domains to search for a given area key
export function getCraigslistDomains(areaKey: string): string[] {
  if (areaKey === ALL_AREAS_KEY) {
    // Deduplicate
    const domains = new Set(SERVICE_AREAS.flatMap(a => a.craigslistDomains));
    return Array.from(domains);
  }
  return getArea(areaKey)?.craigslistDomains ?? ['newyork'];
}

// Get all Reddit subs to search for a given area key
export function getRedditSubs(areaKey: string): string[] {
  if (areaKey === ALL_AREAS_KEY) {
    const subs = new Set(SERVICE_AREAS.flatMap(a => a.redditSubs));
    return Array.from(subs);
  }
  return getArea(areaKey)?.redditSubs ?? [];
}

// All area search terms for matching
export const ALL_AREA_TERMS = SERVICE_AREAS.flatMap(a => a.searchTerms);
