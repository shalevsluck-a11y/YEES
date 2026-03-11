/**
 * Bark.com Source Adapter
 *
 * STATUS: Partial
 *
 * Bark.com is a service marketplace where homeowners post requests like
 * "I need garage door repair in Brooklyn" and contractors respond.
 * The results pages are publicly accessible without login.
 *
 * Uses ScraperAPI (SCRAPER_API_KEY) if available for better success rate.
 * Without it, falls back to direct fetch which may be blocked or return JS shell.
 *
 * URL format: https://www.bark.com/en/us/results/garage-doors/<location-slug>/
 */

import * as cheerio from 'cheerio';
import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';

// Bark location slugs by area key
const BARK_LOCATIONS: Record<string, string[]> = {
  nyc:          ['new-york--new-york', 'brooklyn--new-york', 'queens--new-york'],
  brooklyn:     ['brooklyn--new-york'],
  queens:       ['queens--new-york'],
  bronx:        ['bronx--new-york'],
  staten_island:['staten-island--new-york'],
  long_island:  ['long-island--new-york', 'hempstead--new-york'],
  north_jersey: ['newark--new-jersey', 'jersey-city--new-jersey', 'hackensack--new-jersey'],
  all:          ['new-york--new-york', 'brooklyn--new-york', 'queens--new-york', 'long-island--new-york', 'newark--new-jersey'],
};

const SERVICE_SLUG = 'garage-doors';

function buildBarkUrl(locationSlug: string): string {
  return `https://www.bark.com/en/us/results/${SERVICE_SLUG}/${locationSlug}/`;
}

function wrapWithScraper(url: string, apiKey: string): string {
  return `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}&render=false&residential=true&country_code=us`;
}

function parseBarkHtml(html: string, locationSlug: string): RawLead[] {
  const leads: RawLead[] = [];
  const $ = cheerio.load(html);

  // Bark.com uses various class names depending on their A/B tests and deployments
  // Try a range of selectors for resilience
  const cardSelectors = [
    '[class*="ProfileCard"]',
    '[class*="profile-card"]',
    '[class*="result-card"]',
    '[class*="BarkCard"]',
    '[class*="listing-card"]',
    '[class*="seller-card"]',
    'article',
  ];

  let $cards = $();
  for (const sel of cardSelectors) {
    $cards = $(sel);
    if ($cards.length > 0) break;
  }

  $cards.each((_, el) => {
    const titleEl = $(el).find('h2, h3, h4, [class*="name"], [class*="title"], [class*="heading"]').first();
    const linkEl   = $(el).find('a[href]').first();
    const snippetEl = $(el).find('p, [class*="description"], [class*="about"], [class*="review"]').first();
    const dateEl   = $(el).find('time, [class*="date"], [class*="posted"]').first();

    const title   = titleEl.text().trim();
    const href    = linkEl.attr('href') ?? '';
    const snippet = snippetEl.text().trim();
    const rawDate = dateEl.attr('datetime') ?? dateEl.text().trim();

    if (!title || title.length < 4 || !href) return;

    const url = href.startsWith('http') ? href : `https://www.bark.com${href}`;
    const { date: postedAt, accuracy } = resolveDate(rawDate);
    const location = locationSlug.replace(/--/g, ', ').replace(/-/g, ' ');

    leads.push({
      title,
      url,
      snippet: snippet.slice(0, 400),
      location,
      postedAt,
      postedAtAccuracy: accuracy,
      matchedKeyword: 'garage door',
      rawMetadata: { source: 'bark', locationSlug },
    });
  });

  // Fallback: grab any links that point to a Bark profile or result
  if (leads.length === 0) {
    $('a[href*="/en/us/"]').each((_, el) => {
      const href  = $(el).attr('href') ?? '';
      const title = $(el).text().trim();
      if (!title || title.length < 4) return;
      if (href.includes('/results/') || href.includes('/profile/') || href.includes('/pro/')) {
        const url = href.startsWith('http') ? href : `https://www.bark.com${href}`;
        leads.push({
          title,
          url,
          snippet: '',
          postedAt: null,
          postedAtAccuracy: 'Unknown',
          matchedKeyword: 'garage door',
          rawMetadata: { source: 'bark', locationSlug, fallbackParsed: true },
        });
      }
    });
  }

  return leads;
}

export async function fetchBarkLeads(
  areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const scraperApiKey = process.env.SCRAPER_API_KEY;
  const locations = BARK_LOCATIONS[areaKey] ?? BARK_LOCATIONS['all'];
  const locationsToFetch = locations.slice(0, 3); // cap to keep within Vercel timeout

  const allLeads: RawLead[] = [];
  let fetchSuccesses = 0;
  let fetchErrors = 0;

  const tasks = locationsToFetch.map(async (slug) => {
    const targetUrl = buildBarkUrl(slug);
    const fetchUrl  = scraperApiKey ? wrapWithScraper(targetUrl, scraperApiKey) : targetUrl;

    const result = await fetchPage(fetchUrl, { timeout: 7_000 });
    if (!result.ok) {
      fetchErrors++;
      return;
    }

    const leads = parseBarkHtml(result.text, slug);
    if (leads.length > 0) {
      fetchSuccesses++;
      allLeads.push(...leads);
    } else {
      fetchErrors++;
    }
  });

  await Promise.all(tasks);

  const seen = new Set<string>();
  const deduped = allLeads.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  const status = fetchSuccesses === 0 ? 'Blocked' : fetchErrors > 0 ? 'Partial' : 'Working';

  return {
    sourceKey: 'bark',
    sourceName: 'Bark.com (Service Requests)',
    status,
    leads: deduped,
    note: status === 'Blocked'
      ? 'Bark.com returned no results. The site may require JavaScript rendering. Add SCRAPER_API_KEY to improve success rate.'
      : status === 'Partial'
        ? 'Some Bark.com location pages returned no results. HTML structure may have changed.'
        : undefined,
    fetchedAt: new Date(),
  };
}
