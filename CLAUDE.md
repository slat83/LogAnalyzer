# LogAnalyzer

Generic access log analysis tool with interactive dashboard. Supports multiple projects with configurable URL classification, external data enrichment (GSC, GA4), and secure credential management.

**IMPORTANT:** This is a public repository. Never commit client-specific data, credentials, API keys, or analysis results.

## Tech Stack

- **Framework:** Next.js 15 (App Router, serverless — NOT static export)
- **Language:** TypeScript (strict mode)
- **UI:** React 19, Tailwind CSS v4 (`@tailwindcss/postcss` plugin), Recharts 2.15+
- **Backend:** Supabase (PostgreSQL, Auth, Storage, RLS)
- **Deployment:** Vercel free tier (serverless functions)

## Project Structure

```
app/                    # Next.js App Router
  api/                  # API routes (auth-protected serverless functions)
  (auth)/               # Auth pages (login, invite)
  (dashboard)/          # Dashboard pages (overview, clusters, errors, bots, etc.)
  layout.tsx            # Root layout (dark theme, navigation)
  globals.css           # Tailwind CSS import
components/             # Shared UI components
  Card.tsx              # KPI display card
  DataTable.tsx         # Sortable, paginated generic table
  Layout.tsx            # Sidebar + mobile nav container
lib/                    # Shared utilities
  data.ts               # Data fetching layer (Supabase queries)
  types.ts              # TypeScript interfaces
  supabase/             # Supabase client setup (browser + server)
  encryption.ts         # Credential encryption/decryption helpers
scripts/                # Offline parsing scripts (legacy, being replaced by API routes)
public/                 # Static assets only (no data files)
docs/                   # Project documentation and requirements
```

## Development

```bash
npm run dev             # Start Next.js dev server (frontend + API routes)
npm run build           # Production build
npm run start           # Start production server
```

### Environment Variables

Create `.env.local` for local development:

```
NEXT_PUBLIC_SUPABASE_URL=         # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase publishable anon key
SUPABASE_SERVICE_ROLE_KEY=        # Server-side only — never expose to client
CREDENTIAL_ENCRYPTION_KEY=        # AES-256 key for encrypting stored credentials
```

These are also configured in Vercel project settings for production.

## Code Conventions

### Styling
- Dark theme throughout: `bg-gray-950` (page), `bg-gray-900` (cards), `bg-gray-800` (borders/hover)
- Text: `text-gray-100` (primary), `text-gray-400` (secondary)
- Accent: `blue-600` (active nav, primary actions), `green-400`/`red-400` (status)
- Chart tooltips: dark background (`#1f2937`)

### Components
- All dashboard page components use `"use client"` directive
- Data fetching: `useEffect` + `useState` pattern with loading/error states
- Components: PascalCase filenames, default exports
- Path alias: `@/*` maps to project root

### API Routes
- All API routes require authentication (Supabase Auth session)
- Use `app/api/` directory with Route Handlers
- Return consistent JSON shape: `{ data, error }`
- Validate input on server side

## Security Rules

1. **No client data in repo** — `public/data/` is gitignored, analysis results live in Supabase only
2. **Credentials encrypted at rest** — SSH keys, API tokens encrypted with `CREDENTIAL_ENCRYPTION_KEY` before storing in Supabase
3. **Auth on all API routes** — Verify Supabase session before any data access
4. **RLS policies** — All Supabase tables have Row Level Security; users only see their own projects
5. **No secrets in client code** — Only `NEXT_PUBLIC_*` env vars reach the browser
6. **Sensitive data never logged** — No credential values in console.log or error messages

## Architecture

### Data Flow
```
User uploads logs (or provides server credentials)
  → API route processes/fetches logs
  → Parsed results stored in Supabase (analysis_results.summary as JSONB)
  → Dashboard pages query Supabase for the active project's data
  → Charts and tables render from query results
```

### Key Design Decisions
- **Supabase over Vercel KV** — Pro tier provides full PostgreSQL, Auth, Storage, and RLS for multi-project data isolation
- **Serverless over static export** — Need API routes for credential management, log processing, and auth
- **JSONB for analysis results** — The existing `Summary` type structure maps directly to JSONB; avoids over-normalizing 20+ metric types into separate tables
- **Invite-only auth** — Not a public SaaS; team members added via Supabase Auth invite flow
- **Configurable URL patterns** — Stored per-project in `url_patterns` table, replacing hardcoded classification logic

### Vercel Free Tier Constraints
- 10-second function timeout — large log files must be processed in chunks
- 4.5MB request payload — use Supabase Storage for file uploads, not API body
- 100GB-hours serverless/month — parsing is the main consumer; optimize for efficiency

## Database Schema (Supabase)

See `docs/requirements.md` for full schema. Key tables:
- `projects` — Analysis projects owned by a user
- `credentials` — Encrypted SSH/API credentials per project
- `url_patterns` — User-defined URL classification rules per project
- `analysis_results` — Parsed log summaries (JSONB)
- `log_files` — Metadata for uploaded/fetched log files (actual files in Supabase Storage)
