/**
 * Craigslist Source Adapter
 *
 * STATUS: Working
 *
 * Method: Craigslist RSS feeds are publicly accessible without login.
 * We search the "gigs" sections where homeowners post requests for help.
 *
 * Key sections:
 *   - lbg = labor gigs (homeowners posting "need someone to fix X")
 *   - shg = skilled trade gigs
 *   - egg = event gigs (not useful but included in broader search)
 *
 * The RSS feed returns actual Craigslist post URLs in <link> tags.
 * These are resolved direct-post URLs.
 *
 * Limitations:
 *   - Craigslist may rate-limit if too many requests come from one IP.
 *   - We limit to a reasonable number of queries per search session.
 *   - Craigslist serves results from one domain per metro area.
 */

import * as cheerio from 'cheerio';
import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage, sleep } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';
import { buildCraigslistQueries } from '@/lib/keywordBuilder';
import { getCraigslistDomains } from '@/config/areas';

// Craigslist gig categories where homeowners post requests
const GIG_CATEGORIES = ['lbg', 'shg'];

// Domain → full subdomain mapping
const CL_DOMAINS: Record<string, string> = {
  newyork: 'newyork',
  longisland: 'longisland',
  newjersey: 'newjersey',
};

function buildRssUrl(domain: string, category: string, query: string): string {
  const encodedQuery = encodeURIComponent(query);
  return `https://${domain}.craigslist.org/search/${category}?query=${encodedQuery}&format=rss`;
}

// Parse Craigslist RSS XML into raw leads
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

      // Skip if it's clearly a service provider ad (not a customer request)
      // We'll let the scorer handle this more precisely, but do basic filtering
      if (link.includes('/sss/') || link.includes('/bss/')) return; // for-sale / business-services

      const { date: postedAt, accuracy: postedAtAccuracy } = resolveDate(pubDate);

      // Extract location from the Craigslist area code in the URL
      // e.g. newyork.craigslist.org/bro/lbg/... -> bro = Brooklyn
      const areaCodeMatch = link.match(/craigslist\.org\/([a-z]+)\/[a-z]+\//);
      const craigslistArea = areaCodeMatch?.[1] ?? '';
      const locationHint = CRAIGSLIST_AREA_CODES[craigslistArea] ?? '';

      // Clean HTML from description
      const snippet = description
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400);

      leads.push({
        title,
        url: link,
        snippet,
        location: locationHint,
        postedAt,
        postedAtAccuracy,
        matchedKeyword: query,
        rawMetadata: { craigslistArea, category: link.match(/\/([a-z]+)\/d\//)?.[1] ?? '' },
      });
    });
  } catch (err) {
    console.error('[craigslist] RSS parse error:', err);
  }

  return leads;
}

// Craigslist area codes to human-readable names
const CRAIGSLIST_AREA_CODES: Record<string, string> = {
  bro: 'Brooklyn',
  mnh: 'Manhattan',
  que: 'Queens',
  brx: 'Bronx',
  stn: 'Staten Island',
  wch: 'Westchester',
  lgi: 'Long Island',
  // Long Island
  nassau: 'Nassau County, Long Island',
  suffolk: 'Suffolk County, Long Island',
  // New Jersey
  nno: 'North NJ',
  sno: 'South NJ',
  cnt: 'Central NJ',
};

export async function fetchCraigslistLeads(
  areaKey: string,
  timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const allLeads: RawLead[] = [];
  const domains = getCraigslistDomains(areaKey).map(d => CL_DOMAINS[d] ?? d);
  const queries = buildCraigslistQueries(areaKey).slice(0, 6); // Cap queries to avoid rate-limit

  let fetchErrors = 0;
  let fetchSuccesses = 0;

  for (const domain of domains) {
    for (const category of GIG_CATEGORIES) {
      for (const query of queries) {
        const url = buildRssUrl(domain, category, query);

        console.log(`[craigslist] Fetching: ${url}`);
        const result = await fetchPage(url, { acceptXml: true });

        if (!result.ok) {
          fetchErrors++;
          console.warn(`[craigslist] Failed (${result.status}): ${url} - ${result.error ?? ''}`);
        } else {
          const leads = parseRss(result.text, query);
          allLeads.push(...leads);
          fetchSuccesses++;
        }

        // Rate limit: 300ms between requests
        await sleep(300);
      }
    }
  }

  // Deduplicate by URL within this source
  const seen = new Set<string>();
  const dedupedLeads = allLeads.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  const status =
    fetchSuccesses === 0
      ? 'Blocked'
      : fetchErrors > fetchSuccesses
        ? 'Partial'
        : 'Working';

  const note =
    status === 'Blocked'
      ? 'All Craigslist RSS requests failed. Check network or IP rate limiting.'
      : status === 'Partial'
        ? `${fetchErrors} of ${fetchErrors + fetchSuccesses} requests failed.`
        : undefined;

  return {
    sourceKey: 'craigslist',
    sourceName: 'Craigslist',
    status,
    leads: dedupedLeads,
    note,
    fetchedAt: new Date(),
  };
}
