/**
 * Patch.com Source Adapter
 *
 * STATUS: Partial
 *
 * Patch.com is a local community news and classifieds platform covering
 * NYC neighborhoods and North Jersey towns. Homeowners post service
 * requests in the classifieds section — "need garage door repaired",
 * "looking for handyman", etc.
 *
 * No login required. HTML is server-rendered (no JS required).
 *
 * Also searches Patch's site-wide search for garage-related posts.
 */

import * as cheerio from 'cheerio';
import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage, sleep } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';

// Patch community slugs by area key — format: state/city-slug
const PATCH_COMMUNITIES: Record<string, string[]> = {
  nyc:          ['new-york/brooklyn', 'new-york/queens', 'new-york/bronx', 'new-york/staten-island'],
  brooklyn:     ['new-york/brooklyn', 'new-york/bay-ridge', 'new-york/bensonhurst-brooklyn'],
  queens:       ['new-york/queens', 'new-york/flushing', 'new-york/jackson-heights'],
  bronx:        ['new-york/the-bronx', 'new-york/riverdale-bronx'],
  staten_island:['new-york/staten-island'],
  long_island:  ['new-york/hempstead', 'new-york/babylon-ny', 'new-york/huntington'],
  north_jersey: ['new-jersey/hackensack', 'new-jersey/jersey-city', 'new-jersey/newark'],
  all:          ['new-york/brooklyn', 'new-york/queens', 'new-york/staten-island', 'new-york/hempstead', 'new-jersey/hackensack'],
};

// Keywords to look for in listing text to keep only relevant results
const RELEVANT_KEYWORDS = ['garage', 'door', 'spring', 'opener', 'repair', 'broken', 'stuck', 'handyman'];

function isRelevantText(text: string): boolean {
  const lower = text.toLowerCase();
  return RELEVANT_KEYWORDS.some(kw => lower.includes(kw));
}

function buildClassifiedsUrl(community: string): string {
  return `https://patch.com/${community}/classifieds`;
}

function buildSearchUrl(query: string): string {
  return `https://patch.com/search?q=${encodeURIComponent(query)}&contentType=classified`;
}

async function fetchPatchCommunity(community: string): Promise<RawLead[]> {
  const url = buildClassifiedsUrl(community);
  const result = await fetchPage(url, { timeout: 7_000 });

  if (!result.ok) {
    console.warn(`[patch] Failed (${result.status}): ${url}`);
    return [];
  }

  const leads: RawLead[] = [];

  try {
    const $ = cheerio.load(result.text);

    // Patch uses a few different layouts — try each
    const cardSelectors = [
      'article[class*="classified"]',
      '[class*="ClassifiedCard"]',
      '[class*="classified-item"]',
      '.card',
      'article',
      'li[class*="story"]',
    ];

    let $cards = $();
    for (const sel of cardSelectors) {
      $cards = $(sel);
      if ($cards.length > 0) break;
    }

    $cards.each((_, el) => {
      const titleEl   = $(el).find('h2, h3, h4, [class*="title"], [class*="headline"], a').first();
      const linkEl    = $(el).find('a[href]').first();
      const snippetEl = $(el).find('p, [class*="description"], [class*="excerpt"], [class*="body"]').first();
      const dateEl    = $(el).find('time, [class*="date"], [class*="timestamp"]').first();

      const title   = titleEl.text().trim();
      const href    = linkEl.attr('href') ?? '';
      const snippet = snippetEl.text().trim();
      const rawDate = dateEl.attr('datetime') ?? dateEl.text().trim();

      if (!title || title.length < 5 || !href) return;
      if (!isRelevantText(`${title} ${snippet}`)) return;

      const fullUrl = href.startsWith('http') ? href : `https://patch.com${href}`;
      const { date: postedAt, accuracy } = resolveDate(rawDate);
      const locationLabel = community.split('/').pop()?.replace(/-/g, ' ') ?? community;

      leads.push({
        title,
        url: fullUrl,
        snippet: snippet.slice(0, 400),
        location: locationLabel,
        postedAt,
        postedAtAccuracy: accuracy,
        matchedKeyword: 'garage door',
        rawMetadata: { source: 'patch', community },
      });
    });

    // Fallback: look for any classified links mentioning relevant keywords
    if (leads.length === 0) {
      $('a[href*="/classifieds/"]').each((_, el) => {
        const href  = $(el).attr('href') ?? '';
        const title = $(el).text().trim();
        if (!title || title.length < 5) return;
        if (!isRelevantText(title)) return;
        const fullUrl = href.startsWith('http') ? href : `https://patch.com${href}`;
        leads.push({
          title,
          url: fullUrl,
          snippet: '',
          postedAt: null,
          postedAtAccuracy: 'Unknown',
          matchedKeyword: 'garage door',
          rawMetadata: { source: 'patch', community, fallbackParsed: true },
        });
      });
    }
  } catch (err) {
    console.error('[patch] Parse error:', err);
  }

  return leads;
}

async function fetchPatchSearch(query: string): Promise<RawLead[]> {
  const url = buildSearchUrl(query);
  const result = await fetchPage(url, { timeout: 7_000 });
  if (!result.ok) return [];

  const leads: RawLead[] = [];

  try {
    const $ = cheerio.load(result.text);

    // Patch search results are usually article cards
    $('article, [class*="SearchResult"], [class*="story-card"]').each((_, el) => {
      const titleEl   = $(el).find('h2, h3, h4, [class*="title"], a').first();
      const linkEl    = $(el).find('a[href]').first();
      const snippetEl = $(el).find('p, [class*="excerpt"], [class*="description"]').first();
      const dateEl    = $(el).find('time, [class*="date"]').first();

      const title   = titleEl.text().trim();
      const href    = linkEl.attr('href') ?? '';
      const snippet = snippetEl.text().trim();
      const rawDate = dateEl.attr('datetime') ?? dateEl.text().trim();

      if (!title || title.length < 5 || !href) return;
      if (!isRelevantText(`${title} ${snippet}`)) return;

      const fullUrl = href.startsWith('http') ? href : `https://patch.com${href}`;
      const { date: postedAt, accuracy } = resolveDate(rawDate);

      leads.push({
        title,
        url: fullUrl,
        snippet: snippet.slice(0, 400),
        postedAt,
        postedAtAccuracy: accuracy,
        matchedKeyword: query,
        rawMetadata: { source: 'patch', searchQuery: query },
      });
    });
  } catch (err) {
    console.error('[patch/search] Parse error:', err);
  }

  return leads;
}

export async function fetchPatchLeads(
  areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const communities = PATCH_COMMUNITIES[areaKey] ?? PATCH_COMMUNITIES['all'];
  const communitiesToFetch = communities.slice(0, 4);

  const allLeads: RawLead[] = [];
  let fetchSuccesses = 0;
  let fetchErrors = 0;

  // Fetch community classifieds pages sequentially to avoid hammering
  for (const community of communitiesToFetch) {
    const leads = await fetchPatchCommunity(community);
    if (leads.length > 0) {
      fetchSuccesses++;
      allLeads.push(...leads);
    } else {
      fetchErrors++;
    }
    await sleep(300);
  }

  // Also search Patch's site-wide search for garage leads
  const searchLeads = await fetchPatchSearch('garage door repair');
  if (searchLeads.length > 0) {
    fetchSuccesses++;
    allLeads.push(...searchLeads);
  }

  const seen = new Set<string>();
  const deduped = allLeads.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  const status = fetchSuccesses === 0 ? 'Blocked' : fetchErrors > fetchSuccesses ? 'Partial' : 'Working';

  return {
    sourceKey: 'patch',
    sourceName: 'Patch.com (Local Classifieds)',
    status,
    leads: deduped,
    note: status === 'Blocked'
      ? 'Patch.com classifieds could not be accessed. The site may be blocking datacenter IPs or the HTML structure has changed.'
      : status === 'Partial'
        ? 'Some Patch communities returned no garage-related listings. Results shown are from communities that responded.'
        : undefined,
    fetchedAt: new Date(),
  };
}
