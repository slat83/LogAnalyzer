"use client";
import { useEffect, useState } from "react";
import { loadSummary } from "@/lib/data";
import { Summary } from "@/lib/types";
import Card from "@/components/Card";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function RedirectsPage() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => { loadSummary().then(setData); }, []);
  if (!data) return <div className="text-gray-400 p-8">Loading...</div>;

  const r = data.redirects;
  const pctOfTotal = data.totalRequests > 0 ? ((r.total / data.totalRequests) * 100).toFixed(1) : "0";

  const statusPie = Object.entries(r.byStatus)
    .filter(([, v]) => v > 0)
    .map(([code, count]) => ({ name: code, value: count }));

  const top10 = r.byPattern.slice(0, 10).map(p => ({
    pattern: p.pattern.length > 25 ? p.pattern.slice(0, 25) + "…" : p.pattern,
    count: p.count,
  }));

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-lg md:text-2xl font-bold">↪️ Redirect Analysis</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Card title="Total Redirects" value={r.total.toLocaleString()} />
        <Card title="% of All Requests" value={`${pctOfTotal}%`} />
        <Card title="301 / 302 / 307" value={`${(r.byStatus["301"] || 0).toLocaleString()} / ${(r.byStatus["302"] || 0).toLocaleString()} / ${(r.byStatus["307"] || 0).toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Pie chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
          <h3 className="text-base md:text-lg font-semibold mb-3">Redirect Status Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={80}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`}
                labelLine={{ strokeWidth: 1 }}>
                {statusPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
          <h3 className="text-base md:text-lg font-semibold mb-3">Top 10 Redirect Patterns</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={top10} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="pattern" stroke="#9ca3af" tick={{ fontSize: 9 }} width={120} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 overflow-x-auto">
        <h3 className="text-base md:text-lg font-semibold mb-3">Top Redirect Patterns</h3>
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left py-2 px-2">#</th>
              <th className="text-left py-2 px-2">Pattern</th>
              <th className="text-right py-2 px-2">Count</th>
              <th className="text-right py-2 px-2">Bot</th>
              <th className="text-right py-2 px-2">Human</th>
              <th className="text-right py-2 px-2">Bot%</th>
            </tr>
          </thead>
          <tbody>
            {r.byPattern.map((p, i) => (
              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-2 px-2 text-gray-500">{i + 1}</td>
                <td className="py-2 px-2 font-mono text-xs break-all">{p.pattern}</td>
                <td className="py-2 px-2 text-right">{p.count.toLocaleString()}</td>
                <td className="py-2 px-2 text-right text-yellow-400">{p.botCount.toLocaleString()}</td>
                <td className="py-2 px-2 text-right text-blue-400">{p.humanCount.toLocaleString()}</td>
                <td className="py-2 px-2 text-right">{p.count > 0 ? ((p.botCount / p.count) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
