# LogAnalyzer — Project Requirements

## Overview

Transform the current static EpicVin-specific log dashboard into a generic, multi-project log analysis tool with secure credential management, configurable parsing, and external data enrichment.

**Users:** Internal team only (invite-based auth, no public signup)
**Deployment:** Vercel free tier (serverless) + Supabase Pro (new project)
**Repository:** Public on GitHub — no client data allowed

---

## Phase 0: Repository Cleanup

**Goal:** Remove all client-specific data and branding from the public repo.

### 0.1 Purge data from git history
- Use BFG Repo-Cleaner to remove `public/data/` from all commits
- Force push cleaned history to GitHub
- All collaborators must re-clone after the force push

### 0.2 Update .gitignore
Add to `.gitignore`:
```
public/data/
.env
.env.local
.env.production
*.gz
*.log
```

### 0.3 Remove EpicVin references
| File | What to change |
|------|---------------|
| `package.json` | `name`: `"epicvin-log-analyzer"` → `"loganalyzer"` |
| `app/layout.tsx` | Title/description: remove "EpicVin" |
| `components/Layout.tsx` | Sidebar header: `"EpicVin Logs"` → `"LogAnalyzer"` |
| `app/schema/page.tsx` | Hardcoded `epicvin.com` reference |
| `scripts/parse-logs.mjs` | Hardcoded path `/home/vlubc/.openclaw/workspace/epicvin-logs/` |
| `scripts/parse-extra.mjs` | Same hardcoded path |
| `scripts/parse-logs.mjs` | Hardcoded URL patterns (vin-decoder, license-plate, checkout regex) |
| `scripts/parse-extra.mjs` | Duplicate hardcoded URL patterns |
| `scripts/chunk-pages-data.mjs` | Hardcoded path with `epicvin-log-analyzer` |
| `README.md` | Rewrite entirely — generic LogAnalyzer description |

### 0.4 Deliverables
- [ ] Git history clean of all `public/data/` files
- [ ] No string "epicvin" (case-insensitive) anywhere in source code
- [ ] No hardcoded filesystem paths in scripts
- [ ] README describes LogAnalyzer generically

---

## Phase 1: Backend Foundation

**Goal:** Set up Supabase, auth, and API route infrastructure.

### 1.1 Next.js configuration
- Remove `output: "export"` from `next.config.ts` (enables API routes)
- Keep `trailingSlash: true` for URL consistency

### 1.2 Supabase project setup
- Create new Supabase project (separate from other projects)
- Region: closest to primary users

### 1.3 Dependencies
```bash
npm install @supabase/supabase-js @supabase/ssr
```

### 1.4 Supabase client setup
- `lib/supabase/client.ts` — Browser client (uses `NEXT_PUBLIC_*` keys)
- `lib/supabase/server.ts` — Server client (uses `SUPABASE_SERVICE_ROLE_KEY`)
- `lib/supabase/middleware.ts` — Auth middleware for protected routes

### 1.5 Database schema

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  log_format TEXT NOT NULL DEFAULT 'nginx',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Encrypted credentials (SSH, API keys)
CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ssh', 'sftp', 'gsc_api', 'ga4_api', 'custom_api')),
  name TEXT NOT NULL,
  encrypted_config TEXT NOT NULL,  -- AES-256 encrypted JSON blob
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User-defined URL classification patterns
CREATE TABLE url_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,           -- Regex pattern
  label TEXT NOT NULL,             -- Human-readable cluster name
  priority INT NOT NULL DEFAULT 0, -- Higher = matched first
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Analysis results (parsed log summaries)
CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  summary JSONB NOT NULL,          -- Full Summary type as JSONB
  date_range_start DATE,
  date_range_end DATE,
  total_requests BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log file metadata (files stored in Supabase Storage)
CREATE TABLE log_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,      -- Path in Supabase Storage bucket
  size_bytes BIGINT NOT NULL,
  mime_type TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_credentials_project ON credentials(project_id);
CREATE INDEX idx_url_patterns_project ON url_patterns(project_id, priority DESC);
CREATE INDEX idx_analysis_results_project ON analysis_results(project_id, created_at DESC);
CREATE INDEX idx_log_files_project ON log_files(project_id);
```

### 1.6 Row Level Security policies

```sql
-- Projects: users see only their own
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_select ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY projects_insert ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY projects_update ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY projects_delete ON projects FOR DELETE USING (auth.uid() = user_id);

-- Credentials: access via project ownership
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY credentials_all ON credentials FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- URL Patterns: access via project ownership
ALTER TABLE url_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY url_patterns_all ON url_patterns FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Analysis Results: access via project ownership
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY analysis_results_all ON analysis_results FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Log Files: access via project ownership
ALTER TABLE log_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY log_files_all ON log_files FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
```

### 1.7 API routes structure
```
app/api/
  auth/
    callback/route.ts       # Supabase Auth callback
  projects/
    route.ts                # GET (list), POST (create)
    [id]/
      route.ts              # GET, PATCH, DELETE single project
      credentials/
        route.ts            # GET (list), POST (create)
        [credId]/route.ts   # PATCH, DELETE single credential
      patterns/
        route.ts            # GET, POST, PUT (bulk update)
      analyze/
        route.ts            # POST — trigger log analysis
      results/
        route.ts            # GET — fetch analysis results
      upload/
        route.ts            # POST — upload log file
```

### 1.8 Deliverables
- [ ] Supabase project created with schema and RLS
- [ ] Supabase client libraries integrated
- [ ] Auth middleware protecting all `/api/` and dashboard routes
- [ ] Login page functional with invite-based flow
- [ ] Basic CRUD API routes for projects

---

## Phase 2: Credential Management

**Goal:** UI and backend for securely managing SSH/SFTP and API credentials.

### 2.1 Encryption module (`lib/encryption.ts`)
- Use Node.js `crypto` module with AES-256-GCM
- Encrypt credential config (JSON blob) before storing in Supabase
- Decrypt server-side only (in API routes), never in client code
- `CREDENTIAL_ENCRYPTION_KEY` stored in Vercel env vars (not in repo)

### 2.2 Credential types
```typescript
type CredentialType = 'ssh' | 'sftp' | 'gsc_api' | 'ga4_api' | 'custom_api';

interface SSHCredentialConfig {
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
  password?: string;        // If authMethod is 'password'
  privateKey?: string;      // If authMethod is 'key'
  logPath: string;          // Remote path to log files (e.g., /var/log/nginx/)
  logPattern: string;       // Glob pattern (e.g., "access.log*.gz")
}

interface GSCCredentialConfig {
  serviceAccountJson: string;  // Google service account JSON
  siteUrl: string;             // Property URL in GSC
}

interface GA4CredentialConfig {
  serviceAccountJson: string;
  propertyId: string;          // GA4 property ID
}

interface CustomAPIConfig {
  baseUrl: string;
  headers: Record<string, string>;
  authType: 'bearer' | 'api_key' | 'basic';
  token?: string;
}
```

### 2.3 UI components
- Project settings page with credential management section
- Add/edit credential modal with type-specific form fields
- "Test Connection" button that validates credentials server-side
- Visual status indicators (connected, failed, untested)

### 2.4 Deliverables
- [ ] Encryption/decryption working for all credential types
- [ ] CRUD UI for credentials within project settings
- [ ] Test connection endpoint for SSH/SFTP credentials
- [ ] Credentials never exposed to client (decrypted server-side only)

---

## Phase 3: Generic Log Parser

**Goal:** Replace hardcoded EpicVin parsing with configurable, project-scoped analysis.

### 3.1 Configurable URL classification
- Users define regex patterns + labels in project settings UI
- Patterns stored in `url_patterns` table with priority ordering
- Default pattern set provided as templates (Nginx, Apache, generic)
- Fallback: first 2 path segments (existing behavior, but without EpicVin-specific patterns)

### 3.2 Log file ingestion
Two modes:
1. **Upload:** User uploads `.log` or `.gz` files via UI → stored in Supabase Storage → processed by API route
2. **Remote fetch:** API route uses stored SSH/SFTP credentials to pull log files from remote server → stored in Supabase Storage → processed

### 3.3 Processing pipeline
Port the existing `parse-logs.mjs` logic into a reusable module:
- `lib/parser/index.ts` — Main parser entry point
- `lib/parser/stream.ts` — Streaming line processor (from existing `createReadStream` + `createGunzip` + `readline`)
- `lib/parser/classify.ts` — URL classification using project's `url_patterns`
- `lib/parser/stats.ts` — ReservoirStats class (from existing code)
- `lib/parser/formats.ts` — Log format parsers (Nginx combined, Apache, custom regex)

### 3.4 Handling Vercel 10s timeout
- Process log files in chunks via multiple API calls
- API route processes N lines, saves partial state to Supabase, returns progress %
- Frontend polls or uses SSE for progress updates
- Final merge step combines partial results into complete `analysis_results` entry

### 3.5 Deliverables
- [ ] URL pattern management UI in project settings
- [ ] Log file upload working (UI → Supabase Storage → parse)
- [ ] Remote log fetch working (SSH/SFTP → Supabase Storage → parse)
- [ ] Chunked processing with progress tracking
- [ ] Results stored in `analysis_results` as JSONB matching `Summary` type

---

## Phase 4: Dashboard Refactoring

**Goal:** Wire existing dashboard pages to dynamic Supabase data.

### 4.1 Data layer refactor
Replace `lib/data.ts` functions:
- `loadSummary()` → query `analysis_results` for active project
- `loadSchemaState()` → query schema data from analysis result or separate table
- `loadPagesIndex()` / `loadClusterPages()` → query from JSONB fields or chunked storage
- Add project context: all queries scoped to selected project ID

### 4.2 Auth pages
- `app/(auth)/login/page.tsx` — Email/password login
- `app/(auth)/invite/page.tsx` — Accept team invite
- Redirect to login if no session

### 4.3 Project management
- `app/(dashboard)/projects/page.tsx` — List projects, create new
- `app/(dashboard)/projects/[id]/settings/page.tsx` — Project settings (name, patterns, credentials)
- Project selector in sidebar/header

### 4.4 Dynamic navigation
- Show dashboard pages based on available data sections in the analysis result
- E.g., if no checkout data, hide "Checkout" nav item
- If no schema data, hide "Schema" nav item

### 4.5 Deliverables
- [ ] All 12 dashboard pages wired to Supabase data
- [ ] Auth flow working (login, session persistence, protected routes)
- [ ] Project CRUD UI with settings page
- [ ] Navigation adapts to available data sections

---

## Phase 5: External Data Integration

**Goal:** Enrich log analysis with GSC, GA4, and schema validation data.

### 5.1 Google Search Console integration
- Use stored GSC service account credentials
- Fetch: clicks, impressions, CTR, average position per URL
- Map to existing `PageGSC` type
- API route: `POST /api/projects/[id]/enrich/gsc`

### 5.2 Google Analytics 4 integration
- Use stored GA4 service account credentials
- Fetch: sessions, users, pageviews, bounce rate, conversions per page
- Map to existing `PageGA4` type
- API route: `POST /api/projects/[id]/enrich/ga4`

### 5.3 Schema.org validation
- Crawl project URLs and validate structured data
- Use existing schema validation logic (adapted from current schema page)
- Store results in analysis or separate schema table
- API route: `POST /api/projects/[id]/enrich/schema`

### 5.4 Deliverables
- [ ] GSC data fetching and display on Pages dashboard
- [ ] GA4 data fetching and display on Pages dashboard
- [ ] Schema validation running against project URLs
- [ ] All enrichment triggered per-project from settings/UI

---

## Non-Functional Requirements

### Performance
- Dashboard pages load under 2 seconds for analysis results up to 10M requests
- Log parsing handles files up to 500MB (chunked processing)
- Client-side caching for loaded analysis data (avoid re-fetching on tab switches)

### Security
- All credentials AES-256-GCM encrypted at rest
- Encryption key in Vercel env vars, never in repo
- Supabase RLS on all tables — users isolated to their own data
- No client data committed to git (enforced by `.gitignore`)
- API routes validate auth session before any operation
- SSH private keys and API tokens never returned to client after storage

### Platform Constraints
| Constraint | Limit | Mitigation |
|-----------|-------|-----------|
| Vercel function timeout | 10 seconds | Chunked log processing |
| Vercel payload size | 4.5 MB | Upload via Supabase Storage, not API body |
| Vercel serverless hours | 100 GB-hours/month | Efficient parsing, limit concurrent jobs |
| Supabase DB (Pro) | 8 GB | JSONB summaries are compact (~400KB per analysis) |
| Supabase Storage (Pro) | 100 GB | Purge processed log files after analysis |

### Reliability
- Graceful error handling on all API routes
- Partial parse results saved (resume on failure)
- Credential test before attempting remote log fetch
- Clear error messages in UI (not raw stack traces)
