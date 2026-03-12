/**
 * Craigslist Source Adapter
 *
 * PRIMARY: ScraperAPI (SCRAPER_API_KEY) — direct RSS feed via residential proxy
 * FALLBACK: Serper/Google Search (SERPER_API_KEY) — searches Craigslist via Google index
 *
 * Craigslist blocks Vercel datacenter IPs.
 * - With SCRAPER_API_KEY: fetches Craigslist RSS directly (most accurate/fresh)
 * - Without SCRAPER_API_KEY: falls back to Google site:craigslist.org queries
 *   which find the same homeowner posts via Google's crawl index.
 *
 * ScraperAPI free tier: 5,000 req/month at scraperapi.com
 */

import * as cheerio from 'cheerio';
import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';
import { getCraigslistDomains } from '@/config/areas';
import { runSerperQueries } from '@/lib/serperSearch';

const CL_DOMAINS: Record<string, string> = {
  newyork: 'newyork',
  longisland: 'longisland',
  newjersey: 'newjersey',
};

const FOCUSED_QUERIES = [
  'garage door repair',
  'broken spring garage',
  'garage door stuck',
  'garage door not opening',
  'garage opener broken',
];

const CRAIGSLIST_AREA_CODES: Record<string, string> = {
  bro: 'Brooklyn', mnh: 'Manhattan', que: 'Queens',
  brx: 'Bronx', stn: 'Staten Island', wch: 'Westchester',
  lgi: 'Long Island', nassau: 'Nassau County', suffolk: 'Suffolk County',
  nno: 'North NJ', sno: 'South NJ', cnt: 'Central NJ',
};

// Serper queries used when ScraperAPI key is unavailable
const SERPER_CL_QUERIES = [
  'site:craigslist.org "garage door" (broken OR stuck OR spring OR "won\'t open" OR "need help" OR "looking for") (brooklyn OR queens OR bronx OR "long island" OR "new jersey" OR "staten island") -"will train" -"general labor" -"hiring"',
  'site:craigslist.org "garage" (opener OR spring OR cable OR panel OR sensor) ("need" OR "broken" OR "repair" OR "install") (brooklyn OR queens OR bronx OR "long island" OR "new jersey")',
  'site:craigslist.org/lbg "garage door"',
];

function buildRssUrl(domain: string, category: string, query: string): string {
  return `https://${domain}.craigslist.org/search/${category}?query=${encodeURIComponent(query)}&format=rss`;
}

function wrapWithScraper(targetUrl: string, apiKey: string): string {
  return `https://api.scraperapi.com?api_key=${apiKey}&country_code=us&url=${encodeURIComponent(targetUrl)}`;
}

function parseRss(xml: string, query: string): RawLead[] {
  const leads: RawLead[] = [];
  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    $('item').each((_, el) => {
      const title = $(el).find('title').text().trim();
      const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
      const description = $(el).find('description').text().trim();
      const pubDate = $(el).find('pubDate').text().trim();
      if (!title || !link) return;
      const { date: postedAt, accuracy: postedAtAccuracy } = resolveDate(pubDate);
      const areaCodeMatch = link.match(/craigslist\.org\/([a-z]+)\/[a-z]+\//);
      const locationHint = CRAIGSLIST_AREA_CODES[areaCodeMatch?.[1] ?? ''] ?? '';
      const snippet = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
      leads.push({
        title, url: link, snippet, location: locationHint,
        postedAt, postedAtAccuracy, matchedKeyword: query,
        rawMetadata: { craigslistArea: areaCodeMatch?.[1] ?? '' },
      });
    });
  } catch (err) {
    console.error('[craigslist] RSS parse error:', err);
  }
  return leads;
}

export async function fetchCraigslistLeads(
  areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const scraperApiKey = process.env.SCRAPER_API_KEY;
  const serperApiKey = process.env.SERPER_API_KEY;

  // ── Primary: ScraperAPI direct RSS ───────────────────────────────────────
  if (scraperApiKey) {
    const allLeads: RawLead[] = [];
    const domains = getCraigslistDomains(areaKey).map(d => CL_DOMAINS[d] ?? d);
    const queries = FOCUSED_QUERIES.slice(0, 2);
    let fetchSuccesses = 0;
    let fetchErrors = 0;

    const failStatuses: number[] = [];
    const tasks: Promise<void>[] = [];
    for (const domain of domains.slice(0, 2)) {
      for (const query of queries) {
        const rssUrl = buildRssUrl(domain, 'lbg', query);
        const fetchUrl = wrapWithScraper(rssUrl, scraperApiKey);
        tasks.push(
          fetchPage(fetchUrl, { acceptXml: true, timeout: 15_000 })
            .then(result => {
              if (!result.ok) {
                fetchErrors++;
                failStatuses.push(result.status);
                console.error(`[craigslist] ScraperAPI request failed: status=${result.status} error=${result.error ?? ''} url=${rssUrl}`);
              } else {
                allLeads.push(...parseRss(result.text, query));
                fetchSuccesses++;
              }
            })
            .catch(err => {
              fetchErrors++;
              failStatuses.push(0);
              console.error(`[craigslist] ScraperAPI fetch threw: ${err} url=${rssUrl}`);
            })
        );
      }
    }
    await Promise.all(tasks);

    const seen = new Set<string>();
    const dedupedLeads = allLeads.filter(l => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });

    const status = fetchSuccesses === 0 ? 'Blocked' : fetchErrors > fetchSuccesses ? 'Partial' : 'Working';
    return {
      sourceKey: 'craigslist',
      sourceName: 'Craigslist',
      status,
      leads: dedupedLeads,
      note: status === 'Blocked'
        ? `ScraperAPI requests all failed (status codes: ${failStatuses.join(', ') || 'timeout'}). ${failStatuses.some(s => s === 401 || s === 403) ? 'Key may be invalid or out of credits.' : 'Craigslist may be blocking — try enabling premium proxies in ScraperAPI dashboard.'}`
        : status === 'Partial'
          ? `${fetchErrors} of ${fetchErrors + fetchSuccesses} requests failed.`
          : undefined,
      fetchedAt: new Date(),
    };
  }

  // ── Fallback: Google Search (site:craigslist.org via Serper) ─────────────
  if (serperApiKey) {
    const leads = await runSerperQueries(SERPER_CL_QUERIES, serperApiKey);
    return {
      sourceKey: 'craigslist',
      sourceName: 'Craigslist',
      status: leads.length > 0 ? 'Working' : 'Partial',
      leads,
      note: leads.length === 0
        ? 'No Craigslist results via Google this week. Posts may not be indexed yet.'
        : 'Results via Google index (add SCRAPER_API_KEY for direct real-time access).',
      fetchedAt: new Date(),
    };
  }

  // ── No keys available ─────────────────────────────────────────────────────
  return {
    sourceKey: 'craigslist',
    sourceName: 'Craigslist',
    status: 'Blocked',
    leads: [],
    note: 'Add SCRAPER_API_KEY (scraperapi.com, free 5k/mo) for direct access, or SERPER_API_KEY for Google-index fallback.',
    fetchedAt: new Date(),
  };
}
