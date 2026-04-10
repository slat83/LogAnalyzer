"use client";
import { useEffect, useState } from "react";
import { useProject } from "@/lib/project-context";
import { useDateRange, filterByDateRange } from "@/lib/date-range-context";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

interface Mention {
  matched_at: string;
  rule: string;
  url: string;
  title: string;
  domain: string;
  language: string;
  page_category: string | null;
  page_types: string | null;
  publish_time: string | null;
  has_brand_mention: boolean;
  matched_keywords: string[];
  mention_snippet: string | null;
}

function shortRule(rule: string): string {
  if (rule.includes("carfax")) return "Carfax Alternatives";
  if (rule.includes("vehicle history")) return "VHR / VIN Keywords";
  if (rule.includes("epicvin") || rule.includes("EpicVin")) return "Brand Mentions";
  if (rule.includes("autocheck") || rule.includes("bumper.com")) return "Competitor Brands";
  if (rule.includes("vin check") || rule.includes("vin lookup")) return "VIN Search";
  return rule.substring(0, 40) + "...";
}

export default function CompetitorsPage() {
  const { projectId, loading: pLoading } = useProject();
  const { from, to } = useDateRange();
  const [data, setData] = useState<Mention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ruleFilter, setRuleFilter] = useState<string>("all");
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);

  function loadData() {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/competitors`)
      .then((r) => r.json())
      .then((d) => { setData(d.data || []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }

  async function handleFetch() {
    if (!projectId) return;
    setFetching(true); setFetchMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors/fetch`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setFetchMsg(`+${d.data?.inserted || 0} new, ${d.data?.brandMentions || 0} brand mentions`);
      // Reload data
      loadData();
    } catch (e) { setFetchMsg(`Error: ${e instanceof Error ? e.message : "Failed"}`); }
    setFetching(false);
  }

  useEffect(() => {
    if (pLoading || !projectId) { setLoading(false); return; }
    loadData();
  }, [projectId, pLoading]);

  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !projectId) return <NoProject error={error || "NO_PROJECT"} />;
  if (!data.length) return <NoProject error="No competitor data. Upload a Firehose report or connect the Firehose API." />;

  // Date filter
  const filtered = filterByDateRange(
    data.map((m) => ({ ...m, date: m.matched_at.substring(0, 10) })),
    "date", from, to
  );

  // Rule filter
  const withRuleFilter = ruleFilter === "all" ? filtered : filtered.filter((m) => shortRule(m.rule) === ruleFilter);

  // Search
  const displayed = search
    ? withRuleFilter.filter((m) => m.url.toLowerCase().includes(search.toLowerCase()) || m.title.toLowerCase().includes(search.toLowerCase()) || m.domain.toLowerCase().includes(search.toLowerCase()))
    : withRuleFilter;

  // Stats
  const uniqueRules = [...new Set(filtered.map((m) => shortRule(m.rule)))];
  const ruleBreakdown = uniqueRules.map((r) => ({
    name: r,
    count: filtered.filter((m) => shortRule(m.rule) === r).length,
  })).sort((a, b) => b.count - a.count);

  const domainBreakdown = Object.entries(
    filtered.reduce<Record<string, number>>((acc, m) => { acc[m.domain] = (acc[m.domain] || 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));

  // Daily trend
  const dailyCounts: Record<string, number> = {};
  filtered.forEach((m) => { const d = m.date; dailyCounts[d] = (dailyCounts[d] || 0) + 1; });
  const dailyTrend = Object.entries(dailyCounts).sort().map(([date, count]) => ({ date, count }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">🔍 Competitor Monitoring</h1>
        <div className="flex items-center gap-3">
          {fetchMsg && <span className={`text-xs ${fetchMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{fetchMsg}</span>}
          <button
            onClick={handleFetch}
            disabled={fetching}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            {fetching ? "Fetching..." : "Fetch New Mentions"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card title="Total Mentions" value={String(filtered.length)} />
        <Card title="Unique Domains" value={String(new Set(filtered.map((m) => m.domain)).size)} />
        <Card title="Active Rules" value={String(uniqueRules.length)} />
        <Card title="Brand Mentions" value={String(filtered.filter((m) => m.has_brand_mention).length)} sub={`of ${filtered.length} total`} />
        <Card title="Date Range" value={filtered.length > 0 ? `${filtered[filtered.length-1].date} → ${filtered[0].date}` : "—"} />
      </div>

      {/* Daily trend */}
      {dailyTrend.length > 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Mentions Over Time</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Mentions" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Rule breakdown */}
        {ruleBreakdown.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">By Rule</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={ruleBreakdown} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}
                  label={({ name, count }) => `${count}`}>
                  {ruleBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ruleBreakdown.map((r, i) => (
                <span key={i} className="text-[10px] text-gray-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  {r.name} ({r.count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Top domains */}
        {domainBreakdown.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Top Domains</h3>
            <div className="space-y-2">
              {domainBreakdown.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(d.count / domainBreakdown[0].count) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                  </div>
                  <span className="text-gray-400 text-xs w-36 truncate">{d.name}</span>
                  <span className="text-gray-500 text-xs w-6 text-right">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filters + Table */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 text-sm">
          <option value="all">All Rules</option>
          {uniqueRules.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search URL, title, domain..."
          className="flex-1 min-w-[200px] px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 text-sm placeholder-gray-500" />
        <span className="text-gray-500 text-xs">{displayed.length} results</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto max-h-[600px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900"><tr className="border-b border-gray-800 text-gray-400">
            <th className="px-3 py-2 text-left w-24">Date</th>
            <th className="px-3 py-2 text-left">Title / URL</th>
            <th className="px-3 py-2 text-left w-36">Domain</th>
            <th className="px-3 py-2 text-left w-32">Rule</th>
          </tr></thead>
          <tbody>
            {displayed.slice(0, 200).map((m, i) => (
              <tr key={i} className={`border-b border-gray-800/30 hover:bg-gray-800/20 ${m.has_brand_mention ? "bg-green-900/10" : ""}`}>
                <td className="px-3 py-2 text-gray-500 text-xs">{m.date}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-xs block truncate max-w-md">
                      {m.title || m.url}
                    </a>
                    {m.has_brand_mention && (
                      <span className="text-[9px] bg-green-900/60 text-green-300 px-1.5 py-0.5 rounded shrink-0">
                        {m.matched_keywords?.join(", ") || "Brand"}
                      </span>
                    )}
                  </div>
                  <div className="text-gray-600 text-[10px] truncate">{m.url}</div>
                  {m.mention_snippet && (
                    <div className="text-gray-500 text-[10px] mt-1 italic max-w-md truncate">&ldquo;{m.mention_snippet}&rdquo;</div>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-400 text-xs">{m.domain}</td>
                <td className="px-3 py-2">
                  <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{shortRule(m.rule)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayed.length > 200 && <div className="text-gray-500 text-xs text-center py-2">Showing 200 of {displayed.length}</div>}
      </div>
    </div>
  );
}
