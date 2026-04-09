"use client";
import { useEffect, useState, useMemo } from "react";
import { loadPagesIndex, loadClusterPages } from "@/lib/data";
import { PagesIndex, ClusterMeta, PageData, Summary } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

function getDisplayPath(page: PageData): string {
  try {
    const u = new URL(page.url);
    const display = u.pathname + u.search;
    return display.length > 80 ? display.slice(0, 77) + '...' : display;
  } catch {
    return page.path || '/';
  }
}

function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return (n * 100).toFixed(1) + "%";
}

function pos(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(1);
}

function dur(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function indexBadge(status: string | null | undefined): React.ReactNode {
  if (!status) return <span className="text-gray-600 text-xs">—</span>;
  if (status === "INDEXED") return <span className="text-green-400 text-xs font-medium">✓ Indexed</span>;
  if (status === "UNKNOWN") return <span className="text-gray-500 text-xs">?</span>;
  return <span className="text-yellow-400 text-xs">{status}</span>;
}

function SubdomainBadge({ url }: { url: string }) {
  const host = getHostname(url);
  // Detect subdomains: if the host has more than 2 parts (e.g., sub.example.com)
  const parts = host.split(".");
  if (parts.length <= 2) return null;
  const label = parts.slice(0, -2).join(".");
  const isDeactivated = false;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] ml-1 shrink-0 ${
        isDeactivated
          ? "bg-orange-900/40 text-orange-400 border border-orange-800/50"
          : "bg-gray-700 text-gray-400 border border-gray-600/50"
      }`}
      title={host}
    >
      {label}
    </span>
  );
}

const CHANNEL_COLORS: Record<string, string> = {
  "Organic Search":   "#22c55e",
  "Direct":           "#3b82f6",
  "Paid Search":      "#f59e0b",
  "Referral":         "#a855f7",
  "Cross-network":    "#ec4899",
  "Organic Social":   "#06b6d4",
  "Display":          "#f97316",
  "Paid Social":      "#8b5cf6",
  "Unassigned":       "#6b7280",
  "Paid Other":       "#fb923c",
  "Affiliates":       "#84cc16",
  "Organic Video":    "#14b8a6",
  "Organic Shopping": "#e879f9",
};

function ChannelPills({ channels }: { channels: Record<string, number> }) {
  const total = Object.values(channels).reduce((s, v) => s + v, 0);
  if (total === 0) return <span className="text-gray-600 text-xs">—</span>;

  const sorted = Object.entries(channels)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className="flex flex-wrap gap-1">
      {sorted.map(([ch, v]) => {
        const pctVal = ((v / total) * 100).toFixed(0);
        const color  = CHANNEL_COLORS[ch] || "#9ca3af";
        return (
          <span
            key={ch}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-800 border border-gray-700"
            title={`${ch}: ${v.toLocaleString()} sessions (${pctVal}%)`}
          >
            <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />
            <span className="text-gray-300">{pctVal}%</span>
          </span>
        );
      })}
    </div>
  );
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

// ── Cluster Table ─────────────────────────────────────────────────────────────

type SortKey = keyof ClusterMeta | "none";

function ClusterTable({
  clusters,
  onSelect,
  botClusters,
}: {
  clusters: ClusterMeta[];
  onSelect: (c: ClusterMeta) => void;
  botClusters: Record<string, number>;
}) {
  const [sort, setSort]   = useState<{ key: string; dir: 1 | -1 }>({ key: "totalClicks", dir: -1 });
  const [search, setSearch] = useState("");
  const [page, setPage]   = useState(0);
  const PAGE_SIZE = 50;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clusters.filter(c => !q || c.pattern.toLowerCase().includes(q));
  }, [clusters, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sort.key] ?? 0;
      const bv = (b as unknown as Record<string, unknown>)[sort.key] ?? 0;
      if (av < bv) return sort.dir;
      if (av > bv) return -sort.dir;
      return 0;
    });
  }, [filtered, sort]);

  const paged   = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPg = Math.ceil(sorted.length / PAGE_SIZE);

  function th(label: string, key: string, title?: string) {
    const active = sort.key === key;
    return (
      <th
        className="px-3 py-2 text-left text-xs text-gray-400 font-medium cursor-pointer select-none hover:text-white whitespace-nowrap"
        onClick={() => { setSort(s => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 })); setPage(0); }}
        title={title}
      >
        {label} {active ? (sort.dir === -1 ? "↓" : "↑") : ""}
      </th>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Filter clusters..."
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 w-64 focus:outline-none focus:border-blue-500"
        />
        <span className="text-xs text-gray-500">{filtered.length} clusters</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              {th("Cluster", "pattern")}
              {th("Pages", "pageCount")}
              {th("Sessions", "totalSessions")}
              {th("Users", "totalUsers")}
              {th("Clicks", "totalClicks")}
              {th("Impressions", "totalImpressions")}
              {th("Avg Position", "avgPosition")}
              {th("Bounce Rate", "avgBounceRate")}
              {th("Indexed %", "indexedPct")}
              <th className="px-3 py-2 text-left text-xs text-gray-400 font-medium whitespace-nowrap">Bot Reqs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {paged.map(c => {
              const botCount = botClusters[c.pattern] || 0;
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2 text-blue-400 font-mono text-xs break-all max-w-[200px]">
                    {c.pattern === "/" ? "/ (homepage)" : c.pattern}
                  </td>
                  <td className="px-3 py-2 text-gray-300 text-right">{fmt(c.pageCount)}</td>
                  <td className="px-3 py-2 text-gray-300 text-right">{fmt(c.totalSessions)}</td>
                  <td className="px-3 py-2 text-gray-300 text-right">{fmt(c.totalUsers)}</td>
                  <td className="px-3 py-2 text-gray-300 text-right font-medium">{fmt(c.totalClicks)}</td>
                  <td className="px-3 py-2 text-gray-400 text-right">{fmt(c.totalImpressions)}</td>
                  <td className="px-3 py-2 text-right">
                    {c.avgPosition != null ? (
                      <span className={c.avgPosition <= 10 ? "text-green-400" : c.avgPosition <= 20 ? "text-yellow-400" : "text-gray-400"}>
                        {pos(c.avgPosition)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.avgBounceRate != null ? (
                      <span className={c.avgBounceRate > 0.7 ? "text-red-400" : c.avgBounceRate > 0.4 ? "text-yellow-400" : "text-green-400"}>
                        {pct(c.avgBounceRate)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.indexedPct > 0 ? (
                      <span className={c.indexedPct >= 80 ? "text-green-400" : c.indexedPct >= 50 ? "text-yellow-400" : "text-red-400"}>
                        {c.indexedPct}%
                      </span>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {botCount > 0 ? (
                      <span className="text-orange-400 text-xs">{fmt(botCount)}</span>
                    ) : <span className="text-gray-700">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPg > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 text-gray-300">‹ Prev</button>
          <span className="text-gray-400">Page {page + 1} of {totalPg}</span>
          <button disabled={page >= totalPg - 1} onClick={() => setPage(p => p + 1)} className="px-2 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 text-gray-300">Next ›</button>
        </div>
      )}
    </div>
  );
}

// ── Page Table (drill-down) ───────────────────────────────────────────────────

function PageTable({
  pages,
  onBack,
  loading,
  error,
}: {
  pages: PageData[];
  onBack: () => void;
  loading?: boolean;
  error?: string | null;
}) {
  const [sort, setSort]   = useState<{ key: string; dir: 1 | -1 }>({ key: "clicks", dir: -1 });
  const [search, setSearch] = useState("");
  const [pg, setPg]       = useState(0);
  const PAGE_SIZE = 50;

  function getSortVal(p: PageData, key: string): number | string {
    if (key === "clicks")      return p.gsc?.clicks      ?? -1;
    if (key === "impressions") return p.gsc?.impressions  ?? -1;
    if (key === "ctr")         return p.gsc?.ctr          ?? -1;
    if (key === "position")    return p.gsc?.position     ?? 9999;
    if (key === "sessions")    return p.ga4?.sessions     ?? -1;
    if (key === "users")       return p.ga4?.users        ?? -1;
    if (key === "bounceRate")  return p.ga4?.bounceRate   ?? -1;
    if (key === "avgDuration") return p.ga4?.avgDuration  ?? -1;
    if (key === "conversions") return p.ga4?.conversions  ?? -1;
    if (key === "url")         return p.url;
    if (key === "indexed")     return p.indexing?.status === "INDEXED" ? 1 : 0;
    return -1;
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return pages.filter(p => !q || p.url.toLowerCase().includes(q));
  }, [pages, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = getSortVal(a, sort.key);
      const bv = getSortVal(b, sort.key);
      if (av < bv) return sort.dir;
      if (av > bv) return -sort.dir;
      return 0;
    });
  }, [filtered, sort]);

  const paged   = sorted.slice(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE);
  const totalPg = Math.ceil(sorted.length / PAGE_SIZE);

  function th(label: string, key: string, title?: string) {
    const active = sort.key === key;
    return (
      <th
        className="px-2 py-2 text-left text-xs text-gray-400 font-medium cursor-pointer select-none hover:text-white whitespace-nowrap"
        onClick={() => { setSort(s => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 })); setPg(0); }}
        title={title}
      >
        {label} {active ? (sort.dir === -1 ? "↓" : "↑") : ""}
      </th>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onBack} className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1">
            ← Back to clusters
          </button>
        </div>
        <div className="text-gray-400 p-8 animate-pulse text-center">Loading cluster pages...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onBack} className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1">
            ← Back to clusters
          </button>
        </div>
        <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 text-center">
          <div className="text-red-400 font-medium">Error loading cluster pages</div>
          <div className="text-red-300 text-sm mt-1">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1">
          ← Back to clusters
        </button>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPg(0); }}
          placeholder="Filter URLs..."
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 w-72 focus:outline-none focus:border-blue-500"
        />
        <span className="text-xs text-gray-500">{filtered.length} pages</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-xs">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              {th("URL", "url")}
              {th("Sessions", "sessions")}
              {th("Users", "users")}
              {th("Clicks", "clicks")}
              {th("Impressions", "impressions")}
              {th("CTR", "ctr")}
              {th("Position", "position")}
              {th("Bounce", "bounceRate")}
              {th("Avg Dur", "avgDuration")}
              {th("Conv", "conversions")}
              {th("Indexed", "indexed")}
              <th className="px-2 py-2 text-left text-xs text-gray-400 font-medium whitespace-nowrap">Last Crawl</th>
              <th className="px-2 py-2 text-left text-xs text-gray-400 font-medium whitespace-nowrap">Channels</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/40">
            {paged.map(p => (
              <tr key={p.url} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-2 py-2 max-w-[240px]">
                  <div className="flex items-start gap-1 flex-wrap">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline font-mono break-all leading-tight"
                      title={p.url}
                    >
                      {getDisplayPath(p)}
                    </a>
                    <SubdomainBadge url={p.url} />
                    {p.urlVariants && p.urlVariants > 1 && (
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-purple-900/40 text-purple-300 border border-purple-800/50 shrink-0"
                        title={`Aggregated from ${p.urlVariants} URL variants (query params/fragments)`}
                      >
                        {p.urlVariants} variants
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 text-gray-300 text-right">{fmt(p.ga4?.sessions)}</td>
                <td className="px-2 py-2 text-gray-300 text-right">{fmt(p.ga4?.users)}</td>
                <td className="px-2 py-2 text-gray-200 text-right font-medium">{fmt(p.gsc?.clicks)}</td>
                <td className="px-2 py-2 text-gray-400 text-right">{fmt(p.gsc?.impressions)}</td>
                <td className="px-2 py-2 text-right">
                  {p.gsc?.ctr != null ? (
                    <span className={p.gsc.ctr >= 0.05 ? "text-green-400" : p.gsc.ctr >= 0.02 ? "text-yellow-400" : "text-gray-400"}>
                      {(p.gsc.ctr * 100).toFixed(2)}%
                    </span>
                  ) : "—"}
                </td>
                <td className="px-2 py-2 text-right">
                  {p.gsc?.position != null ? (
                    <span className={p.gsc.position <= 10 ? "text-green-400" : p.gsc.position <= 20 ? "text-yellow-400" : "text-gray-400"}>
                      {pos(p.gsc.position)}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-2 py-2 text-right">
                  {p.ga4?.bounceRate != null ? (
                    <span className={p.ga4.bounceRate > 0.7 ? "text-red-400" : p.ga4.bounceRate > 0.4 ? "text-yellow-400" : "text-green-400"}>
                      {pct(p.ga4.bounceRate)}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-2 py-2 text-gray-400 text-right">{dur(p.ga4?.avgDuration)}</td>
                <td className="px-2 py-2 text-gray-300 text-right">{fmt(p.ga4?.conversions)}</td>
                <td className="px-2 py-2 text-center">{indexBadge(p.indexing?.status)}</td>
                <td className="px-2 py-2 text-gray-500">{p.indexing?.lastCrawl || "—"}</td>
                <td className="px-2 py-2">
                  <ChannelPills channels={p.channels || {}} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPg > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <button disabled={pg === 0} onClick={() => setPg(p => p - 1)} className="px-2 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 text-gray-300">‹ Prev</button>
          <span className="text-gray-400">Page {pg + 1} of {totalPg}</span>
          <button disabled={pg >= totalPg - 1} onClick={() => setPg(p => p + 1)} className="px-2 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 text-gray-300">Next ›</button>
        </div>
      )}
    </div>
  );
}

// ── Empty State with Enrich Button ───────────────────────────────────────────

function PagesEmptyState({ onEnriched }: { onEnriched: () => void }) {
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function handleEnrich() {
    const projectId = typeof window !== "undefined" ? localStorage.getItem("loganalyzer_active_project") : null;
    if (!projectId) { setError("No project selected"); return; }

    setEnriching(true);
    setError(null);
    setStatusMsg("Starting enrichment...");

    try {
      const res = await fetch(`/api/projects/${projectId}/pages/enrich`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enrichment failed");

      // Poll for completion
      const runId = data.data.enrichmentRunId;
      setStatusMsg("Fetching GSC & GA4 data...");

      for (let i = 0; i < 120; i++) { // Poll for up to 10 minutes
        await new Promise(r => setTimeout(r, 5000));
        const statusRes = await fetch(`/api/projects/${projectId}/pages/status`);
        const statusData = await statusRes.json();
        const run = statusData.data;

        if (run?.status === "completed") {
          setStatusMsg("Done!");
          onEnriched();
          return;
        } else if (run?.status === "failed") {
          throw new Error(run.error_message || "Enrichment failed");
        }
        setStatusMsg(`Processing... (${Math.round(i * 5 / 60)}m elapsed)`);
      }
      throw new Error("Enrichment timed out");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setEnriching(false);
      setStatusMsg(null);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="text-4xl mb-3">📄</div>
      <p className="text-gray-300 font-medium mb-2">No pages data yet</p>
      <p className="text-gray-500 text-sm mb-4 max-w-md">
        Fetch page-level data from Google Search Console and GA4.
        Add GSC/GA4 credentials in project settings first.
      </p>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {statusMsg && <p className="text-blue-400 text-sm mb-3 animate-pulse">{statusMsg}</p>}
      <button
        onClick={handleEnrich}
        disabled={enriching}
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
      >
        {enriching ? "Enriching..." : "Fetch Pages Data"}
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PagesPage() {
  const [index, setIndex]       = useState<PagesIndex | null>(null);
  const [selected, setSelected] = useState<ClusterMeta | null>(null);
  const [clusterPages, setClusterPages] = useState<PageData[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    loadPagesIndex()
      .then(data => {
        setIndex(data);
      })
      .catch(err => {
        console.error("Failed to load pages index:", err);
      })
      .finally(() => {
        setLoadingIndex(false);
      });
  }, []);

  async function handleSelectCluster(cluster: ClusterMeta) {
    setSelected(cluster);
    setLoadingPages(true);
    setPageError(null);
    setClusterPages([]);

    try {
      const data = await loadClusterPages(cluster.id + ".json");
      if (data) {
        setClusterPages(data.pages);
      } else {
        setPageError("No data returned from cluster file");
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to load cluster pages");
    } finally {
      setLoadingPages(false);
    }
  }

  function handleBack() {
    setSelected(null);
    setClusterPages([]);
    setPageError(null);
  }

  if (loadingIndex) return <div className="text-gray-400 p-8 animate-pulse">Loading pages index...</div>;

  if (!index) {
    return <PagesEmptyState onEnriched={() => {
      setLoadingIndex(true);
      loadPagesIndex().then(setIndex).finally(() => setLoadingIndex(false));
    }} />;
  }

  const s = index.summary;

  // Summary cards for cluster list
  const summaryCards = (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <SummaryCard
        label="Total Pages"
        value={fmt(s.totalPages)}
        sub={`${fmt(s.totalClusters)} clusters`}
      />
      <SummaryCard
        label="Total Sessions"
        value={s.totalSessions >= 1_000_000
          ? (s.totalSessions / 1_000_000).toFixed(1) + "M"
          : fmt(s.totalSessions)}
      />
      <SummaryCard
        label="Clicks (GSC)"
        value={s.totalClicks >= 1000
          ? (s.totalClicks / 1000).toFixed(0) + "K"
          : fmt(s.totalClicks)}
        sub="last 28 days"
      />
      <SummaryCard
        label="Avg Position"
        value={pos(s.avgPosition)}
        sub="Google Search"
      />
      <SummaryCard
        label="Indexed"
        value={s.indexedPct != null ? s.indexedPct + "%" : "—"}
        sub="top 100 URLs"
      />
      <SummaryCard
        label="Avg Bounce Rate"
        value={pct(s.avgBounceRate)}
      />
    </div>
  );

  // Cluster summary for drill-down view
  const clusterSummary = selected ? (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
      <div className="bg-gray-800/50 rounded-lg p-3">
        <div className="text-xs text-gray-500">Pages</div>
        <div className="text-white font-medium">{fmt(selected.pageCount)}</div>
      </div>
      <div className="bg-gray-800/50 rounded-lg p-3">
        <div className="text-xs text-gray-500">Sessions</div>
        <div className="text-white font-medium">{fmt(selected.totalSessions)}</div>
      </div>
      <div className="bg-gray-800/50 rounded-lg p-3">
        <div className="text-xs text-gray-500">Clicks</div>
        <div className="text-white font-medium">{fmt(selected.totalClicks)}</div>
      </div>
      <div className="bg-gray-800/50 rounded-lg p-3">
        <div className="text-xs text-gray-500">Avg Position</div>
        <div className={`font-medium ${selected.avgPosition && selected.avgPosition <= 10 ? "text-green-400" : "text-yellow-400"}`}>
          {pos(selected.avgPosition)}
        </div>
      </div>
      <div className="bg-gray-800/50 rounded-lg p-3">
        <div className="text-xs text-gray-500">Bounce Rate</div>
        <div className={`font-medium ${selected.avgBounceRate && selected.avgBounceRate > 0.7 ? "text-red-400" : "text-green-400"}`}>
          {pct(selected.avgBounceRate)}
        </div>
      </div>
      <div className="bg-gray-800/50 rounded-lg p-3">
        <div className="text-xs text-gray-500">Indexed</div>
        <div className={`font-medium ${selected.indexedPct >= 80 ? "text-green-400" : selected.indexedPct >= 50 ? "text-yellow-400" : "text-red-400"}`}>
          {selected.indexedPct}%
        </div>
      </div>
    </div>
  ) : null;

  // Bot clusters map (placeholder - will need summary.json if we want real bot data)
  const botClusters: Record<string, number> = {};

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg md:text-2xl font-bold">
            {selected ? (
              <>
                <button onClick={handleBack} className="text-gray-400 hover:text-gray-200 font-normal mr-2">Pages</button>
                <span className="text-gray-500 mr-2">/</span>
                <span className="font-mono text-blue-400">{selected.pattern}</span>
              </>
            ) : (
              "📄 Pages"
            )}
          </h2>
          <div className="text-xs text-gray-500 mt-0.5">
            {index.dateRange.start} → {index.dateRange.end}
            {" · "}
            Updated {new Date(index.timestamp).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {selected ? clusterSummary : summaryCards}

      {/* Cluster or page drill-down */}
      {selected ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <PageTable
            pages={clusterPages}
            onBack={handleBack}
            loading={loadingPages}
            error={pageError}
          />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <ClusterTable
            clusters={index.clusters}
            onSelect={handleSelectCluster}
            botClusters={botClusters}
          />
        </div>
      )}
    </div>
  );
}
