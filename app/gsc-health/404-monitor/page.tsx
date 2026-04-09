"use client";
import { useState } from "react";
import { useGscHealthAll } from "@/lib/use-gsc-health";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Monitor404Page() {
  const { data: byRespData, loading, error } = useGscHealthAll("crawl_by_response");
  const [search, setSearch] = useState("");

  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !Object.keys(byRespData).length) return <NoProject error={error} />;

  // 404 URLs from the "Таблица" section
  const tableSection = Object.entries(byRespData).find(([k]) => k.includes("Таблица") || k.includes("Table"));
  const urls = (tableSection?.[1] || []).map((r) => {
    const d = r.data as Record<string, string>;
    const vals = Object.values(d);
    return {
      url: vals.find((v) => String(v).startsWith("http")) || vals[1] || "",
      lastCrawled: vals[0] || r.report_date,
      response: vals.find((v) => String(v).includes("404") || String(v).includes("найд")) || "",
    };
  }).filter((u) => u.url);

  // Daily trend from chart section
  const chartSection = Object.entries(byRespData).find(([k]) => k.includes("Диаграмма") || k.includes("Chart"));
  const dailyData = (chartSection?.[1] || []).map((r) => {
    const d = r.data as Record<string, string>;
    const vals = Object.values(d);
    return {
      date: r.report_date,
      requests: parseInt(String(vals[1] || "0").replace(/\s/g, "")) || 0,
    };
  }).filter((r) => r.requests > 0);

  // Pattern breakdown
  const patterns: Record<string, number> = {};
  urls.forEach((u) => {
    try {
      const path = new URL(u.url).pathname;
      const segs = path.split("/").filter(Boolean);
      const key = "/" + (segs[0] || "");
      patterns[key] = (patterns[key] || 0) + 1;
    } catch { /* skip */ }
  });
  const topPatterns = Object.entries(patterns).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const filtered = search ? urls.filter((u) => u.url.toLowerCase().includes(search.toLowerCase())) : urls;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">🚫 404 Monitor</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card title="Total 404 URLs" value={urls.length.toLocaleString()} />
        <Card title="Unique Patterns" value={Object.keys(patterns).length.toLocaleString()} />
        <Card title="Top Pattern" value={topPatterns[0]?.[0] || "—"} sub={`${topPatterns[0]?.[1] || 0} URLs`} />
      </div>

      {dailyData.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Daily 404 Crawl Requests</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }} />
              <Line type="monotone" dataKey="requests" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {topPatterns.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-3">Top 404 Patterns</h2>
          <div className="space-y-2">
            {topPatterns.map(([pattern, count]) => (
              <div key={pattern} className="flex items-center gap-3">
                <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                  <div className="bg-red-500/60 h-full rounded-full" style={{ width: `${(count / topPatterns[0][1]) * 100}%` }} />
                </div>
                <span className="text-gray-300 text-sm w-40 truncate">{pattern}</span>
                <span className="text-gray-500 text-sm w-12 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search URLs..."
          className="w-full px-3 py-2 mb-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900"><tr className="border-b border-gray-800 text-gray-400">
              <th className="px-4 py-2 text-left">URL</th>
              <th className="px-4 py-2 text-left w-40">Last Crawled</th>
            </tr></thead>
            <tbody>
              {filtered.slice(0, 200).map((u, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-1.5 text-blue-400 text-xs break-all">{u.url}</td>
                  <td className="px-4 py-1.5 text-gray-500 text-xs">{u.lastCrawled}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 && <div className="text-gray-500 text-xs text-center py-2">Showing 200 of {filtered.length}</div>}
        </div>
      </div>
    </div>
  );
}
