"use client";
import { useEffect, useState } from "react";
import { loadSummary } from "@/lib/data";
import { Summary } from "@/lib/types";
import Card from "@/components/Card";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function CheckoutPage() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => { loadSummary().then(setData); }, []);
  if (!data) return <div className="text-gray-400 p-8">Loading...</div>;

  const cf = data.checkoutFunnel;
  const successRate = cf.totalRequests > 0
    ? (((cf.byStatus["200"] || 0) / cf.totalRequests) * 100).toFixed(1)
    : "0";

  const statusPie = Object.entries(cf.byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ name: `Status ${code}`, value: count }));

  const byDayData = cf.byDay.map(d => ({
    ...d,
    successRate: d.requests > 0 ? +((d.success200 / d.requests) * 100).toFixed(1) : 0,
  }));

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-lg md:text-2xl font-bold">🛒 Checkout Funnel</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card title="Total Checkout Requests" value={cf.totalRequests.toLocaleString()} />
        <Card title="Unique VINs" value={cf.uniqueVINs.toLocaleString()} />
        <Card title="Success Rate (200)" value={`${successRate}%`} />
        <Card title="200 / 301 / 403 / 404"
          value={`${(cf.byStatus["200"] || 0).toLocaleString()} / ${(cf.byStatus["301"] || 0).toLocaleString()} / ${(cf.byStatus["403"] || 0).toLocaleString()} / ${(cf.byStatus["404"] || 0).toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Status Pie */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
          <h3 className="text-base md:text-lg font-semibold mb-3">Checkout Status Distribution</h3>
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

        {/* Daily trend */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
          <h3 className="text-base md:text-lg font-semibold mb-3">Checkout Requests by Day</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={byDayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} width={40} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
              <Line type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Requests" />
              <Line type="monotone" dataKey="success200" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Success (200)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Success rate trend */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">Success Rate Trend</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={byDayData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" width={45} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
              formatter={(v: number) => `${v}%`} />
            <Line type="monotone" dataKey="successRate" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Success Rate" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
