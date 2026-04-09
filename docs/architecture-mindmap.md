# LogAnalyzer — Architecture Mindmap

> **Data tracking start date: March 11, 2026** — all analysis, GSC, GA4, and log data is meaningful only from this date forward.

## System Overview

```
LogAnalyzer
├── Frontend (Next.js 15 App Router)
│   ├── Auth (Supabase invite-only)
│   ├── Project Management
│   ├── Log Upload + Client-Side Parser
│   └── 12 Dashboard Pages
├── Backend (Vercel Serverless + Supabase Edge Functions)
│   ├── 13 API Routes
│   ├── 2 Edge Functions
│   └── Auth Middleware
├── Database (Supabase PostgreSQL, Pro tier, eu-central-1)
│   ├── 18 Tables (all with RLS)
│   └── 1 Storage Bucket (log-files)
└── External Integrations
    ├── Google Search Console API (OAuth2)
    └── Google Analytics 4 Data API (OAuth2)
```

## Data Flows

### Flow 1: Log Analysis (Browser → Supabase)
```
User drops .gz files in browser
  → Web Worker decompresses + parses (pako, off-main-thread)
  → Produces Summary object (clusters, bots, errors, heatmap, etc.)
  → POST /api/projects/[id]/analysis
  → API decomposes Summary into 10 normalized tables
  → Dashboard pages query via GET /api/projects/[id]/summary
```

### Flow 2: GSC + GA4 Enrichment (Edge Function → Google APIs → Supabase)
```
User clicks "Fetch Pages Data"
  → POST /api/projects/[id]/pages/enrich
  → Decrypts OAuth2 credentials (AES-256-GCM)
  → Invokes Edge Function "pages-enrichment"
    → Gets Google access token via refresh_token
    → Fetches GSC Search Analytics (top 25K pages by clicks)
    → Fetches GA4 Data API (top 10K pages by sessions + channels)
    → Classifies URLs into log cluster patterns
    → Aggregates ClusterMeta + PagesSummary
    → Stores in page_enrichment_runs (JSONB) + page_data (rows)
  → Frontend polls GET /api/projects/[id]/pages/status
  → Dashboard reads GET /api/projects/[id]/pages
```

### Flow 3: Schema Validation (Edge Function → Target Site → Supabase)
```
User clicks "Run Schema Scan"
  → POST /api/projects/[id]/schema/scan
  → Gets top 50 URLs from cluster sample_urls
  → Invokes Edge Function "schema-validator"
    → Fetches HTML for each URL (5 concurrent, 10s timeout)
    → Extracts JSON-LD, detects Microdata breadcrumbs
    → Validates must-have/nice-to-have types per page type
    → Validates required fields per schema type
  → Computes deltas vs previous scan (NEW_ERROR, FIXED, DEGRADED)
  → Stores in schema_results + schema_history
  → Dashboard reads GET /api/projects/[id]/schema
```

## Dashboard Pages

### Manage Section
| Page | URL | Data Source | Purpose |
|------|-----|-------------|---------|
| Projects | /projects | API: projects table | Create/select/manage analysis projects |
| Settings | /projects/[id]/settings | API: project + credentials | Configure project, upload logs, manage credentials |

### Core Section (from Log Analysis)
| Page | URL | Data Source | Key Metrics |
|------|-----|-------------|-------------|
| Overview | / | analysis_runs.overview + time_series | Total requests, daily trend, status codes, response times, bot vs human |
| URL Clusters | /clusters | clusters table | Pattern, request count, status breakdown, avg/p95 response time |
| Pages (SEO) | /pages | page_enrichment_runs + page_data | GSC clicks/impressions/position, GA4 sessions/users/bounceRate, channels |
| Errors | /errors | error_entries table | 404 patterns, 5xx patterns, slow patterns (>1s) |
| Performance | /performance | clusters + analysis_runs.overview | Response time distribution, slowest clusters by p95 |
| Bots | /bots | bot_stats + bot_daily + overview | Bot vs human, per-bot requests, Googlebot daily trend + top pages |

### Advanced Section
| Page | URL | Data Source | Key Metrics |
|------|-----|-------------|-------------|
| Redirects | /redirects | redirect_patterns + redirects_summary | 301/302/307 distribution, top redirect patterns, bot/human split |
| Crawl Budget | /crawl-budget | analysis_runs.overview.crawlBudget | Googlebot waste score, useful vs redirect/404/410/static |
| Checkout | /checkout | analysis_runs.time_series.checkoutFunnel | Checkout requests, unique IDs, status breakdown, daily success rate |
| Languages | /languages | language_stats table | Per-language requests, 200/404 counts, bot percentage |
| Heatmap | /heatmap | analysis_runs.heatmap | 24h x N-day grids for response time and request volume |
| Schema | /schema | schema_results + schema_history | JSON-LD validation, must-have/nice-to-have types, OK/WARNING/CRITICAL status |

## Database Schema (18 Tables)

### Core Tables
```
projects (1 row)
├── id, user_id, name, description, site_url, log_format
├── RLS: user sees own projects only
└── FK parent of: credentials, url_patterns, log_files, analysis_runs,
    schema_results, schema_history, page_enrichment_runs

credentials (2 rows)
├── id, project_id, type (ssh|sftp|gsc_api|ga4_api|custom_api), name, encrypted_config
└── AES-256-GCM encrypted at rest

url_patterns (0 rows — user-defined URL classification rules)
├── id, project_id, pattern (regex), label, priority
└── Applied during log parsing before default classification
```

### Log Analysis Tables (Hybrid: JSONB + Normalized)
```
analysis_runs (1 row) — JSONB for compact summary data
├── overview: totalRequests, uniqueUrls, dateRange, responseTime, statusCodes, botVsHuman, crawlBudget
├── time_series: requestsByDay, checkoutFunnel
├── heatmap: 24h x N-day matrices
├── redirects_summary: total, byStatus
├── gone410_summary: total, googlebotRequests
└── suspicious: topUAs, highErrorUAs

clusters (200 rows) — Normalized for drill-down
├── pattern, request_count, statuses (JSONB), rt_avg, rt_p95, sample_urls
├── cluster_daily (2,277 rows): day, request_count
└── cluster_user_agents (1,862 rows): user_agent, request_count

error_entries (150 rows): error_type (404|500|slow), pattern, request_count, examples
bot_stats (18 rows): bot_name, request_count, top_pages (JSONB)
├── bot_daily (191 rows): day, request_count
redirect_patterns (100 rows): pattern, request_count, bot_count, human_count
gone410_patterns (50 rows): pattern, request_count, bot_count, examples
language_stats (6 rows): lang, request_count, ok_200, err_404, bot_percent
log_files (0 rows): filename, storage_path, size_bytes, processed
```

### Pages Enrichment Tables
```
page_enrichment_runs (2 rows)
├── project_id, run_id (FK to analysis_runs), date_range, status
├── pages_index (JSONB): PagesIndex with summary + cluster metadata
└── page_data (11,452 rows)
    ├── cluster_id, url, path, cluster_pattern
    ├── gsc (JSONB): clicks, impressions, ctr, position
    ├── ga4 (JSONB): sessions, users, pageviews, avgDuration, bounceRate, conversions
    ├── channels (JSONB): {"Organic Search": N, "Direct": N, ...}
    └── indexing (JSONB): status, lastCrawl, verdict
```

### Schema Validation Tables
```
schema_results (34 rows per scan)
├── scan_id, url, page_type, status (OK|WARNING|CRITICAL), delta
├── found_schema_types[], must_have[], nice_to_have[]
├── missing_must_have[], missing_nice_to_have[]
├── has_microdata_breadcrumb, errors (JSONB)
└── Compared across scans for delta tracking

schema_history (1 row per scan)
├── total, ok, warning, critical, coverage_rate
└── changes: {new_error, fixed, degraded, missing}
```

## Edge Functions (Supabase, Deno Runtime)

| Function | Version | Purpose | Runtime |
|----------|---------|---------|---------|
| schema-validator | v1 | Crawl site pages, extract JSON-LD, validate schema.org types | ~30s for 50 URLs |
| pages-enrichment | v4 | Fetch GSC + GA4 data, classify into clusters, aggregate | ~30s for 10K pages |

## Client-Side Parser (Web Worker)

```
lib/parser/
├── worker.ts — Web Worker entry, runs all parsing off main thread
├── index.ts — parseLogFiles() orchestrator (legacy, now via worker)
├── stats.ts — ReservoirStats: O(k) memory percentile approximation
├── bots.ts — detectBot(): 17+ named bots + generic pattern
└── classify.ts — classifyUrl(): custom rules → api → checkout → first-2-segments fallback
```

**Log format:** `DD/Mon/YYYY:HH:MM:SS +0000 /path User-Agent STATUS [RESPONSE_TIME]`
- No IP, no HTTP method, no referrer
- Response time optional (~10% missing)
- Parse from end of line (UA has variable spaces)

## Security Model

- **Auth:** Supabase Auth, invite-only, email/password
- **RLS:** All 18 tables have Row Level Security — users see only their own project data
- **Credentials:** AES-256-GCM encrypted at rest, decrypted server-side only
- **Secrets:** Only NEXT_PUBLIC_* env vars reach browser; service role key server-only
- **Public repo:** No client data, credentials, or analysis results in git

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Hybrid storage (JSONB + normalized) | Fast dashboard loads + flexible drill-down |
| Client-side parsing (Web Worker) | No server timeouts, UI stays responsive |
| Supabase Edge Functions for external APIs | 400s timeout vs Vercel's 10s |
| OAuth2 refresh tokens | User-level Google access, no service account setup needed |
| 10K page limit for GA4 | Prevents Edge Function memory exhaustion on large sites |
| Reservoir sampling for percentiles | O(k) memory for p95/p99 on 7M+ lines |
| No raw request storage | 7.4M rows/run would exhaust 8GB DB |

## Current Project: EpicVin

| Field | Value |
|-------|-------|
| Project ID | 9fc80501-40b7-4786-9422-3e7b22fe1bdf |
| Site URL | https://epicvin.com |
| GSC Property | sc-domain:epicvin.com |
| GA4 Property | 263950131 (www.epicvin.com - GA4) |
| Log files | 12 files, 7.4M lines, Mar 26 – Apr 6, 2026 |
| GSC pages | 3,245 (with clicks/impressions) |
| GA4 pages | ~10,000 (top by sessions) |
| Total enriched pages | 11,452 across 903 clusters |
| Schema URLs scanned | 34 |

**Data tracking start: March 11, 2026** — all metrics, trends, and comparisons should use this as the baseline date.
