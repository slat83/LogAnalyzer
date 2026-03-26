# EpicVin Access Log Analyzer

Next.js dashboard for analyzing EpicVin access logs (~7M requests across 8 days).

## Quick Start

```bash
# Parse logs (generates public/data/summary.json)
npm run parse

# Start dev server
npm run dev

# Build static export
npm run build
```

## Architecture

### Parser (`scripts/parse-logs.mjs`)
- Streams .gz log files using `createReadStream` + `zlib.createGunzip` + `readline`
- Memory-efficient: never loads full files into RAM
- Uses reservoir sampling for approximate percentiles (p95/p99)
- Outputs `public/data/summary.json` (~400KB)

### Dashboard Pages
- **Overview** — Total requests, daily trends, status codes pie chart, response time stats
- **URL Clusters** — Sortable table of URL patterns with drill-down (charts + UAs)
- **Errors** — 404/5xx/slow request patterns
- **Bots** — Bot vs human traffic, Googlebot detail with daily trends and top pages
- **Performance** — Response time distribution, slowest clusters by p95

### URL Clustering
- `/vin-decoder/{brand}` → `vin-decoder-brand`
- `/vin-decoder/{brand}/{model}` → `vin-decoder-model`
- `/license-plate-lookup/{state}` → `lp-state`
- `/vin-check-by-state/{state}` → `vin-check-state`
- `/checkout/...` → `checkout`
- Language prefixes (`/es/`, `/fr/`, etc.) → prefixed clusters
- Static assets → `static`
- API routes → by first segment
- Others → first 2 path segments

## Tech Stack
- Next.js 15 (App Router, static export)
- TypeScript
- Tailwind CSS v4
- Recharts

## Data Summary (from 8 log files)
- **7,066,169** total requests
- **8 days** (2026-03-16 → 2026-03-24)
- **Top cluster:** checkout (3.1M requests)
- **Bot traffic:** 27% of all requests
- **Avg response time:** 0.152s, p95: 0.577s, p99: 2.533s
