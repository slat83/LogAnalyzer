"use client";
import { useEffect, useState } from "react";
import { loadSummary } from "@/lib/data";
import { Summary } from "@/lib/types";
import DataTable from "@/components/DataTable";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";

export default function BotsPage() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => { loadSummary().then(setData); }, []);
  if (!data) return <div className="text-gray-400 p-8">Loading...</div>;

  const botEntries = Object.entries(data.bots).sort((a, b) => b[1].requests - a[1].requests);
  const google = data.bots.googlebot;

  const botTableData = botEntries.map(([name, b]) => ({ name, requests: b.requests }));
  const botCols = [
    { key: "name", label: "Bot" },
    { key: "requests", label: "Requests", render: (r: Record<string, unknown>) => (r.requests as number).toLocaleString(), sortValue: (r: Record<string, unknown>) => r.requests as number },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Bot Analysis</h2>

      {/* Bot vs Human */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-blue-400">{data.botVsHuman.human.requests.toLocaleString()}</div>
          <div className="text-gray-400">Human ({((data.botVsHuman.human.requests / data.totalRequests) * 100).toFixed(1)}%)</div>
          <div className="text-sm text-gray-500">Avg RT: {data.botVsHuman.human.avgResponseTime}s</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-yellow-400">{data.botVsHuman.bot.requests.toLocaleString()}</div>
          <div className="text-gray-400">Bots ({((data.botVsHuman.bot.requests / data.totalRequests) * 100).toFixed(1)}%)</div>
          <div className="text-sm text-gray-500">Avg RT: {data.botVsHuman.bot.avgResponseTime}s</div>
        </div>
      </div>

      {/* All bots table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-lg font-semibold mb-3">All Bots</h3>
        <DataTable data={botTableData as unknown as Record<string, unknown>[]} columns={botCols} pageSize={20} />
      </div>

      {/* Googlebot detail */}
      {google && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <h3 className="text-lg font-semibold">🔍 Googlebot Detail ({google.requests.toLocaleString()} requests)</h3>

          <div>
            <h4 className="text-sm text-gray-400 mb-2">Googlebot Requests by Day</h4>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={google.byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h4 className="text-sm text-gray-400 mb-2">Top Crawled Pages</h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={google.topPages.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="url" stroke="#9ca3af" tick={{ fontSize: 9 }} width={300} />
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                <Bar dataKey="count" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
