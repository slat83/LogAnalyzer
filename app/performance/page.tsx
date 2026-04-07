"use client";
import { useEffect, useState } from "react";
import { loadSummary } from "@/lib/data";
import { Summary } from "@/lib/types";
import DataTable from "@/components/DataTable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export default function PerformancePage() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => { loadSummary().then(setData); }, []);
  if (!data) return <div className="text-gray-400 p-8">Loading...</div>;

  // Sort clusters by p95 response time (descending)
  const slowest = [...data.clusters]
    .filter(c => c.responseTime.p95 > 0 && c.count > 50)
    .sort((a, b) => b.responseTime.p95 - a.responseTime.p95)
    .slice(0, 30);

  // Distribution histogram
  const buckets = [
    { label: "< 50ms", min: 0, max: 0.05 },
    { label: "50-100ms", min: 0.05, max: 0.1 },
    { label: "100-200ms", min: 0.1, max: 0.2 },
    { label: "200-500ms", min: 0.2, max: 0.5 },
    { label: "500ms-1s", min: 0.5, max: 1 },
    { label: "1-2s", min: 1, max: 2 },
    { label: "2-5s", min: 2, max: 5 },
    { label: "> 5s", min: 5, max: Infinity },
  ];

  // Approximate distribution from cluster avg response times (weighted by count)
  const histogram = buckets.map(b => {
    const count = data.clusters
      .filter(c => c.responseTime.avg >= b.min && c.responseTime.avg < b.max)
      .reduce((s, c) => s + c.count, 0);
    return { name: b.label, count };
  });

  const perfCols = [
    { key: "pattern", label: "Pattern" },
    { key: "count", label: "Requests", render: (r: Record<string, unknown>) => ((r as { count: number }).count).toLocaleString(), sortValue: (r: Record<string, unknown>) => r.count as number },
    { key: "avg", label: "Avg RT", render: (r: Record<string, unknown>) => ((r as { responseTime: { avg: number } }).responseTime.avg) + "s", sortValue: (r: Record<string, unknown>) => (r as { responseTime: { avg: number } }).responseTime.avg },
    { key: "p95", label: "p95 RT", render: (r: Record<string, unknown>) => ((r as { responseTime: { p95: number } }).responseTime.p95) + "s", sortValue: (r: Record<string, unknown>) => (r as { responseTime: { p95: number } }).responseTime.p95 },
  ];

  const chartData = slowest.slice(0, 15).map(c => ({
    name: c.pattern.length > 25 ? c.pattern.slice(0, 25) + "…" : c.pattern,
    avg: c.responseTime.avg,
    p95: c.responseTime.p95,
  }));

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-lg md:text-2xl font-bold">Performance</h2>

      {/* Global stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 text-center">
          <div className="text-lg md:text-2xl font-bold text-green-400">{data.responseTime.avg}s</div>
          <div className="text-gray-400 text-xs md:text-sm">Average</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 text-center">
          <div className="text-lg md:text-2xl font-bold text-blue-400">{data.responseTime.median}s</div>
          <div className="text-gray-400 text-xs md:text-sm">Median</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 text-center">
          <div className="text-lg md:text-2xl font-bold text-yellow-400">{data.responseTime.p95}s</div>
          <div className="text-gray-400 text-xs md:text-sm">p95</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 text-center">
          <div className="text-lg md:text-2xl font-bold text-red-400">{data.responseTime.p99}s</div>
          <div className="text-gray-400 text-xs md:text-sm">p99</div>
        </div>
      </div>

      {/* Response time distribution */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">Response Time Distribution (by cluster avg)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={histogram}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} tickFormatter={v => (v / 1000).toFixed(0) + "k"} width={40} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} formatter={(v: number) => v.toLocaleString()} />
            <Bar dataKey="count" fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Slowest clusters chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">Slowest Clusters (by p95)</h3>
        <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
          <div className="min-w-[500px]">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" stroke="#9ca3af" tick={{ fontSize: 9 }} width={160} />
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                <Bar dataKey="avg" fill="#3b82f6" name="Avg" />
                <Bar dataKey="p95" fill="#ef4444" name="p95" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Performance table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">All Clusters by Performance</h3>
        <DataTable data={slowest as unknown as Record<string, unknown>[]} columns={perfCols} pageSize={20} />
      </div>
    </div>
  );
}
