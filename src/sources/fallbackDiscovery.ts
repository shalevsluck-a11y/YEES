/**
 * Fallback Discovery Source Adapter
 *
 * STATUS: Fallback Mode
 *
 * Used ONLY when direct source adapters fail or return insufficient results.
 *
 * Method: Bing HTML search with site: operators to find Craigslist and
 * other classified posts that our direct adapters may have missed.
 *
 * If BING_API_KEY is set in .env, uses Bing Web Search API (more reliable).
 * Otherwise, scrapes Bing HTML search results (less reliable, may be rate-limited).
 *
 * Limitations:
 *   - Bing search results may include search result PAGES, not direct post URLs.
 *   - We filter aggressively for actual post-like URLs.
 *   - This should NEVER be the primary discovery method — only fallback.
 *   - Google/Bing must NOT be used as the main engine per product requirements.
 */

import * as cheerio from 'cheerio';
import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage, sleep } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';
import { cleanUrl } from '@/lib/urlResolver';

// Queries designed to find actual posts, not business pages
const FALLBACK_SITE_QUERIES = [
  'site:craigslist.org "garage door" "broken" OR "stuck" OR "repair" OR "spring" -"call now" -"free estimate"',
  'site:craigslist.org "garage door" "need" OR "looking for" OR "help" -"licensed" -"insured"',
  'site:reddit.com "garage door" "broken" OR "stuck" OR "help" "brooklyn" OR "queens" OR "bronx" OR "staten island"',
  'site:reddit.com "garage door spring" OR "garage opener" "not working" OR "broke" OR "snapped"',
];

// Domains we want to prioritize in fallback (real post pages)
const PREFERRED_DOMAINS = ['craigslist.org', 'reddit.com'];

// Domains to skip (business sites, directories, SEO pages)
const SKIP_DOMAINS = [
  'yelp.com', 'angi.com', 'thumbtack.com', 'homeadvisor.com',
  'houzz.com', 'bbb.org', 'yellowpages.com', 'angieslist.com',
];

interface BingApiResult {
  name: string;
  url: string;
  snippet: string;
  dateLastCrawled?: string;
  datePublished?: string;
}

// Use Bing Web Search API if key is available
async function bingApiSearch(query: string): Promise<RawLead[]> {
  const apiKey = process.env.BING_API_KEY;
  if (!apiKey) return [];

  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=20&freshness=Week&mkt=en-US`;

  const result = await fetchPage(url, {
    acceptJson: true,
    extraHeaders: { 'Ocp-Apim-Subscription-Key': apiKey },
  });

  if (!result.ok) {
    console.warn(`[fallback/bing-api] Failed (${result.status})`);
    return [];
  }

  try {
    const json = JSON.parse(result.text) as {
      webPages?: { value?: BingApiResult[] };
    };
    const items = json?.webPages?.value ?? [];
    const leads: RawLead[] = [];

    for (const item of items) {
      const cleanedUrl = cleanUrl(item.url);
      if (shouldSkipUrl(cleanedUrl)) continue;

      const { date: postedAt, accuracy } = resolveDate(
        item.datePublished ?? item.dateLastCrawled
      );

      leads.push({
        title: item.name,
        url: cleanedUrl,
        snippet: item.snippet,
        postedAt,
        postedAtAccuracy: accuracy,
        matchedKeyword: query,
        rawMetadata: { source: 'bing-api', dateLastCrawled: item.dateLastCrawled },
      });
    }

    return leads;
  } catch (err) {
    console.error('[fallback/bing-api] JSON parse error:', err);
    return [];
  }
}

// Scrape Bing HTML results (used when no API key)
async function bingHtmlSearch(query: string): Promise<RawLead[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&freshness=Week&count=20`;

  const result = await fetchPage(url);
  if (!result.ok) {
    console.warn(`[fallback/bing-html] Failed (${result.status})`);
    return [];
  }

  const leads: RawLead[] = [];

  try {
    const $ = cheerio.load(result.text);

    // Bing result selectors
    $('li.b_algo').each((_, el) => {
      const titleEl = $(el).find('h2 a');
      const title = titleEl.text().trim();
      const href = titleEl.attr('href') ?? '';
      const snippet = $(el).find('.b_caption p, .b_algoSlug').text().trim();
      const dateEl = $(el).find('.news_dt, [class*="date"]').first();
      const rawDate = dateEl.text().trim();

      if (!title || !href) return;

      const cleanedUrl = cleanUrl(href);
      if (shouldSkipUrl(cleanedUrl)) return;

      const { date: postedAt, accuracy } = resolveDate(rawDate, snippet);

      leads.push({
        title,
        url: cleanedUrl,
        snippet: snippet.slice(0, 400),
        postedAt,
        postedAtAccuracy: accuracy,
        matchedKeyword: query,
        rawMetadata: { source: 'bing-html' },
      });
    });
  } catch (err) {
    console.error('[fallback/bing-html] Parse error:', err);
  }

  return leads;
}

function shouldSkipUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    // Skip known business directory / non-lead domains
    if (SKIP_DOMAINS.some(d => host.includes(d))) return true;

    // Skip generic pages (homepages, category pages, search pages)
    if (u.pathname === '/' || u.pathname === '') return true;
    if (/\/search[/?]/.test(u.pathname)) return true;
    if (/[?&](q|query)=/.test(u.search)) return true;

    return false;
  } catch {
    return false;
  }
}

export async function fetchFallbackLeads(
  areaKey: string,
  timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const allLeads: RawLead[] = [];
  const hasBingKey = !!process.env.BING_API_KEY;

  let fetchSuccesses = 0;
  let fetchErrors = 0;

  for (const query of FALLBACK_SITE_QUERIES) {
    let leads: RawLead[];

    if (hasBingKey) {
      leads = await bingApiSearch(query);
    } else {
      leads = await bingHtmlSearch(query);
    }

    if (leads.length > 0) {
      fetchSuccesses++;
      allLeads.push(...leads);
    } else {
      fetchErrors++;
    }

    await sleep(800); // Be polite to Bing
  }

  // Deduplicate
  const seen = new Set<string>();
  const dedupedLeads = allLeads.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  const status = fetchSuccesses === 0 ? 'Blocked' : 'Fallback Mode';
  const note = hasBingKey
    ? 'Using Bing API for fallback discovery. Results may include non-direct URLs.'
    : 'Using Bing HTML scraping for fallback discovery. No BING_API_KEY set. Results may be limited or blocked. Set BING_API_KEY in .env for more reliable fallback.';

  return {
    sourceKey: 'fallback',
    sourceName: 'Fallback Discovery (Bing)',
    status,
    leads: dedupedLeads,
    note,
    fetchedAt: new Date(),
  };
}
