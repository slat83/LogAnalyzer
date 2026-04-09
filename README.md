# LogAnalyzer

Access log analysis dashboard with interactive visualizations. Supports configurable URL classification, bot detection, performance metrics, and external data enrichment (GSC, GA4).

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Architecture

### Dashboard Pages
- **Overview** — Total requests, daily trends, status codes, response time stats
- **URL Clusters** — Sortable table of URL patterns with drill-down charts
- **Pages** — SEO analysis with GSC/GA4 data per cluster
- **Errors** — 404/5xx/slow request patterns
- **Performance** — Response time distribution, slowest clusters by p95
- **Bots** — Bot vs human traffic, Googlebot detail
- **Redirects** — 3xx redirect analysis with bot/human split
- **Crawl Budget** — Googlebot crawl waste analysis
- **Checkout** — Checkout funnel metrics
- **Languages** — Traffic by language
- **Heatmap** — Response time and traffic heatmaps (24h x N days)
- **Schema** — Schema.org validation and AI analysis

### Log Parser (`scripts/parse-logs.mjs`)
- Streams .gz log files using `createReadStream` + `createGunzip` + `readline`
- Memory-efficient: never loads full files into RAM
- Uses reservoir sampling for approximate percentiles (p95/p99)
- Configurable URL classification via `patterns.json`

### URL Classification
Create a `patterns.json` in the project root to define custom URL clustering rules:

```json
[
  { "pattern": "^/product/[^/]+/[^/]+", "label": "product-detail" },
  { "pattern": "^/product/[^/]+$", "label": "product-category" },
  { "pattern": "^/checkout", "label": "checkout" }
]
```

Rules are tested in order; first match wins. If no rules match, URLs are classified by their first 2 path segments.

## Tech Stack
- Next.js 15 (App Router)
- TypeScript (strict)
- Tailwind CSS v4
- Recharts
- Supabase (auth, database, storage)

## Environment Variables

See `.env.example` for required variables. Configure in Vercel project settings for production.
