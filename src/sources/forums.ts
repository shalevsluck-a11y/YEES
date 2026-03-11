/**
 * Reddit / Public Forums Source Adapter
 *
 * STATUS: Working
 *
 * Method: Reddit's public JSON API is accessible without authentication
 * for public subreddits. We search by keyword + location across
 * neighborhood and home improvement subreddits.
 *
 * Returned URLs are actual thread URLs (reddit.com/r/sub/comments/id/...)
 * which are direct post links.
 *
 * Limitations:
 *   - Reddit requires a descriptive User-Agent or may throttle requests.
 *   - Reddit's search is not real-time; recently posted items may lag slightly.
 *   - We cannot access private subreddits or removed posts.
 *   - API may return 429 (rate limit) under heavy use — we back off gracefully.
 */

import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage, sleep } from '@/lib/fetcher';
import { resolveDate } from '@/lib/dateResolution';
import { getRedditSubs } from '@/config/areas';

// Subreddits always searched regardless of area (home improvement focused)
const GLOBAL_SUBS = [
  'r/HomeImprovement',
  'r/DIY',
  'r/homeowners',
  'r/askhomeowners',
];

// Keywords to search on Reddit
const REDDIT_KEYWORDS = [
  'garage door repair',
  'broken spring garage door',
  'garage door stuck',
  'garage opener not working',
  'garage door off track',
  'need garage door',
  'garage door broken',
];

interface RedditPost {
  title: string;
  permalink: string;
  selftext: string;
  score: number;
  created_utc: number;
  subreddit: string;
  url: string;
  domain: string;
  is_self: boolean;
  author: string;
}

function parseRedditResponse(json: unknown): RawLead[] {
  const leads: RawLead[] = [];

  try {
    const data = json as {
      data?: { children?: { data: RedditPost }[] };
    };
    const children = data?.data?.children ?? [];

    for (const child of children) {
      const post = child.data;
      if (!post || !post.title || !post.permalink) continue;

      // Skip deleted/removed posts
      if (post.author === '[deleted]' || post.selftext === '[removed]') continue;

      const actualUrl = `https://www.reddit.com${post.permalink}`;
      const postedAt = new Date(post.created_utc * 1000);

      const snippet = post.selftext
        ? post.selftext.slice(0, 400)
        : `Posted in r/${post.subreddit}`;

      leads.push({
        title: post.title,
        url: actualUrl,
        snippet,
        location: post.subreddit,
        postedAt,
        postedAtAccuracy: 'Exact', // Reddit timestamps are precise Unix timestamps
        matchedKeyword: '',
        rawMetadata: {
          subreddit: post.subreddit,
          score: post.score,
          author: post.author,
          redditDomain: post.domain,
        },
      });
    }
  } catch (err) {
    console.error('[reddit] JSON parse error:', err);
  }

  return leads;
}

// Search Reddit's public API
// NOTE: Reddit requires a custom User-Agent for API access
async function searchReddit(
  query: string,
  subreddit: string | null,
  timeFilter: 'today' | 'this_week'
): Promise<RawLead[]> {
  const tParam = timeFilter === 'today' ? 'day' : 'week';
  const encodedQuery = encodeURIComponent(query);

  let url: string;
  if (subreddit) {
    // Search within a specific subreddit
    const sub = subreddit.replace(/^r\//, '');
    url = `https://www.reddit.com/r/${sub}/search.json?q=${encodedQuery}&sort=new&t=${tParam}&restrict_sr=1&limit=25`;
  } else {
    // Global search
    url = `https://www.reddit.com/search.json?q=${encodedQuery}&sort=new&t=${tParam}&limit=25`;
  }

  const result = await fetchPage(url, {
    acceptJson: true,
    extraHeaders: {
      // Reddit requires a descriptive User-Agent for API access
      'User-Agent': 'GarageLeadFinder/1.0 (private business tool; contact admin)',
    },
  });

  if (!result.ok) {
    if (result.status === 429) {
      console.warn('[reddit] Rate limited. Waiting 2s...');
      await sleep(2000);
    } else {
      console.warn(`[reddit] Failed (${result.status}): ${url}`);
    }
    return [];
  }

  try {
    const json = JSON.parse(result.text);
    const leads = parseRedditResponse(json);
    // Tag with matched keyword
    return leads.map(l => ({ ...l, matchedKeyword: query }));
  } catch {
    return [];
  }
}

export async function fetchForumLeads(
  areaKey: string,
  timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const allLeads: RawLead[] = [];
  let fetchErrors = 0;
  let fetchSuccesses = 0;

  // Area-specific subreddits
  const areaSubs = getRedditSubs(areaKey);

  // Combined subs to search
  const subredditsToSearch = [...new Set([...GLOBAL_SUBS, ...areaSubs])];

  // For each keyword, search relevant subreddits
  for (const keyword of REDDIT_KEYWORDS) {
    // Search neighborhood subs
    for (const sub of areaSubs.slice(0, 4)) { // Limit to 4 area subs
      const leads = await searchReddit(keyword, sub, timeFilter);
      if (leads.length > 0) {
        fetchSuccesses++;
        allLeads.push(...leads);
      } else {
        fetchErrors++;
      }
      await sleep(400); // Rate limit
    }

    // Search home improvement subs with location keyword added
    for (const sub of GLOBAL_SUBS.slice(0, 2)) { // Limit to 2 global subs per keyword
      const leads = await searchReddit(keyword, sub, timeFilter);
      if (leads.length > 0) {
        fetchSuccesses++;
        allLeads.push(...leads);
      }
      await sleep(400);
    }
  }

  // Also do a general Reddit-wide search for best coverage
  const generalQuery = 'garage door repair NYC brooklyn queens long island new jersey';
  const globalLeads = await searchReddit(generalQuery, null, timeFilter);
  if (globalLeads.length > 0) {
    fetchSuccesses++;
    allLeads.push(...globalLeads);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const dedupedLeads = allLeads.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  const status =
    fetchSuccesses === 0
      ? 'Blocked'
      : fetchErrors > fetchSuccesses * 2
        ? 'Partial'
        : 'Working';

  return {
    sourceKey: 'reddit',
    sourceName: 'Reddit / Public Forums',
    status,
    leads: dedupedLeads,
    note:
      status === 'Blocked'
        ? 'Reddit API requests failed. May be rate-limited.'
        : undefined,
    fetchedAt: new Date(),
  };
}
