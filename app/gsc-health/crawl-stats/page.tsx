"use client";
import { useGscHealthAll } from "@/lib/use-gsc-health";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899"];

export default function CrawlStatsPage() {
  const { data: crawlData, loading: l1, error: e1 } = useGscHealthAll("crawl_stats");
  const { data: byRespData, loading: l2, error: e2 } = useGscHealthAll("crawl_by_response");

  if (l1 || l2) return <div className="text-gray-400 p-8">Loading...</div>;
  if ((e1 && e2) || (!Object.keys(crawlData).length && !Object.keys(byRespData).length)) return <NoProject error={e1 || e2} />;

  // Find the chart section (daily crawl data) — Russian name varies
  const chartSection = Object.entries(crawlData).find(([k]) => k.toLowerCase().includes("диаграмма") || k.toLowerCase().includes("сводная")) || Object.entries(crawlData)[0];
  const chartRows = (chartSection?.[1] || []).map((r) => {
    const d = r.data as Record<string, string>;
    // Headers are in Russian — map them
    const vals = Object.values(d);
    const keys = Object.keys(d);
    return {
      date: r.report_date,
      requests: parseInt(String(vals[1] || d[keys[1]] || "0").replace(/\s/g, "")) || 0,
      downloadMB: Math.round((parseInt(String(vals[2] || "0").replace(/\s/g, "")) || 0) / 1024 / 1024),
      responseMs: parseInt(String(vals[3] || "0").replace(/\s/g, "")) || 0,
    };
  }).filter((r) => r.requests > 0);

  // Host breakdown
  const hostsSection = Object.entries(crawlData).find(([k]) => k.includes("хост") || k.includes("host"));
  const hosts = (hostsSection?.[1] || []).map((r) => {
    const d = r.data as Record<string, string>;
    const vals = Object.values(d);
    return { name: vals[0] || "", requests: parseInt(String(vals[1] || "0").replace(/\s/g, "")) || 0, status: vals[2] || "" };
  }).filter((h) => h.requests > 0);

  // Response code breakdown
  const responseSection = Object.entries(crawlData).find(([k]) => k.includes("ответ") || k.includes("response"));
  const responseCodes = (responseSection?.[1] || []).map((r) => {
    const d = r.data as Record<string, string>;
    const vals = Object.values(d);
    return { name: String(vals[0] || "").replace(/\(.*?\)/g, "").trim(), value: Math.round((parseFloat(String(vals[1] || "0")) || 0) * 100) };
  }).filter((r) => r.value > 0);

  // 404 URLs from crawl_by_response
  const resp404Section = Object.entries(byRespData).find(([k]) => k.includes("Таблица") || k.includes("table"));
  const total404 = resp404Section?.[1]?.length || 0;

  const totalRequests = chartRows.reduce((s, r) => s + r.requests, 0);
  const avgResponse = chartRows.length > 0 ? Math.round(chartRows.reduce((s, r) => s + r.responseMs, 0) / chartRows.length) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">📈 Crawl Stats</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card title="Total Crawl Requests" value={totalRequests.toLocaleString()} />
        <Card title="Avg Response" value={`${avgResponse}ms`} />
        <Card title="Days Tracked" value={String(chartRows.length)} />
        <Card title="404 URLs Found" value={total404.toLocaleString()} />
      </div>

      {chartRows.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Daily Crawl Requests</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }} />
              <Line type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {responseCodes.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Response Code Distribution</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={responseCodes} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}%`}>
                  {responseCodes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {hosts.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Hosts</h2>
            <div className="space-y-2">
              {hosts.map((h, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm truncate">{h.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">{h.requests.toLocaleString()}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${h.status.includes("нет") || h.status.includes("no") ? "bg-green-900/50 text-green-300" : "bg-yellow-900/50 text-yellow-300"}`}>
                      {h.status.includes("нет") || h.status.includes("no") ? "OK" : "Issues"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {chartRows.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Avg Response Time (ms)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 10 }} />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }} />
              <Bar dataKey="responseMs" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
