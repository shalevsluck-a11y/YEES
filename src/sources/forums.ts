/**
 * Reddit / Public Forums Source Adapter
 *
 * STATUS: Partial — uses Reddit's public JSON endpoints (no auth required)
 *
 * Reddit exposes public JSON at any subreddit or search URL by appending .json.
 * This works without OAuth for reading posts, though Vercel datacenter IPs
 * may occasionally get rate-limited (429). Results are best-effort.
 *
 * Rate limit: ~1 request/second without auth. We run a small batch in parallel.
 *
 * Subreddits searched:
 *   r/HomeImprovement, r/DIY, r/nyc, r/brooklyn, r/longisland, r/newjersey, etc.
 */

import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';
import { getRedditSubs } from '@/config/areas';

const REDDIT_BASE = 'https://www.reddit.com';

// Core subreddits most likely to have homeowner repair requests
const CORE_SUBS = ['r/HomeImprovement', 'r/DIY'];

// Targeted queries to find homeowners (not contractors) posting about garage problems
const CORE_QUERIES = [
  'garage door broken',
  'garage door spring',
  'garage door stuck',
];

interface RedditPost {
  title: string;
  selftext: string;
  created_utc: number;
  subreddit: string;
  permalink: string;
  author: string;
}

interface RedditResponse {
  data?: {
    children?: Array<{ data: RedditPost }>;
  };
}

function buildSubredditSearchUrl(sub: string, query: string): string {
  // sub format: "r/HomeImprovement"
  const params = new URLSearchParams({
    q: query,
    sort: 'new',
    t: 'week',
    limit: '25',
    restrict_sr: '1',
  });
  return `${REDDIT_BASE}/${sub}/search.json?${params}`;
}

function buildBroadSearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    sort: 'new',
    t: 'week',
    limit: '25',
  });
  return `${REDDIT_BASE}/search.json?${params}`;
}

async function fetchRedditUrl(url: string): Promise<RawLead[]> {
  const result = await fetchPage(url, {
    acceptJson: true,
    timeout: 6_000,
    extraHeaders: {
      // Reddit requires a real-looking User-Agent — empty UA gets blocked immediately
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    },
  });

  if (!result.ok) {
    console.warn(`[reddit] Failed (${result.status}): ${url}`);
    return [];
  }

  let json: RedditResponse;
  try {
    json = JSON.parse(result.text) as RedditResponse;
  } catch {
    return [];
  }

  const leads: RawLead[] = [];
  for (const child of json.data?.children ?? []) {
    const post = child.data;
    if (!post.title || !post.permalink) continue;

    const fullUrl = `https://www.reddit.com${post.permalink}`;
    const postedDate = new Date(post.created_utc * 1000);
    const snippet = post.selftext ? post.selftext.slice(0, 400) : '';

    leads.push({
      title: post.title,
      url: fullUrl,
      snippet,
      postedAt: postedDate,
      postedAtAccuracy: 'Exact',
      matchedKeyword: post.title,
      rawMetadata: { source: 'reddit', subreddit: post.subreddit, author: post.author },
    });
  }

  return leads;
}

export async function fetchForumLeads(
  areaKey: string,
  _timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const allLeads: RawLead[] = [];
  let fetchSuccesses = 0;
  let fetchErrors = 0;

  // Include area-specific subs (e.g. r/brooklyn, r/longisland)
  const areaSubs = getRedditSubs(areaKey).slice(0, 3);
  const subsToSearch = [...new Set([...CORE_SUBS, ...areaSubs])].slice(0, 5);

  const tasks: Promise<void>[] = [];

  // Search each subreddit with core garage queries
  for (const sub of subsToSearch) {
    for (const query of CORE_QUERIES.slice(0, 2)) {
      const url = buildSubredditSearchUrl(sub, query);
      tasks.push(
        fetchRedditUrl(url)
          .then(leads => {
            if (leads.length > 0) { fetchSuccesses++; allLeads.push(...leads); }
            else { fetchErrors++; }
          })
          .catch(() => { fetchErrors++; })
      );
    }
  }

  // Broad search across all of Reddit targeting the service area
  const broadQuery = 'garage door broken stuck spring repair brooklyn OR queens OR "long island" OR "new jersey" OR nyc OR bronx';
  tasks.push(
    fetchRedditUrl(buildBroadSearchUrl(broadQuery))
      .then(leads => {
        if (leads.length > 0) { fetchSuccesses++; allLeads.push(...leads); }
        else { fetchErrors++; }
      })
      .catch(() => { fetchErrors++; })
  );

  await Promise.all(tasks);

  const seen = new Set<string>();
  const deduped = allLeads.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  const status = fetchSuccesses === 0 ? 'Blocked' : fetchErrors > fetchSuccesses ? 'Partial' : 'Working';

  return {
    sourceKey: 'reddit',
    sourceName: 'Reddit / Public Forums',
    status,
    leads: deduped,
    note: status === 'Blocked'
      ? 'Reddit public JSON returned no results — Vercel datacenter IPs may be rate-limited. Bing/Serper sources search Reddit posts indirectly via search index.'
      : status === 'Partial'
        ? `Some Reddit searches failed (${fetchErrors} errors). Datacenter IPs may be rate-limited. Results from successful requests are included.`
        : undefined,
    fetchedAt: new Date(),
  };
}
