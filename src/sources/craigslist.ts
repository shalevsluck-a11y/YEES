/**
 * Craigslist Source Adapter
 *
 * STATUS: Working (requires SCRAPER_API_KEY env var on cloud hosting)
 *
 * Craigslist blocks datacenter IPs (AWS/Vercel). To work on Vercel,
 * this adapter routes requests through ScraperAPI (free: 5000 req/month).
 * Get a free key at: https://www.scraperapi.com
 *
 * Without SCRAPER_API_KEY: marks itself as Blocked.
 * With SCRAPER_API_KEY: fetches Craigslist RSS through residential proxy.
 *
 * Searches gig sections:
 *   lbg = labor gigs (homeowners posting "need someone to fix my garage door")
 */

import * as cheerio from 'cheerio';
import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';
import { getCraigslistDomains } from '@/config/areas';

const CL_DOMAINS: Record<string, string> = {
  newyork: 'newyork',
  longisland: 'longisland',
  newjersey: 'newjersey',
};

// Keep queries short — each uses 1 ScraperAPI credit
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

function buildRssUrl(domain: string, category: string, query: string): string {
  return `https://${domain}.craigslist.org/search/${category}?query=${encodeURIComponent(query)}&format=rss`;
}

function wrapWithScraper(targetUrl: string, apiKey: string): string {
  return `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render=false`;
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

  if (!scraperApiKey) {
    return {
      sourceKey: 'craigslist',
      sourceName: 'Craigslist',
      status: 'Blocked',
      leads: [],
      note: 'Craigslist blocks Vercel datacenter IPs. Add SCRAPER_API_KEY to Vercel env vars to fix. Free at scraperapi.com (5,000 req/month free tier).',
      fetchedAt: new Date(),
    };
  }

  const allLeads: RawLead[] = [];
  const domains = getCraigslistDomains(areaKey).map(d => CL_DOMAINS[d] ?? d);
  // 2 domains × 2 queries = 4 ScraperAPI credits per search
  const queries = FOCUSED_QUERIES.slice(0, 2);

  let fetchSuccesses = 0;
  let fetchErrors = 0;

  // Run all in parallel — critical for staying within Vercel's timeout
  const tasks: Promise<void>[] = [];
  for (const domain of domains.slice(0, 2)) {
    for (const query of queries) {
      const rssUrl = buildRssUrl(domain, 'lbg', query);
      const fetchUrl = wrapWithScraper(rssUrl, scraperApiKey);
      tasks.push(
        fetchPage(fetchUrl, { acceptXml: true, timeout: 7_000 })
          .then(result => {
            if (!result.ok) {
              fetchErrors++;
            } else {
              allLeads.push(...parseRss(result.text, query));
              fetchSuccesses++;
            }
          })
          .catch(() => { fetchErrors++; })
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
      ? 'ScraperAPI requests failed. Verify your SCRAPER_API_KEY in Vercel env vars.'
      : status === 'Partial'
        ? `${fetchErrors} of ${fetchErrors + fetchSuccesses} requests failed.`
        : undefined,
    fetchedAt: new Date(),
  };
}
