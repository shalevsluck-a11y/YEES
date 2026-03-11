// Resolve and validate actual post URLs
// Returns { resolved, url, isResolved }

// Known patterns that indicate a post/listing URL vs a generic page
const LISTING_URL_PATTERNS = [
  // Craigslist post URLs: /bro/lbg/d/title/12345.html
  /craigslist\.org\/[a-z]+\/[a-z]+\/d\/[^/]+\/\d+\.html/,
  // Reddit thread URLs
  /reddit\.com\/r\/\w+\/comments\/\w+/,
  // Locanto listing
  /locanto\.com\/[A-Z0-9-]+\.html/,
  // Hoobly listing
  /hoobly\.com\/classifieds\//,
  // Oodle listing
  /oodle\.com\/listing\//,
  // Generic pattern: URL has a numeric ID at end
  /\/\d{5,}(?:\.html?)?(?:\?|$)/,
  // URLs with slugs that look like post titles
  /\/[a-z0-9]+(?:-[a-z0-9]+){3,}(?:\/|$)/,
];

const GENERIC_PAGE_PATTERNS = [
  // Search result pages
  /\/search[/?]/,
  /[?&]q=/,
  /[?&]query=/,
  // Category pages
  /\/category\//,
  /\/categories\//,
  // Tag pages
  /\/tag\//,
  /\/tags\//,
  // Homepage indicators
  /^https?:\/\/[^/]+\/?$/,
  // Google/Bing result pages
  /google\.com\/search/,
  /bing\.com\/search/,
  // Feed pages
  /\/feed\/?$/,
  /\/rss\/?$/,
];

export interface UrlResolution {
  url: string;
  isResolved: boolean;
  reason?: string;
}

export function resolvePostUrl(rawUrl: string): UrlResolution {
  if (!rawUrl) {
    return { url: '', isResolved: false, reason: 'No URL provided' };
  }

  try {
    new URL(rawUrl); // Validate it's a real URL
  } catch {
    return { url: rawUrl, isResolved: false, reason: 'Invalid URL format' };
  }

  // Check if it matches generic/bad patterns
  for (const pattern of GENERIC_PAGE_PATTERNS) {
    if (pattern.test(rawUrl)) {
      return { url: rawUrl, isResolved: false, reason: 'Points to generic/search page' };
    }
  }

  // Check if it matches known listing patterns
  for (const pattern of LISTING_URL_PATTERNS) {
    if (pattern.test(rawUrl)) {
      return { url: rawUrl, isResolved: true };
    }
  }

  // For URLs that don't match either pattern,
  // assume resolved if the path has reasonable depth and no search params
  try {
    const u = new URL(rawUrl);
    const pathSegments = u.pathname.split('/').filter(Boolean);
    if (pathSegments.length >= 2 && u.search === '') {
      return { url: rawUrl, isResolved: true };
    }
    if (pathSegments.length >= 3) {
      return { url: rawUrl, isResolved: true };
    }
  } catch {
    // ignore
  }

  return { url: rawUrl, isResolved: false, reason: 'Could not confirm direct post URL' };
}

// Clean up a URL from search result snippets
export function cleanUrl(url: string): string {
  // Remove common tracking/redirect wrappers
  try {
    const u = new URL(url);

    // Google redirect URLs
    if (u.hostname === 'www.google.com' && u.pathname === '/url') {
      const actual = u.searchParams.get('url') || u.searchParams.get('q');
      if (actual) return actual;
    }

    // Bing redirect URLs
    if (u.hostname.includes('bing.com') && u.pathname === '/ck/a') {
      const actual = u.searchParams.get('u');
      if (actual) return decodeURIComponent(actual.replace(/^a1/, ''));
    }

    return url;
  } catch {
    return url;
  }
}
