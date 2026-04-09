"use client";
import { useGscHealth } from "@/lib/use-gsc-health";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

export default function CrawlStatsPage() {
  const { data, loading, error } = useGscHealth("crawl_stats");

  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !data.length) return <NoProject error={error} />;

  const chartData = data.map((r) => ({
    date: r.report_date,
    requests: (r.data.crawlRequests as number) || 0,
    downloadMB: Math.round(((r.data.downloadBytes as number) || 0) / 1024 / 1024),
    responseMs: (r.data.avgResponseMs as number) || 0,
    requests404: (r.data.requests404 as number) || 0,
  }));

  const latest = chartData[chartData.length - 1];
  const totalRequests = chartData.reduce((s, r) => s + r.requests, 0);
  const avgResponse = Math.round(chartData.reduce((s, r) => s + r.responseMs, 0) / chartData.length);
  const total404 = chartData.reduce((s, r) => s + r.requests404, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">📈 Crawl Stats</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card title="Total Crawl Requests" value={totalRequests.toLocaleString()} />
        <Card title="Avg Response" value={`${avgResponse}ms`} />
        <Card title="Latest Daily Requests" value={latest?.requests.toLocaleString() || "—"} />
        <Card title="Total 404 Requests" value={total404.toLocaleString()} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Daily Crawl Requests</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 11 }} />
            <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }} />
            <Line type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Avg Response Time (ms)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 10 }} />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }} />
              <Bar dataKey="responseMs" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">404 Requests</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 10 }} />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }} />
              <Bar dataKey="requests404" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
