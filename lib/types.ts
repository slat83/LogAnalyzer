export interface DayCount {
  date: string;
  count: number;
}

export interface UACount {
  ua: string;
  count: number;
}

export interface Cluster {
  pattern: string;
  count: number;
  statuses: Record<string, number>;
  responseTime: { avg: number; p95: number };
  byDay: DayCount[];
  topUAs: UACount[];
  sampleUrls?: string[];
}

export interface ErrorEntry {
  pattern: string;
  count: number;
  examples?: string[];
}

export interface SlowEntry {
  pattern: string;
  avgTime: number;
  count: number;
}

export interface BotData {
  requests: number;
  topPages: { url: string; count: number }[];
  byDay: DayCount[];
}

// NEW types for advanced analytics

export interface RedirectPattern {
  pattern: string;
  count: number;
  botCount: number;
  humanCount: number;
}

export interface RedirectData {
  total: number;
  byPattern: RedirectPattern[];
  byStatus: Record<string, number>;
}

export interface Gone410Pattern {
  pattern: string;
  count: number;
  examples: string[];
  botCount: number;
}

export interface Gone410Data {
  total: number;
  googlebotRequests: number;
  byPattern: Gone410Pattern[];
}

export interface CrawlBudgetData {
  totalGooglebot: number;
  useful: { count: number; percent: number };
  waste: {
    redirects: { count: number; percent: number };
    notFound404: { count: number; percent: number };
    gone410: { count: number; percent: number };
    static: { count: number; percent: number };
    total: { count: number; percent: number };
  };
}

export interface CheckoutDay {
  date: string;
  requests: number;
  success200: number;
}

export interface CheckoutFunnelData {
  totalRequests: number;
  uniqueVINs: number;
  byStatus: Record<string, number>;
  byDay: CheckoutDay[];
}

export interface LanguageData {
  lang: string;
  requests: number;
  ok200: number;
  err404: number;
  botPercent: number;
}

export interface HeatmapData {
  responseTime: number[][];
  requests: number[][];
  hours: number[];
  days: string[];
}

export interface SuspiciousUA {
  ua: string;
  count: number;
  errorRate: number;
  burstMax?: number;
}

export interface SuspiciousData {
  topUAs: SuspiciousUA[];
  highErrorUAs: SuspiciousUA[];
}

// ── Pages / SEO data (GSC + GA4) ──────────────────────────────────────────────

export interface PageGSC {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PageGA4 {
  sessions: number;
  users: number;
  pageviews: number;
  avgDuration: number;
  bounceRate: number;
  conversions: number;
}

export interface PageIndexing {
  status: string;       // 'INDEXED' | 'NOT_INDEXED' | 'UNKNOWN' | other
  lastCrawl: string | null;
  verdict: string;      // 'PASS' | 'FAIL' | 'NEUTRAL' | 'UNKNOWN'
}

export interface PageData {
  url: string;
  path: string;
  cluster: string;
  urlVariants?: number;     // количество URL-вариантов в GSC (с query/fragment)
  gsc: PageGSC | null;
  ga4: PageGA4 | null;
  channels: Record<string, number>;
  indexing: PageIndexing | null;
}

export interface PageCluster {
  pattern: string;
  pages: string[];
  pageCount: number;
  totalClicks: number;
  totalImpressions: number;
  totalSessions: number;
  totalUsers: number;
  totalPageviews: number;
  totalConversions: number;
  avgPosition: number | null;
  avgBounceRate: number | null;
  indexedCount: number;
  indexedPct: number;
}

export interface PagesSummary {
  totalPages: number;
  totalClusters: number;
  totalClicks: number;
  totalSessions: number;
  avgPosition: number | null;
  indexedPct: number | null;
  avgBounceRate: number | null;
}

export interface PagesData {
  timestamp: string;
  dateRange: { start: string; end: string };
  summary: PagesSummary;
  pages: PageData[];
  clusters: PageCluster[];
}

// Split pages index types (for lazy loading)
export interface ClusterMeta {
  id: string;
  pattern: string;
  pageCount: number;
  actualPageCount: number;
  totalClicks: number;
  totalSessions: number;
  totalImpressions: number;
  totalUsers: number;
  totalPageviews: number;
  totalConversions: number;
  avgPosition: number;
  avgBounceRate: number;
  indexedCount: number;
  indexedPct: number;
}

export interface PagesIndex {
  timestamp: string;
  dateRange: { start: string; end: string };
  summary: PagesSummary;
  clusters: ClusterMeta[];
}

export interface ClusterData {
  pattern: string;
  pages: PageData[];
}

// Schema AI Analysis types
export interface SchemaAIIssue {
  severity: "error" | "warning" | "info";
  type: string;
  description: string;
  fix: string;
}

export interface SchemaAIResult {
  url: string;
  types_detected: string[];
  issues: SchemaAIIssue[];
  score: number;
  summary: string;
}

export interface SchemaAIAnalysis {
  timestamp: string;
  model: string;
  results: SchemaAIResult[];
}

// Schema Monitor types
export interface SchemaUrlResult {
  url: string;
  pageType: string;
  foundSchemaTypes: string[];
  mustHave: string[];
  niceToHave: string[];
  missingMustHave: string[];
  missingNiceToHave: string[];
  hasMicrodataBreadcrumb: boolean;
  errors: { field: string; message: string; severity: string }[];
  status: "OK" | "WARNING" | "CRITICAL";
  delta: string;
}

export interface SchemaState {
  timestamp: string;
  results: SchemaUrlResult[];
}

export interface SchemaHistoryEntry {
  date: string;
  timestamp: string;
  total: number;
  ok: number;
  warning: number;
  critical: number;
  coverageRate: number;
  changes: { new_error: number; fixed: number; degraded: number; missing: number };
}

export interface Summary {
  totalRequests: number;
  uniqueUrls: number;
  dateRange: { from: string; to: string };
  requestsByDay: DayCount[];
  statusCodes: Record<string, number>;
  responseTime: { avg: number; median: number; p95: number; p99: number };
  clusters: Cluster[];
  errors: {
    "404": ErrorEntry[];
    "500": ErrorEntry[];
    slow: SlowEntry[];
  };
  bots: Record<string, BotData>;
  botVsHuman: {
    bot: { requests: number; avgResponseTime: number };
    human: { requests: number; avgResponseTime: number };
  };
  // Advanced analytics
  redirects: RedirectData;
  gone410: Gone410Data;
  crawlBudget: CrawlBudgetData;
  checkoutFunnel: CheckoutFunnelData;
  languages: LanguageData[];
  heatmap: HeatmapData;
  suspicious: SuspiciousData;
}
