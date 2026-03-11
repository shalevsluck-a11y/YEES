/**
 * Public Classifieds Source Adapter
 *
 * STATUS: Partial
 *
 * Sources attempted:
 *   - Locanto (locanto.com) — public classified site, no login needed
 *   - Oodle (oodle.com) — aggregates classifieds
 *
 * Method: Parse HTML search result pages for listing titles and URLs.
 * These sites may block bots or change their HTML structure.
 * We gracefully handle failures and mark source accordingly.
 *
 * Limitations:
 *   - These sites may serve JS-rendered content that requires a browser.
 *   - Site HTML structure changes frequently, breaking parsers.
 *   - Some may CAPTCHA or block datacenter IPs.
 *   - Results here are supplementary to Craigslist + Reddit.
 */

import * as cheerio from 'cheerio';
import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage, sleep } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';
import { buildGenericQueries } from '@/lib/keywordBuilder';

// --- Locanto ---

async function fetchLocanto(query: string, location: string): Promise<RawLead[]> {
  const leads: RawLead[] = [];
  const encodedQuery = encodeURIComponent(query);
  const encodedLocation = encodeURIComponent(location);

  // Locanto search URL (New York section)
  const url = `https://www.locanto.com/New-York/Services/?q=${encodedQuery}`;

  const result = await fetchPage(url);
  if (!result.ok) {
    console.warn(`[classifieds/locanto] Failed (${result.status}): ${url}`);
    return [];
  }

  try {
    const $ = cheerio.load(result.text);

    // Locanto listing selectors (these may break if site updates HTML)
    // Try multiple selectors for resilience
    const listingSelectors = [
      'article.bp_listing',
      '.listing_item',
      '[data-testid="listing-card"]',
      '.item_container',
    ];

    let $listings = $();
    for (const sel of listingSelectors) {
      $listings = $(sel);
      if ($listings.length > 0) break;
    }

    $listings.each((_, el) => {
      const titleEl = $(el).find('h2, h3, .listing_title, [class*="title"]').first();
      const linkEl = $(el).find('a[href]').first();
      const snippetEl = $(el).find('p, .listing_description, [class*="description"]').first();
      const dateEl = $(el).find('[class*="date"], time, .post_date').first();

      const title = titleEl.text().trim();
      const href = linkEl.attr('href') ?? '';
      const snippet = snippetEl.text().trim();
      const rawDate = dateEl.attr('datetime') ?? dateEl.text().trim();

      if (!title || !href) return;

      // Build absolute URL
      const url = href.startsWith('http') ? href : `https://www.locanto.com${href}`;
      const { date: postedAt, accuracy } = resolveDate(rawDate, snippet);

      leads.push({
        title,
        url,
        snippet: snippet.slice(0, 400),
        postedAt,
        postedAtAccuracy: accuracy,
        matchedKeyword: query,
        rawMetadata: { source: 'locanto' },
      });
    });

    // Fallback: try to find any links that look like listings
    if (leads.length === 0) {
      $('a[href*="/Ad/"]').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        const title = $(el).text().trim() || ($(el).attr('title') ?? '');
        if (!title || title.length < 5) return;
        const url = href.startsWith('http') ? href : `https://www.locanto.com${href}`;
        leads.push({
          title,
          url,
          snippet: '',
          postedAt: null,
          postedAtAccuracy: 'Unknown',
          matchedKeyword: query,
          rawMetadata: { source: 'locanto', fallbackParsed: true },
        });
      });
    }
  } catch (err) {
    console.error('[classifieds/locanto] Parse error:', err);
  }

  return leads;
}

// --- Oodle ---

async function fetchOodle(query: string): Promise<RawLead[]> {
  const leads: RawLead[] = [];
  const encodedQuery = encodeURIComponent(query);

  // Oodle search for NY area services
  const url = `https://www.oodle.com/services/q-${encodedQuery.replace(/%20/g, '-')}/l-New+York+City%2C+NY/`;

  const result = await fetchPage(url);
  if (!result.ok) {
    console.warn(`[classifieds/oodle] Failed (${result.status}): ${url}`);
    return [];
  }

  try {
    const $ = cheerio.load(result.text);

    // Oodle listing items
    const $listings = $('.listing, article, [class*="result"]');

    $listings.each((_, el) => {
      const titleEl = $(el).find('h2, h3, .title, a').first();
      const linkEl = $(el).find('a[href*="/listing/"]').first();
      const snippetEl = $(el).find('p, .description').first();

      const title = titleEl.text().trim();
      const href = linkEl.attr('href') ?? '';
      const snippet = snippetEl.text().trim();

      if (!title || !href) return;

      const url = href.startsWith('http') ? href : `https://www.oodle.com${href}`;

      leads.push({
        title,
        url,
        snippet: snippet.slice(0, 400),
        postedAt: null,
        postedAtAccuracy: 'Unknown',
        matchedKeyword: query,
        rawMetadata: { source: 'oodle' },
      });
    });
  } catch (err) {
    console.error('[classifieds/oodle] Parse error:', err);
  }

  return leads;
}

export async function fetchClassifiedLeads(
  areaKey: string,
  timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const allLeads: RawLead[] = [];
  const queries = buildGenericQueries(areaKey).slice(0, 5); // Cap queries

  let fetchSuccesses = 0;
  let fetchErrors = 0;

  for (const query of queries) {
    // Try Locanto
    const locantoLeads = await fetchLocanto(query, 'New York');
    if (locantoLeads.length > 0) {
      fetchSuccesses++;
      allLeads.push(...locantoLeads);
    } else {
      fetchErrors++;
    }
    await sleep(500);

    // Try Oodle
    const oodleLeads = await fetchOodle(query);
    if (oodleLeads.length > 0) {
      fetchSuccesses++;
      allLeads.push(...oodleLeads);
    }
    await sleep(500);
  }

  const seen = new Set<string>();
  const dedupedLeads = allLeads.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  const status = fetchSuccesses === 0 ? 'Blocked' : 'Partial';
  const note =
    status === 'Blocked'
      ? 'Classified sites (Locanto, Oodle) could not be reached or returned no HTML results. These sites frequently block scrapers.'
      : `Fetched from public classifieds. Results may be incomplete as these sites partially block automated access.`;

  return {
    sourceKey: 'classifieds',
    sourceName: 'Public Classifieds',
    status,
    leads: dedupedLeads,
    note,
    fetchedAt: new Date(),
  };
}
