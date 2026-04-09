"use client";
import { useGscHealthAll } from "@/lib/use-gsc-health";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, AreaChart, Area,
  ComposedChart,
} from "recharts";
import { useState } from "react";

const COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];
const fmt = (n: number) => n >= 1e9 ? `${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : String(n);
const num = (v: unknown) => parseInt(String(v || "0").replace(/[\s\u00a0]/g, "")) || 0;
const pct = (v: unknown) => Math.round((parseFloat(String(v || "0")) || 0) * 10000) / 100;

function parseSection(rows: { data: Record<string, unknown> }[]): Record<string, string>[] {
  return rows.map((r) => {
    const vals: Record<string, string> = {};
    Object.entries(r.data).forEach(([k, v]) => { vals[k] = String(v || ""); });
    return vals;
  });
}

function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
      <div className="text-gray-400 text-xs mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="text-white font-medium">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function CrawlStatsDashboard() {
  const { data: crawlData, loading: l1, error: e1 } = useGscHealthAll("crawl_stats");
  const { data: byRespData, loading: l2 } = useGscHealthAll("crawl_by_response");
  const { data: perfData, loading: l3 } = useGscHealthAll("performance");
  const { data: coverageData, loading: l4 } = useGscHealthAll("coverage");
  const { data: cwvData, loading: l5 } = useGscHealthAll("core_web_vitals");
  const [activeTab, setActiveTab] = useState<"crawl" | "perf" | "coverage" | "cwv">("crawl");
  const [cwvDevice, setCwvDevice] = useState<"mobile" | "desktop">("mobile");

  if (l1 || l2 || l3 || l4 || l5) return <div className="text-gray-400 p-8 animate-pulse">Loading dashboard...</div>;
  if (e1 || !Object.keys(crawlData).length) return <NoProject error={e1} />;

  // ── Parse all sections ─────────────────────────────────────────────────────

  // Crawl Stats: daily chart
  const crawlChartKey = Object.keys(crawlData).find((k) => k.includes("диаграмма") || k.includes("Сводная"));
  const crawlChart = parseSection(crawlData[crawlChartKey || ""] || []).map((r) => {
    const vals = Object.values(r);
    return { date: vals[0], requests: num(vals[1]), downloadGB: Math.round(num(vals[2]) / 1e9 * 100) / 100, responseMs: num(vals[3]) };
  }).filter((r) => r.requests > 0);

  // Hosts
  const hostsKey = Object.keys(crawlData).find((k) => k.includes("хост"));
  const hosts = parseSection(crawlData[hostsKey || ""] || []).map((r) => {
    const vals = Object.values(r);
    return { name: vals[0], requests: num(vals[1]), status: vals[2] || "" };
  }).filter((h) => h.requests > 0).sort((a, b) => b.requests - a.requests);

  // Response codes
  const respKey = Object.keys(crawlData).find((k) => k.includes("ответу") || k.includes("response"));
  const responseCodes = parseSection(crawlData[respKey || ""] || []).map((r) => {
    const vals = Object.values(r);
    return { name: String(vals[0]).replace(/\(.*?\)/g, "").trim().substring(0, 25), value: pct(vals[1]) };
  }).filter((r) => r.value > 0);

  // File types
  const fileTypeKey = Object.keys(crawlData).find((k) => k.includes("файл"));
  const fileTypes = parseSection(crawlData[fileTypeKey || ""] || []).map((r) => {
    const vals = Object.values(r);
    return { name: String(vals[0]).substring(0, 20), value: pct(vals[1]) };
  }).filter((r) => r.value > 0);

  // Bot types
  const botKey = Object.keys(crawlData).find((k) => k.includes("робот") || k.includes("Googlebot"));
  const botTypes = parseSection(crawlData[botKey || ""] || []).map((r) => {
    const vals = Object.values(r);
    return { name: String(vals[0]).substring(0, 20), value: pct(vals[1]) };
  }).filter((r) => r.value > 0);

  // Purpose
  const purposeKey = Object.keys(crawlData).find((k) => k.includes("цели") || k.includes("purpose"));
  const purposes = parseSection(crawlData[purposeKey || ""] || []).map((r) => {
    const vals = Object.values(r);
    return { name: String(vals[0]).substring(0, 20), value: pct(vals[1]) };
  }).filter((r) => r.value > 0);

  // 404 daily trend
  const resp404ChartKey = Object.keys(byRespData).find((k) => k.includes("Диаграмма"));
  const daily404 = parseSection(byRespData[resp404ChartKey || ""] || []).map((r) => {
    const vals = Object.values(r);
    return { date: vals[0], requests: num(vals[1]) };
  }).filter((r) => r.requests > 0);

  // Performance daily
  const perfChartKey = Object.keys(perfData).find((k) => k.includes("Диаграмма"));
  const perfChart = parseSection(perfData[perfChartKey || ""] || []).map((r) => {
    const vals = Object.values(r);
    return { date: vals[0], clicks: num(vals[1]), impressions: num(vals[2]), ctr: parseFloat(String(vals[3]).replace("%", "")) || 0, position: parseFloat(vals[4]) || 0 };
  }).filter((r) => r.clicks > 0);

  // Coverage daily
  const covChartKey = Object.keys(coverageData).find((k) => k.includes("Диаграмма"));
  const covChart = parseSection(coverageData[covChartKey || ""] || []).map((r) => {
    const vals = Object.values(r);
    return { date: vals[0], notIndexed: num(vals[1]), indexed: num(vals[2]), impressions: num(vals[3]) };
  }).filter((r) => r.indexed > 0 || r.notIndexed > 0);

  // CWV daily — filter by device prefix (mobile: or desktop:)
  const cwvPrefix = cwvDevice + ":";
  const cwvChartKey = Object.keys(cwvData).find((k) => k.startsWith(cwvPrefix) && (k.includes("Диаграмма") || k.includes("Chart")))
    || Object.keys(cwvData).find((k) => k.includes("Диаграмма")); // fallback for old data without prefix
  const cwvChart = parseSection(cwvData[cwvChartKey || ""] || []).map((r) => {
    // Match by key name — NOT positional, JSON key order varies
    const findVal = (keywords: string[]) => {
      const key = Object.keys(r).find((k) => keywords.some((kw) => k.toLowerCase().includes(kw)));
      return key ? num(r[key]) : 0;
    };
    return {
      date: r["Дата"] || r["Date"] || Object.values(r)[0],
      poor: findVal(["низкая", "poor"]),
      needsImprovement: findVal(["увеличить", "needs", "improvement"]),
      good: findVal(["хорошо", "good"]),
    };
  }).filter((r) => r.good > 0 || r.poor > 0 || r.needsImprovement > 0);

  // CWV issues for selected device
  const cwvIssuesKey = Object.keys(cwvData).find((k) => k.startsWith(cwvPrefix) && (k.includes("Таблица") || k.includes("Table")))
    || Object.keys(cwvData).find((k) => k.includes("Таблица"));
  const cwvIssues = parseSection(cwvData[cwvIssuesKey || ""] || []).map((r) => {
    // Use key matching for issues too
    const findStr = (keywords: string[]) => {
      const key = Object.keys(r).find((k) => keywords.some((kw) => k.toLowerCase().includes(kw)));
      return key ? String(r[key]) : "";
    };
    return {
      level: findStr(["уровень", "level"]) || Object.values(r)[0] || "",
      issue: (findStr(["проблема", "issue", "problem"]) || Object.values(r)[1] || "").replace(/&quot;/g, '"'),
      status: findStr(["проверка", "validation", "status"]) || Object.values(r)[2] || "",
      urls: num(findStr(["url", "адрес", "страниц"]) || Object.values(r)[3]),
    };
  }).filter((iss) => iss.urls > 0);

  // Check which devices have data
  const hasMobileCwv = Object.keys(cwvData).some((k) => k.startsWith("mobile:"));
  const hasDesktopCwv = Object.keys(cwvData).some((k) => k.startsWith("desktop:"));

  // Coverage issues
  const covIssuesKey = Object.keys(coverageData).find((k) => k.includes("Критические"));
  const covIssues = parseSection(coverageData[covIssuesKey || ""] || []).map((r) => {
    const vals = Object.values(r);
    return { reason: vals[0], source: vals[1], status: vals[2], pages: num(vals[3]) };
  }).filter((r) => r.pages > 0).sort((a, b) => b.pages - a.pages);

  // ── KPIs ────────────────────────────────────────────────────────────────────

  const totalRequests = crawlChart.reduce((s, r) => s + r.requests, 0);
  const avgResponse = crawlChart.length > 0 ? Math.round(crawlChart.reduce((s, r) => s + r.responseMs, 0) / crawlChart.length) : 0;
  const total404Urls = (byRespData[Object.keys(byRespData).find((k) => k.includes("Таблица")) || ""] || []).length;
  const latestIndexed = covChart.length > 0 ? covChart[covChart.length - 1].indexed : 0;
  const latestNotIndexed = covChart.length > 0 ? covChart[covChart.length - 1].notIndexed : 0;
  const totalClicks = perfChart.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = perfChart.reduce((s, r) => s + r.impressions, 0);
  const latestCwv = cwvChart.length > 0 ? cwvChart[cwvChart.length - 1] : null;

  const TABS = [
    { key: "crawl", label: "Crawl Stats" },
    { key: "perf", label: "Search Performance" },
    { key: "coverage", label: "Index Coverage" },
    { key: "cwv", label: "Core Web Vitals" },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">📈 GSC Health Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Google Search Console monitoring since March 11, 2026</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card title="Crawl Requests" value={fmt(totalRequests)} />
        <Card title="Avg Response" value={`${avgResponse}ms`} />
        <Card title="404 URLs" value={fmt(total404Urls)} />
        <Card title="Indexed Pages" value={fmt(latestIndexed)} />
        <Card title="Not Indexed" value={fmt(latestNotIndexed)} />
        <Card title="Total Clicks" value={fmt(totalClicks)} />
        <Card title="Impressions" value={fmt(totalImpressions)} />
        <Card title="CWV Good" value={latestCwv ? `${Math.round(latestCwv.good / (latestCwv.good + latestCwv.needsImprovement + latestCwv.poor) * 100)}%` : "—"} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === t.key ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Crawl Stats ─────────────────────────────────────────────── */}
      {activeTab === "crawl" && (
        <div className="space-y-5">
          {/* Daily crawl chart */}
          {crawlChart.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-lg font-semibold text-white mb-4">Daily Crawl Requests</h2>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={crawlChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
                  <YAxis yAxisId="left" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v: number) => fmt(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <Tooltip content={<DarkTooltip />} />
                  <Legend />
                  <Area yAxisId="left" type="monotone" dataKey="requests" fill="#3b82f620" stroke="#3b82f6" strokeWidth={2} name="Requests" />
                  <Line yAxisId="right" type="monotone" dataKey="responseMs" stroke="#f59e0b" strokeWidth={2} dot={false} name="Response (ms)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Response codes pie */}
            {responseCodes.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Response Codes</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={responseCodes} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}
                      label={({ name, value }) => `${value}%`} labelLine={false}>
                      {responseCodes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<DarkTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-2">
                  {responseCodes.map((r, i) => (
                    <span key={i} className="text-[10px] text-gray-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {r.name} ({r.value}%)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* File types */}
            {fileTypes.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">File Types</h3>
                <div className="space-y-2">
                  {fileTypes.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                        <div className="h-full rounded-full flex items-center px-2" style={{ width: `${Math.max(f.value, 5)}%`, backgroundColor: COLORS[i % COLORS.length] }}>
                          <span className="text-[9px] text-white font-medium">{f.value}%</span>
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs w-20 truncate">{f.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bot types + Purpose */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              {botTypes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Googlebot Types</h3>
                  <div className="space-y-1.5">
                    {botTypes.map((b, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-400">{b.name}</span>
                        <span className="text-gray-300 font-medium">{b.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {purposes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Crawl Purpose</h3>
                  <div className="space-y-1.5">
                    {purposes.map((p, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-400">{p.name}</span>
                        <span className="text-gray-300 font-medium">{p.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Hosts table */}
          {hosts.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Hosts ({hosts.length})</h3>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-800 text-gray-500">
                    <th className="px-3 py-2 text-left">Host</th>
                    <th className="px-3 py-2 text-right">Requests</th>
                    <th className="px-3 py-2 text-right">%</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr></thead>
                  <tbody>
                    {hosts.map((h, i) => (
                      <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                        <td className="px-3 py-1.5 text-gray-300">{h.name}</td>
                        <td className="px-3 py-1.5 text-right text-gray-100 font-medium">{h.requests.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{hosts.length > 0 ? Math.round(h.requests / hosts.reduce((s, x) => s + x.requests, 0) * 100) : 0}%</td>
                        <td className="px-3 py-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${h.status.includes("нет") ? "bg-green-900/50 text-green-300" : "bg-yellow-900/50 text-yellow-300"}`}>
                            {h.status.includes("нет") ? "OK" : h.status.includes("Ранее") ? "Past issues" : h.status || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 404 trend */}
          {daily404.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3">Daily 404 Crawl Requests ({total404Urls} unique URLs)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={daily404}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <Tooltip content={<DarkTooltip />} />
                  <Area type="monotone" dataKey="requests" fill="#ef444420" stroke="#ef4444" strokeWidth={2} name="404 Requests" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Search Performance ──────────────────────────────────────── */}
      {activeTab === "perf" && perfChart.length > 0 && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card title="Total Clicks" value={fmt(totalClicks)} />
            <Card title="Total Impressions" value={fmt(totalImpressions)} />
            <Card title="Avg CTR" value={`${(totalClicks / Math.max(totalImpressions, 1) * 100).toFixed(1)}%`} />
            <Card title="Avg Position" value={perfChart.length > 0 ? (perfChart.reduce((s, r) => s + r.position, 0) / perfChart.length).toFixed(1) : "—"} />
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Daily Clicks & Impressions</h2>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={perfChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
                <YAxis yAxisId="left" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v: number) => fmt(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v: number) => fmt(v)} />
                <Tooltip content={<DarkTooltip />} />
                <Legend />
                <Bar yAxisId="right" dataKey="impressions" fill="#3b82f630" name="Impressions" radius={[2, 2, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="clicks" stroke="#10b981" strokeWidth={2} dot={false} name="Clicks" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">CTR & Position Trend</h2>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={perfChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
                <YAxis yAxisId="left" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                <YAxis yAxisId="right" orientation="right" reversed tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="ctr" stroke="#f59e0b" strokeWidth={2} dot={false} name="CTR %" />
                <Line yAxisId="right" type="monotone" dataKey="position" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Avg Position" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── TAB: Index Coverage ───────────────────────────────────────────── */}
      {activeTab === "coverage" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card title="Indexed" value={fmt(latestIndexed)} />
            <Card title="Not Indexed" value={fmt(latestNotIndexed)} />
            <Card title="Index Rate" value={latestIndexed + latestNotIndexed > 0 ? `${Math.round(latestIndexed / (latestIndexed + latestNotIndexed) * 100)}%` : "—"} />
          </div>
          {covChart.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-lg font-semibold text-white mb-4">Index Coverage Trend</h2>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={covChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v: number) => fmt(v)} />
                  <Tooltip content={<DarkTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey="indexed" fill="#10b98120" stroke="#10b981" strokeWidth={2} name="Indexed" stackId="1" />
                  <Area type="monotone" dataKey="notIndexed" fill="#ef444420" stroke="#ef4444" strokeWidth={2} name="Not Indexed" stackId="1" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {covIssues.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Critical Indexing Issues</h3>
              <div className="space-y-2">
                {covIssues.map((iss, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-gray-300 text-sm flex-1 truncate">{iss.reason}</span>
                    <span className="text-red-400 font-medium text-sm ml-2">{iss.pages.toLocaleString()} pages</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Core Web Vitals ──────────────────────────────────────────── */}
      {activeTab === "cwv" && (
        <div className="space-y-5">
          {/* Device toggle */}
          {(hasMobileCwv || hasDesktopCwv) && (
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1 w-fit">
              <button onClick={() => setCwvDevice("mobile")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${cwvDevice === "mobile" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>
                📱 Mobile
              </button>
              <button onClick={() => setCwvDevice("desktop")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${cwvDevice === "desktop" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>
                🖥️ Desktop
              </button>
            </div>
          )}

          {cwvChart.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card title="Good" value={latestCwv ? String(latestCwv.good) : "—"} sub={latestCwv ? `${Math.round(latestCwv.good / (latestCwv.good + latestCwv.needsImprovement + latestCwv.poor) * 100)}%` : ""} />
                <Card title="Needs Improvement" value={latestCwv ? String(latestCwv.needsImprovement) : "—"} />
                <Card title="Poor" value={latestCwv ? String(latestCwv.poor) : "—"} />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-lg font-semibold text-white mb-4">Core Web Vitals Trend ({cwvDevice === "mobile" ? "Mobile" : "Desktop"})</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={cwvChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
                    <Tooltip content={<DarkTooltip />} />
                    <Legend />
                    <Area type="monotone" dataKey="good" fill="#10b98130" stroke="#10b981" strokeWidth={2} name="Good" stackId="1" />
                    <Area type="monotone" dataKey="needsImprovement" fill="#f59e0b30" stroke="#f59e0b" strokeWidth={2} name="Needs Improvement" stackId="1" />
                    <Area type="monotone" dataKey="poor" fill="#ef444430" stroke="#ef4444" strokeWidth={2} name="Poor" stackId="1" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {cwvIssues.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-3">Issues ({cwvDevice === "mobile" ? "Mobile" : "Desktop"})</h3>
                  <div className="space-y-2">
                    {cwvIssues.map((iss, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-800/30 last:border-0">
                        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${iss.level.includes("Низкая") || iss.level.includes("Poor") ? "bg-red-900/50 text-red-300" : "bg-yellow-900/50 text-yellow-300"}`}>
                          {iss.level.includes("Низкая") || iss.level.includes("Poor") ? "Poor" : "NI"}
                        </span>
                        <span className="text-gray-300 text-sm flex-1">{iss.issue}</span>
                        <span className="text-gray-100 font-medium text-sm shrink-0">{iss.urls.toLocaleString()} URLs</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-gray-500 text-center py-8">
              No {cwvDevice === "mobile" ? "mobile" : "desktop"} CWV data. Upload the corresponding CWV export.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
