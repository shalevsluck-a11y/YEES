/**
 * Reddit / Public Forums Source Adapter
 *
 * STATUS: Working (requires REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET env vars)
 *
 * Reddit's unauthenticated public API gets blocked from Vercel datacenter IPs.
 * Using OAuth (client credentials) works reliably from any server.
 *
 * Get free Reddit API credentials:
 * 1. Go to reddit.com/prefs/apps
 * 2. Click "create another app"
 * 3. Choose "script"
 * 4. Name it anything (e.g. "GarageLeadFinder")
 * 5. Set redirect URI to http://localhost
 * 6. Copy the client_id (under app name) and client_secret
 *
 * Without credentials: falls back to public API (may be blocked on Vercel).
 * With credentials: uses OAuth API — works reliably from any server.
 */

import type { SourceResult, RawLead } from '@/types/source';
import { fetchPage } from '@/lib/fetcher';
import { getRedditSubs } from '@/config/areas';

const GLOBAL_SUBS = ['HomeImprovement', 'DIY', 'homeowners'];

const REDDIT_KEYWORDS = [
  'garage door repair',
  'broken spring garage door',
  'garage door stuck',
  'garage opener not working',
  'garage door off track',
];

interface RedditPost {
  title: string;
  permalink: string;
  selftext: string;
  score: number;
  created_utc: number;
  subreddit: string;
  author: string;
}

function parseRedditJson(json: unknown, keyword: string): RawLead[] {
  const leads: RawLead[] = [];
  try {
    const data = json as { data?: { children?: { data: RedditPost }[] } };
    for (const child of data?.data?.children ?? []) {
      const post = child.data;
      if (!post?.title || !post.permalink) continue;
      if (post.author === '[deleted]' || post.selftext === '[removed]') continue;
      leads.push({
        title: post.title,
        url: `https://www.reddit.com${post.permalink}`,
        snippet: post.selftext ? post.selftext.slice(0, 400) : `Posted in r/${post.subreddit}`,
        location: post.subreddit,
        postedAt: new Date(post.created_utc * 1000),
        postedAtAccuracy: 'Exact',
        matchedKeyword: keyword,
        rawMetadata: { subreddit: post.subreddit, score: post.score, author: post.author },
      });
    }
  } catch (err) {
    console.error('[reddit] JSON parse error:', err);
  }
  return leads;
}

async function getOAuthToken(clientId: string, clientSecret: string): Promise<string | null> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  // Reddit OAuth requires a POST with form body — we'll use native fetch directly here
  try {
    const resp = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'GarageLeadFinder/1.0 by business-owner',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return null;
    const json = await resp.json() as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

async function searchRedditOAuth(
  query: string,
  subreddit: string | null,
  timeFilter: 'today' | 'this_week',
  token: string
): Promise<RawLead[]> {
  const tParam = timeFilter === 'today' ? 'day' : 'week';
  const url = subreddit
    ? `https://oauth.reddit.com/r/${subreddit}/search?q=${encodeURIComponent(query)}&sort=new&t=${tParam}&restrict_sr=1&limit=25`
    : `https://oauth.reddit.com/search?q=${encodeURIComponent(query)}&sort=new&t=${tParam}&limit=25`;

  const result = await fetchPage(url, {
    acceptJson: true,
    timeout: 8_000,
    extraHeaders: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'GarageLeadFinder/1.0 by business-owner',
    },
  });

  if (!result.ok) return [];
  try { return parseRedditJson(JSON.parse(result.text), query); }
  catch { return []; }
}

async function searchRedditPublic(
  query: string,
  timeFilter: 'today' | 'this_week'
): Promise<RawLead[]> {
  const tParam = timeFilter === 'today' ? 'day' : 'week';
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=${tParam}&limit=25`;

  const result = await fetchPage(url, {
    acceptJson: true,
    timeout: 8_000,
    extraHeaders: { 'User-Agent': 'GarageLeadFinder/1.0 by business-owner' },
  });

  if (!result.ok) return [];
  try { return parseRedditJson(JSON.parse(result.text), query); }
  catch { return []; }
}

export async function fetchForumLeads(
  areaKey: string,
  timeFilter: 'today' | 'this_week'
): Promise<SourceResult> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const useOAuth = !!(clientId && clientSecret);

  let token: string | null = null;
  if (useOAuth) {
    token = await getOAuthToken(clientId!, clientSecret!);
  }

  const allLeads: RawLead[] = [];
  let fetchSuccesses = 0;
  let fetchErrors = 0;

  const areaSubs = getRedditSubs(areaKey).map(s => s.replace(/^r\//, ''));
  const tasks: Promise<void>[] = [];

  for (const keyword of REDDIT_KEYWORDS.slice(0, 3)) {
    for (const sub of areaSubs.slice(0, 3)) {
      tasks.push((async () => {
        const leads = token
          ? await searchRedditOAuth(keyword, sub, timeFilter, token)
          : await searchRedditPublic(`${keyword} ${sub}`, timeFilter);
        if (leads.length > 0) { fetchSuccesses++; allLeads.push(...leads); }
        else fetchErrors++;
      })());
    }
    for (const sub of GLOBAL_SUBS.slice(0, 2)) {
      tasks.push((async () => {
        const leads = token
          ? await searchRedditOAuth(keyword, sub, timeFilter, token)
          : await searchRedditPublic(keyword, timeFilter);
        if (leads.length > 0) { fetchSuccesses++; allLeads.push(...leads); }
        else fetchErrors++;
      })());
    }
  }

  // Broad location-based search
  tasks.push((async () => {
    const q = 'garage door repair NYC brooklyn queens long island new jersey';
    const leads = token
      ? await searchRedditOAuth(q, null, timeFilter, token)
      : await searchRedditPublic(q, timeFilter);
    if (leads.length > 0) { fetchSuccesses++; allLeads.push(...leads); }
  })());

  await Promise.all(tasks);

  const seen = new Set<string>();
  const dedupedLeads = allLeads.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  const status = fetchSuccesses === 0 ? 'Blocked' : fetchErrors > fetchSuccesses * 2 ? 'Partial' : 'Working';

  const note = !useOAuth
    ? 'No Reddit OAuth credentials set — requests may be blocked on Vercel. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to Vercel env vars. Free at reddit.com/prefs/apps.'
    : !token
      ? 'Reddit OAuth token request failed. Check REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET in Vercel env vars.'
      : undefined;

  return {
    sourceKey: 'reddit',
    sourceName: 'Reddit / Public Forums',
    status,
    leads: dedupedLeads,
    note,
    fetchedAt: new Date(),
  };
}
