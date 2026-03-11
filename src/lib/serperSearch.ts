/**
 * Shared Serper.dev (Google Search API) utility.
 * Used by multiple source adapters so the logic isn't duplicated.
 */

import type { RawLead } from '@/types/source';
import { resolveDate } from '@/lib/dateResolution';
import { cleanUrl } from '@/lib/urlResolver';

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

interface SerperResponse {
  organic?: SerperResult[];
}

const TITLE_GARAGE_TERMS = [
  'garage', 'overhead door', 'opener', 'torsion spring', 'door spring',
];

const JOB_POST_SIGNALS = [
  'will train', 'we are hiring', 'help wanted', 'apply now',
  'monday through friday', 'hiring now', 'full-time', 'part-time',
  'submit your resume', 'send resume', 'per hour', 'weekends required',
  'background check required', 'general labor',
];

export function titleHasGarageContext(title: string): boolean {
  const lower = title.toLowerCase();
  return TITLE_GARAGE_TERMS.some(t => lower.includes(t));
}

export function isJobPosting(title: string, snippet: string): boolean {
  const text = `${title} ${snippet}`.toLowerCase();
  return JOB_POST_SIGNALS.some(s => text.includes(s));
}

/**
 * Run a single Serper query and return qualifying raw leads.
 * Applies title-garage and job-posting guards before returning.
 */
export async function serperSearch(
  query: string,
  apiKey: string,
  skipDomains: string[] = []
): Promise<RawLead[]> {
  let response: Response;
  try {
    response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 10, tbs: 'qdr:w' }),
    });
  } catch {
    return [];
  }

  if (!response.ok) return [];

  let json: SerperResponse;
  try {
    json = await response.json() as SerperResponse;
  } catch {
    return [];
  }

  const leads: RawLead[] = [];
  for (const item of json.organic ?? []) {
    try {
      const u = new URL(item.link);
      const host = u.hostname.replace(/^www\./, '');
      if (skipDomains.some(d => host.includes(d))) continue;
      if (u.pathname === '/' || u.pathname === '') continue;
    } catch {
      continue;
    }

    if (!titleHasGarageContext(item.title)) continue;
    if (isJobPosting(item.title, item.snippet)) continue;

    const cleanedUrl = cleanUrl(item.link);
    const { date: postedAt, accuracy } = resolveDate(item.date);

    leads.push({
      title: item.title,
      url: cleanedUrl,
      snippet: item.snippet,
      postedAt,
      postedAtAccuracy: accuracy,
      matchedKeyword: query,
      rawMetadata: { source: 'serper' },
    });
  }

  return leads;
}

/** Run multiple queries in parallel and deduplicate by URL. */
export async function runSerperQueries(
  queries: string[],
  apiKey: string,
  skipDomains?: string[]
): Promise<RawLead[]> {
  const results = await Promise.all(
    queries.map(q => serperSearch(q, apiKey, skipDomains).catch(() => [] as RawLead[]))
  );
  const all = results.flat();
  const seen = new Set<string>();
  return all.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}
