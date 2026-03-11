// Shared HTTP fetching utilities for source adapters

const DEFAULT_TIMEOUT = parseInt(process.env.FETCH_TIMEOUT_MS ?? '12000', 10);

// Rotating user agents to reduce bot detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
];

let uaIndex = 0;
function nextUserAgent(): string {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;
  return ua;
}

export interface FetchResult {
  ok: boolean;
  text: string;
  status: number;
  error?: string;
}

// Fetch with timeout and proper headers
export async function fetchPage(
  url: string,
  options: {
    timeout?: number;
    acceptXml?: boolean;
    acceptJson?: boolean;
    extraHeaders?: Record<string, string>;
  } = {}
): Promise<FetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_TIMEOUT);

  try {
    const accept = options.acceptJson
      ? 'application/json, text/javascript, */*; q=0.01'
      : options.acceptXml
        ? 'application/rss+xml, application/xml, text/xml, */*'
        : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': nextUserAgent(),
        Accept: accept,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...(options.extraHeaders ?? {}),
      },
    });

    const text = await response.text();
    return { ok: response.ok, text, status: response.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, text: '', status: 0, error: msg };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Small sleep helper for rate limiting between requests
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run an array of async tasks with concurrency limit
export async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function run(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => run());
  await Promise.all(workers);
  return results;
}
