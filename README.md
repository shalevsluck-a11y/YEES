# 🚪 Garage Door Lead Finder

A practical, working web app that finds **real homeowner posts** from public websites where people are actively looking for garage door service in NYC, Long Island, and North NJ.

---

## What It Does

- Searches **Craigslist gigs sections** (RSS feeds — direct post links)
- Searches **Reddit** public subreddits for homeowner requests
- Searches **public classifieds** (Locanto, Oodle) when accessible
- **Scores each lead** from 0–100 based on customer intent language
- **Filters out competitor ads** and business listings
- **Opens the actual post** — not a search page, not a homepage
- Exports to CSV, shows source health status, marks contacted leads

---

## Quick Start

### 1. Install dependencies

```bash
cd garage-lead-finder
npm install
```

### 2. Configure environment (optional)

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Bing API key for better fallback discovery (free tier available at https://www.microsoft.com/en-us/bing/apis/bing-web-search-api).

Without a Bing key, the fallback adapter uses HTML scraping (less reliable).

### 3. Run locally

```bash
npm run dev
```

Open http://localhost:3000

### 4. Build for production

```bash
npm run build
npm start
```

---

## Simple Deployment

### Vercel (recommended, free tier works)

```bash
npx vercel
```

Or connect your GitHub repo to Vercel at https://vercel.com.

Add your `BING_API_KEY` environment variable in the Vercel dashboard under Project Settings → Environment Variables.

### Railway / Render / Fly.io

Standard Next.js deployment. Set environment variables in your platform's dashboard.

---

## How to Edit Service Areas

Edit: `src/config/areas.ts`

Each area has:
- `key` — internal identifier
- `label` — display name
- `searchTerms` — what to include in search queries for that area
- `craigslistDomains` — which Craigslist subdomain to use (`newyork`, `longisland`, `newjersey`)
- `redditSubs` — which subreddits to search for that area

To add a new area, add an entry to the `SERVICE_AREAS` array.

---

## How to Edit Keywords

Edit: `src/config/keywords.ts`

- `SERVICE_KEYWORDS` — specific garage door service terms
- `INTENT_KEYWORDS` — homeowner help-seeking phrases
- `HIGH_INTENT_TERMS` — terms that boost the lead score
- `BUSINESS_AD_TERMS` — terms that lower the lead score (competitor ads)
- `CRAIGSLIST_QUERIES` — specific queries sent to Craigslist RSS

---

## How Lead Scoring Works

Every lead is scored 0–100:

| Score | Classification |
|-------|---------------|
| 80–100 | Very Likely Lead |
| 55–79 | Possible Lead |
| 0–54 | Business Ad / Ignore |

**Score increases for:**
- Matching garage door service keywords (+6 each, up to +20)
- High-intent/urgency words: "broken", "stuck", "asap", "need help" (+5 each, up to +20)
- Area match (+5–15 depending on exactness)
- Post freshness: today = +10, < 6 hours = +15
- Question format, help-seeking phrasing (+3–5)
- Price inquiry language (+4)

**Score decreases for:**
- Business ad language: "call now", "free estimate", "licensed & insured" (−8 each, up to −40)

Each lead shows a **Confidence Reason** explaining what signals were found, e.g.:
> "Matched: broken spring, brooklyn, urgent | Ad signals: free estimate"

---

## Source Status

| Source | Status | Notes |
|--------|--------|-------|
| Craigslist | **Working** | Uses public RSS feeds. Direct post links. Best source. |
| Reddit | **Working** | Uses public JSON API. Direct thread links. |
| Public Classifieds | **Partial** | Locanto/Oodle may block scrapers. Supplementary. |
| OfferUp | **Blocked** | Requires JS/login. No public access. |
| Facebook Marketplace | **Blocked** | Requires login. No public access. |
| Yelp | **Partial** | Request-a-Quote is behind login. Only shows business listings (competitors). |
| Fallback (Bing) | **Fallback Mode** | Only runs if primary sources return < 5 leads. |

The app is **honest about what it can and cannot access**. It will never pretend a blocked source is working.

---

## Source Details

### Craigslist (Primary — Best Source)
- Uses Craigslist's public RSS feeds
- Searches the **labor gigs** (`lbg`) and **skilled trades gigs** (`shg`) sections
- These are where homeowners post: "need someone to fix my garage door"
- RSS returns actual post URLs (e.g., `newyork.craigslist.org/bro/lbg/d/brooklyn.../12345.html`)
- Searched for each area: NYC → `newyork.craigslist.org`, Long Island → `longisland.craigslist.org`, NJ → `newjersey.craigslist.org`

### Reddit (Primary — Good for Community Posts)
- Uses Reddit's public JSON API (no auth required for public subs)
- Searches neighborhood subs: r/brooklyn, r/queens, r/nyc, r/longisland, r/newjersey
- Also searches home improvement subs: r/HomeImprovement, r/homeowners
- Returns actual thread URLs

### Public Classifieds (Secondary — Partial)
- Attempts Locanto and Oodle
- These sites may serve JS-rendered pages or block scrapers
- Included as supplementary source; results may be sparse

### Fallback Discovery (Bing)
- Only activates when primary sources return fewer than 5 leads
- Uses Bing with `site:craigslist.org` and `site:reddit.com` operators
- With `BING_API_KEY` set: uses official Bing API (recommended)
- Without key: scrapes Bing HTML (less reliable, may be blocked)

---

## File Structure

```
src/
├── app/
│   ├── page.tsx              ← Main UI page
│   ├── layout.tsx
│   ├── globals.css
│   └── api/search/route.ts  ← API endpoint that runs all sources
├── components/
│   ├── FilterBar.tsx         ← Time/area/source filters + search button
│   ├── LeadCard.tsx          ← Individual lead display + actions
│   ├── ResultsSummary.tsx    ← Stats + CSV export + copy links
│   └── SourceStatusPanel.tsx ← Source health status display
├── sources/
│   ├── craigslist.ts         ← Craigslist RSS adapter (Working)
│   ├── forums.ts             ← Reddit public API adapter (Working)
│   ├── classifieds.ts        ← Locanto/Oodle adapter (Partial)
│   ├── offerup.ts            ← OfferUp adapter (Blocked — stub)
│   ├── facebookPublic.ts     ← Facebook adapter (Blocked — stub)
│   ├── yelpPublic.ts         ← Yelp adapter (Partial — stub)
│   └── fallbackDiscovery.ts  ← Bing fallback adapter
├── lib/
│   ├── leadScoring.ts        ← 0–100 scoring algorithm
│   ├── dedup.ts              ← URL + title deduplication
│   ├── dateResolution.ts     ← Parse/estimate post dates
│   ├── locationMatching.ts   ← Match text to service areas
│   ├── keywordBuilder.ts     ← Build search queries per area
│   ├── urlResolver.ts        ← Validate/resolve actual post URLs
│   ├── normalization.ts      ← Convert raw leads to unified format
│   └── fetcher.ts            ← HTTP fetching with timeout/headers
├── types/
│   ├── lead.ts               ← Lead and SearchFilters types
│   └── source.ts             ← Source adapter types
└── config/
    ├── keywords.ts           ← ← EDIT HERE for keywords
    ├── areas.ts              ← ← EDIT HERE for service areas
    └── sources.ts            ← Source configurations
```

---

## Known Limitations

1. **Craigslist rate limiting**: If you search too frequently, Craigslist may temporarily block requests from your server's IP. The app limits queries and adds delays to minimize this.

2. **Craigslist freshness**: The RSS feed typically returns the 25 most recent posts per category per query. Very new posts appear quickly; posts older than a few days may not appear.

3. **Reddit search lag**: Reddit's search index may lag 5–15 minutes behind actual posts.

4. **Classifieds unreliability**: Locanto and Oodle frequently update their HTML or add bot protection. Expect this source to break periodically. It is supplementary to Craigslist + Reddit.

5. **OfferUp/Facebook**: These require login and cannot be accessed publicly. No workaround without violating their terms of service.

6. **Date estimation**: When posts don't include exact timestamps, dates are estimated from text ("2 hours ago", "today", etc.). These are labeled "est." in the UI.

7. **Business ad filtering is not perfect**: The scoring algorithm catches most obvious ads, but some businesses post in a homeowner style. Always review leads manually.

8. **Fallback Bing HTML scraping**: Without a Bing API key, the fallback scrapes Bing's HTML search pages. Bing may block or CAPTCHA this. Add a free Bing API key for reliability.

---

## Phase Roadmap

### Phase 1 (Current)
- ✅ Craigslist RSS adapter (direct post links)
- ✅ Reddit public API adapter (direct thread links)
- ✅ Public classifieds adapter (Locanto, Oodle)
- ✅ Fallback discovery (Bing)
- ✅ Lead scoring (0–100)
- ✅ Deduplication
- ✅ CSV export
- ✅ Source status panel

### Phase 2 (Future)
- Headless browser support for OfferUp (requires Puppeteer/Playwright hosting)
- Nextdoor public API if it becomes available
- Better date parsing heuristics
- More classified site adapters

### Phase 3 (Future)
- Persistent saved leads (database)
- Lead history / previously seen
- Email notifications for new leads
- Remember filters between sessions
- Mobile app
