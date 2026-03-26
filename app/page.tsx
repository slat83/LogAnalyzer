"use client";
import { useEffect, useState } from "react";
import { loadSummary } from "@/lib/data";
import { Summary } from "@/lib/types";
import Card from "@/components/Card";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function OverviewPage() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => { loadSummary().then(setData); }, []);
  if (!data) return <div className="text-gray-400 p-8">Loading...</div>;

  const statusData = Object.entries(data.statusCodes)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ name: code, value: count }));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Overview</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="Total Requests" value={data.totalRequests} />
        <Card title="Unique URLs" value={data.uniqueUrls} sub="(capped at 100k)" />
        <Card title="Date Range" value={`${data.dateRange.from} → ${data.dateRange.to}`} />
        <Card title="Avg Response Time" value={`${data.responseTime.avg}s`} sub={`p95: ${data.responseTime.p95}s | p99: ${data.responseTime.p99}s`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Requests by Day */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-3">Requests by Day</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.requestsByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Status Codes Pie */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-3">Status Codes</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`}>
                {statusData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bot vs Human */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-lg font-semibold mb-3">Bot vs Human Traffic</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400">{data.botVsHuman.human.requests.toLocaleString()}</div>
            <div className="text-gray-400">Human Requests</div>
            <div className="text-sm text-gray-500">Avg RT: {data.botVsHuman.human.avgResponseTime}s</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-400">{data.botVsHuman.bot.requests.toLocaleString()}</div>
            <div className="text-gray-400">Bot Requests</div>
            <div className="text-sm text-gray-500">Avg RT: {data.botVsHuman.bot.avgResponseTime}s</div>
          </div>
        </div>
      </div>

      {/* Response Time */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-lg font-semibold mb-3">Response Time Distribution</h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-xl font-bold text-green-400">{data.responseTime.avg}s</div>
            <div className="text-gray-500 text-sm">Average</div>
          </div>
          <div>
            <div className="text-xl font-bold text-blue-400">{data.responseTime.median}s</div>
            <div className="text-gray-500 text-sm">Median</div>
          </div>
          <div>
            <div className="text-xl font-bold text-yellow-400">{data.responseTime.p95}s</div>
            <div className="text-gray-500 text-sm">p95</div>
          </div>
          <div>
            <div className="text-xl font-bold text-red-400">{data.responseTime.p99}s</div>
            <div className="text-gray-500 text-sm">p99</div>
          </div>
        </div>
      </div>
    </div>
  );
}
