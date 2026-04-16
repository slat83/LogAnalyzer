# LogAnalyzer

Generic access log analysis tool with interactive dashboard. Supports multiple projects with configurable URL classification, external data enrichment (GSC, GA4), schema.org validation, and secure credential management.

**IMPORTANT:** This is a public repository. Never commit client-specific data, credentials, API keys, or analysis results.

**DATA TRACKING START DATE: March 11, 2026** — all analysis, GSC, GA4, and log data is meaningful only from this date forward. This is the baseline for measuring progress.

## Tech Stack

- **Framework:** Next.js 15 (App Router, serverless — NOT static export)
- **Language:** TypeScript (strict mode)
- **UI:** React 19, Tailwind CSS v4 (`@tailwindcss/postcss` plugin), Recharts 2.15+
- **Backend:** Supabase PostgreSQL (Pro tier, eu-central-1) — Auth, Storage, RLS, Edge Functions
- **Deployment:** Vercel free tier (serverless functions)
- **External APIs:** Google Search Console, Google Analytics 4 (OAuth2 refresh token flow)

## Project Structure

```
app/                          # Next.js App Router
  layout.tsx                  # Root layout (ProjectProvider, dark theme)
  page.tsx                    # Overview dashboard
  login/                      # Auth login page
  projects/                   # Project management + settings
  clusters/                   # URL cluster drill-down
  pages/                      # SEO pages with GSC/GA4 data
  errors/                     # 404/5xx/slow error analysis
  performance/                # Response time distribution
  bots/                       # Bot traffic analysis
  redirects/                  # 3xx redirect analysis
  crawl-budget/               # Googlebot crawl efficiency
  checkout/                   # Checkout funnel metrics
  languages/                  # Traffic by language
  heatmap/                    # 24h x N-day heatmaps
  schema/                     # Schema.org validation
  api/                        # 13 API routes (all auth-protected)
    projects/[id]/
      route.ts                # Project CRUD
      summary/route.ts        # GET: reconstructs full Summary from normalized tables
      analysis/route.ts       # POST: decomposes parsed Summary into tables
      credentials/            # Credential CRUD (encrypted)
      pages/                  # Pages enrichment (GSC+GA4)
        enrich/route.ts       # POST: trigger Edge Function
        cluster/[clusterId]/  # GET: pages in a cluster
        status/route.ts       # GET: enrichment run status
      schema/                 # Schema validation
        scan/route.ts         # POST: trigger Edge Function
        history/route.ts      # GET: trend data
components/                   # Shared UI
  Card.tsx                    # KPI display card
  DataTable.tsx               # Sortable, paginated generic table
  Layout.tsx                  # Sidebar + mobile nav (Manage/Core/Advanced)
  NoProject.tsx               # Empty state when no project selected
  LogUploader.tsx             # File upload + Web Worker progress
lib/                          # Shared utilities
  types.ts                    # All TypeScript interfaces (298 lines)
  data.ts                     # Data fetching layer (API-backed, cached)
  encryption.ts               # AES-256-GCM encrypt/decrypt
  paginate.ts                 # fetchAllPaged — walks PostgREST's 1000-row cap
  cluster-projection.ts       # projectCluster — recompute cluster stats for date range
  error-projection.ts         # projectErrors — 404/5xx/slow tables from cluster detail
  bot-projection.ts           # projectBots — filter bots & derive bot-vs-human from byDay
  redirect-projection.ts      # projectRedirects — 301/302/307/308 per pattern
  date-range-context.tsx      # React Context + localStorage for active range
  date-range-filter.ts        # filterByDateRange pure helper (testable without JSX)
  use-summary.ts              # React hook for Summary with loading/error
  project-context.tsx         # React Context for active project ID
  supabase/                   # Supabase clients (browser, server, middleware)
  parser/                     # Client-side log parser
    worker.ts                 # Web Worker (off-main-thread parsing)
    index.ts                  # parseLogFiles() orchestrator
    stats.ts                  # ReservoirStats (O(k) percentile approx) + statsFromSamples
    bots.ts                   # Bot detection (17+ named + generic)
    classify.ts               # URL classification (custom rules + defaults)
tests/                        # Test suites (npm test runs both)
  cluster-projection.test.ts  # vitest — cluster date-range re-projection
  error-projection.test.ts    # vitest — errors page date-range re-projection
  bot-projection.test.ts      # vitest — bots page filter + Bot-vs-Human derivation
  redirect-projection.test.ts # vitest — redirects page projection + fallback
  parser.test.ts              # vitest — parser output, bot topPages cap regression
  stats.test.ts               # vitest — reservoir + statsFromSamples
  date-range.test.ts          # vitest — filterByDateRange edge cases
  paginate.test.mjs           # node --test — PostgREST 1000-row pagination invariant
docs/                         # Documentation
  requirements.md             # Phased requirements (0-5)
  architecture-mindmap.md     # Complete architecture mindmap
```

## Development

```bash
npm run dev             # Start Next.js dev server (frontend + API routes)
npm run build           # Production build
npm run start           # Start production server
npm test                # Runs both vitest (tests/*.test.ts) and node --test (tests/*.test.mjs)
```

### Tests

- `vitest` suite in `tests/*.test.ts` covers pure logic: log parser, `statsFromSamples`, `filterByDateRange`, every `*-projection.ts` module. 60+ cases.
- `node --test` suite in `tests/*.test.mjs` covers API-boundary invariants that vitest can't reach, e.g. Supabase's 1000-row pagination behaviour (`paginate.test.mjs`). Add tests here whenever you discover a regression the in-memory vitest suite couldn't have caught — the `projectCluster` tests all passed while prod shipped `0 of 200` for exactly that reason.
- Run a single file: `npx vitest run tests/parser.test.ts` or `node --test tests/paginate.test.mjs`.

### Date-range projection pattern

Every dashboard page that shows tables or KPI cards must react to the global date range. We do this client-side — no API changes — via a `project<Thing>(data, clusters, from, to)` pure helper per page. Pattern (see `lib/cluster-projection.ts`, `error-projection.ts`, `bot-projection.ts`, `redirect-projection.ts`):

1. Look up each row's matching entry in `summary.clusters[].detailByDay` by pattern. Only the top-200 clusters carry `detailByDay`; rows whose pattern is outside that set (a common case for 404 patterns and rare redirects) must keep the all-time number and be flagged `hasDetail: false` so the UI renders a `(full range)` chip.
2. Sum the relevant slice of `detailByDay[i].statuses` across the filtered days. For redirects it's `301|302|307|308`; for 5xx it's any code starting with `"5"` (not just 500 — 520/503/etc. must be counted); for slow patterns, `detailByDay` can filter the *count* but not the slow-only avg RT (the parser's slow reservoir isn't persisted).
3. Drop rows whose filtered count is zero **only if** they have detail. Rows without detail stay visible at their all-time count.
4. Return a `{ rows, isFiltered, anyDetailAvailable }` shape. The page shows a global banner "re-analyze logs to filter X by date" when `isFiltered && !anyDetailAvailable` — this happens on analyses parsed before `b1fed20`. KPI cards in that case should fall back to all-time totals, NOT render zeros.
5. Unfiltered counts and ratios (bot/human share on redirects, slow-only avgTime, bot Avg RT) stay at full-range because the parser doesn't carry them per-day. Mark them in the UI, don't silently freeze values users think are filtered.

When wiring up a new page to the date range, start from one of the existing `*-projection.ts` modules and its tests. Do NOT try to filter by re-querying the DB; `summary/route.ts` returns everything at once and pagination via `lib/paginate.ts` already covers the 1000-row cap.

### Parser memory caps — cap ADDS, never INCREMENTS

When you see `if (Object.keys(dict).length < N) dict[key] = (dict[key] || 0) + 1`, it's wrong. That condition blocks both adding a new key AND incrementing an existing one. Once the dict hits N keys, every subsequent hit on a key already in the dict gets dropped. This shipped in `bots[bot].pages` for months: Googlebot had 59,974 requests but `/login` showed count=43 because the cap kicked in after the 100th distinct URL and every later `/login` hit was discarded. The correct form is:

```ts
if (dict[key] !== undefined) {
  dict[key]++;                                    // always increment known keys
} else if (Object.keys(dict).length < N) {
  dict[key] = 1;                                  // only cap the distinct-key count
}
```

Applies to any per-bot, per-cluster, per-UA, per-pattern sampling where we bound distinct-key memory.

### Deployment

```bash
vercel --prod --force   # Deploy to production (remote build on Vercel servers)
```

Note: `vercel build` locally fails on Windows due to symlink issues. Always use remote build.

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=         # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase publishable anon key
SUPABASE_SERVICE_ROLE_KEY=        # Server-side only — for Edge Function invocation
CREDENTIAL_ENCRYPTION_KEY=        # 64-char hex AES-256 key for stored credentials
```

## Code Conventions

### Styling
- Dark theme: `bg-gray-950` (page), `bg-gray-900` (cards), `bg-gray-800` (borders/hover)
- Text: `text-gray-100` (primary), `text-gray-400` (secondary)
- Accent: `blue-600` (active nav, primary actions), `green-400`/`red-400` (status)

### Components
- All dashboard pages use `useSummary()` hook from `lib/use-summary.ts`
- Show `<NoProject />` when no project selected or no data
- Components: PascalCase filenames, default exports
- Path alias: `@/*` maps to project root

### API Routes
- All routes require Supabase Auth session (middleware enforced)
- Return consistent JSON: `{ data }` or `{ error }` with status codes
- Use `createClient()` from `@/lib/supabase/server` for server-side auth
- Use `createAdminClient()` from `@supabase/supabase-js` for service role operations

### Supabase gotchas (learned the hard way)

- **PostgREST caps every response at 1000 rows.** `.range(0, 19999)` is silently truncated — there is no warning, no error, just a short result ordered by whatever `.order()` put first. For `cluster_daily` (200 clusters × N days), `.order("day")` + the cap means the earliest days survive and the most recent are invisible, which blanks the UI whenever the user filters a recent window. **Any query that can exceed 1000 rows must paginate via `lib/paginate.ts::fetchAllPaged`.** Current callers: `app/api/projects/[id]/summary/route.ts` for `cluster_daily` / `cluster_user_agents` / `bot_daily`.
- **Firehose Edge Function requires `rules: RuleBinding[]`.** The `firehose-poller` function (v9+) early-returns `{inserted: 0, total: 0, message: "No rules configured"}` when `rules` is missing. Before invoking, load enabled rows from `competitor_rules` with a non-null `firehose_rule_id` and pass `[{id, firehoseRuleId, tag}, ...]`. Both `/api/cron/firehose` and `/api/projects/[id]/competitors/fetch` build the list; there is a legacy code path in `lib/firehose-invoke.ts` (on the `claude/ecstatic-franklin` branch) that also auto-provisions a brand rule from `projects.brand_keywords` when no rules exist.
- **`competitor_mentions` has a unique index on `(project_id, url, rule_id, matched_at)`.** NULL `rule_id` values are treated as distinct under this constraint, so legacy rows without a rule binding will not dedupe against new rows. Upserts use `ignoreDuplicates: true`.

### Frontend: never blank the view on reload errors

Render guards like `if (error || !projectId) return <NoProject/>` replace the entire dashboard. If a component does an initial load AND a reload-after-action (e.g. fetching competitor mentions), the reload's catch must NOT write to the same `error` state — otherwise a transient network hiccup wipes rows the DB still has. Pattern: distinguish `initial` vs `reload` errors, and only the initial path may trigger `<NoProject/>`; reload errors should surface via a toast/message while keeping the current rows on screen. See `app/competitors/page.tsx::loadData({ initial })`.

## Security Rules

1. **No client data in repo** — `public/data/` gitignored, all data in Supabase
2. **Credentials encrypted at rest** — AES-256-GCM via `CREDENTIAL_ENCRYPTION_KEY`
3. **Auth on all routes** — Middleware redirects unauthenticated to `/login`
4. **RLS on all 18 tables** — Users only see their own project data
5. **No secrets in client code** — Only `NEXT_PUBLIC_*` vars reach browser
6. **Never create auth users via SQL INSERT** — Use Supabase signup API (GoTrue)

## Architecture

### Three Data Pipelines

**1. Log Analysis (client-side)**
```
User drops .gz files → Web Worker decompresses + parses → Summary object
  → POST /api/projects/[id]/analysis → decomposes into 10 normalized tables
  → Dashboard reads via GET /api/projects/[id]/summary (reconstructs Summary)
```

**2. GSC + GA4 Enrichment (Edge Function)**
```
POST /api/projects/[id]/pages/enrich → decrypts OAuth2 credentials
  → Invokes Edge Function "pages-enrichment" (Deno, 400s timeout)
    → Google OAuth2 token refresh → GSC API (25K pages) + GA4 API (10K pages)
    → Classifies URLs into log clusters → aggregates metrics
  → Stores page_enrichment_runs (JSONB index) + page_data (per-URL rows)
```

**3. Schema Validation (Edge Function)**
```
POST /api/projects/[id]/schema/scan → gets URLs from cluster sample_urls
  → Invokes Edge Function "schema-validator" (50 URLs, 5 concurrent)
    → Fetches HTML → extracts JSON-LD → validates types + required fields
  → Computes deltas (NEW_ERROR/FIXED/DEGRADED) vs previous scan
  → Stores schema_results + schema_history
```

### Database: Hybrid Storage (No Duplication)

Each datum lives in exactly ONE place:

| Data | Storage | Why |
|------|---------|-----|
| Overview scalars (totalRequests, responseTime, etc.) | `analysis_runs` JSONB columns | Small, consumed as-is |
| Heatmap matrices, checkout funnel | `analysis_runs` JSONB columns | Always consumed whole |
| Clusters (200 rows) + daily + user agents | Normalized tables | Need sorting, drill-down |
| Errors, bots, redirects, languages | Normalized tables | Need sorting, filtering |
| Pages index (cluster metadata) | `page_enrichment_runs.pages_index` JSONB | Single query for list view |
| Individual page data (GSC/GA4) | `page_data` rows | Need cluster-level drill-down |
| Schema results | `schema_results` rows | Need per-URL filtering |

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Client-side parsing (Web Worker) | No server timeouts, UI stays responsive for 7M+ lines |
| Supabase Edge Functions for Google APIs | 400s timeout vs Vercel's 10s |
| OAuth2 refresh tokens (not service accounts) | Easier setup for user-level Google access |
| GA4 limited to top 10K pages | Prevents Edge Function memory exhaustion on large sites |
| Reservoir sampling for percentiles | O(k) memory for p95/p99 |
| No raw request storage | 7.4M rows × 200B = 1.5GB per run, impractical on 8GB DB |
| JSONB + normalized hybrid | Fast summary loads + flexible drill-down, zero duplication |

## Database Schema (Supabase — 18 Tables)

### Core
- `projects` — id, user_id, name, site_url, log_format
- `credentials` — type (ssh/sftp/gsc_api/ga4_api/custom_api), encrypted_config
- `url_patterns` — user-defined regex patterns for URL classification

### Log Analysis (per analysis_run)
- `analysis_runs` — JSONB: overview, time_series, heatmap, redirects_summary, gone410_summary, suspicious
- `clusters` — pattern, request_count, statuses, rt_avg, rt_p95, sample_urls
- `cluster_daily` — cluster_id, day, request_count
- `cluster_user_agents` — cluster_id, user_agent, request_count
- `error_entries` — error_type (404/500/slow), pattern, request_count, examples
- `bot_stats` — bot_name, request_count, top_pages (JSONB)
- `bot_daily` — bot_id, day, request_count
- `redirect_patterns` — pattern, request_count, bot_count, human_count
- `gone410_patterns` — pattern, request_count, bot_count, examples
- `language_stats` — lang, request_count, ok_200, err_404, bot_percent
- `log_files` — filename, storage_path, size_bytes, processed

### Pages Enrichment
- `page_enrichment_runs` — pages_index (JSONB), status, date_range
- `page_data` — url, path, cluster_id, gsc (JSONB), ga4 (JSONB), channels (JSONB)

### Schema Validation
- `schema_results` — url, page_type, found_schema_types, status, delta, errors
- `schema_history` — total, ok, warning, critical, coverage_rate, changes

### GSC Health Monitoring
- `gsc_health_data` — project_id, report_type, report_date, section, data (JSONB)
- Stores data from GSC ZIP exports (Russian headers supported)
- Report types: crawl_stats, crawl_by_response, performance, coverage, core_web_vitals
- Each ZIP has multiple CSV sections (Диаграмма, Таблица, Метаданные, etc.)

### Competitor Monitoring (Firehose)
- `competitor_mentions` — matched_at, rule, url, title, domain, has_brand_mention, matched_keywords[], mention_snippet
- Data from Firehose real-time web monitoring API (SSE stream)
- `projects.brand_keywords` TEXT[] — configurable keywords per project (e.g., EpicVin, epicvin.com)
- Dedup index on (project_id, url, matched_at)

## Edge Functions (Supabase Deno Runtime)

| Function | Purpose | Limits |
|----------|---------|--------|
| `pages-enrichment` (v4) | GSC + GA4 fetch, URL classification, aggregation | 10K GA4 pages, 25K GSC pages |
| `schema-validator` (v1) | HTML crawling, JSON-LD extraction, schema.org validation | 50 URLs, 5 concurrent |
| `firehose-poller` (v2) | Fetch Firehose SSE stream, keyword detection in article content | 500 events, 30s timeout |
| `mention-backfill` (v1) | Crawl existing mention URLs to detect brand keywords retroactively | 200 URLs, 5 concurrent |

## Automated Jobs

| Job | Schedule | Endpoint |
|-----|----------|----------|
| Firehose daily poll | 8am UTC daily (Vercel Cron) | `GET /api/cron/firehose` |

## Global Features

### Date Range Selector
- Top bar with date inputs + preset buttons (7d, 28d, 90d, All)
- `DateRangeContext` persisted in localStorage
- Client-side filtering via `filterByDateRange()` — no API changes
- Applied to ALL time-series charts and KPI cards across all pages
- Min date: March 11, 2026 (tracking start)

### Collapsible Sidebar
- Sections: Manage, Core, GSC Health, Monitoring, Advanced
- Collapse state persisted in localStorage
- Auto-expands when active page is in section

## Log Format

```
DD/Mon/YYYY:HH:MM:SS +0000 /path User-Agent STATUS [RESPONSE_TIME]
```

- Custom format — no IP, no HTTP method, no referrer
- Response time optional (~10% missing)
- Parser works backwards from line end (UA has variable spaces)
- ~620K lines/day average
