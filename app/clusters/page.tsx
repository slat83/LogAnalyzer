"use client";
import { useEffect, useState } from "react";
import { loadSummary } from "@/lib/data";
import { Summary, Cluster } from "@/lib/types";
import DataTable from "@/components/DataTable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";

export default function ClustersPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<Cluster | null>(null);
  useEffect(() => { loadSummary().then(setData); }, []);
  if (!data) return <div className="text-gray-400 p-8">Loading...</div>;

  const columns = [
    {
      key: "pattern",
      label: "Pattern",
      render: (r: Cluster) => (
        <button onClick={() => setSelected(r)} className="text-blue-400 hover:underline text-left">
          {r.pattern}
        </button>
      ),
      sortValue: (r: Cluster) => r.pattern,
    },
    { key: "count", label: "Requests", sortValue: (r: Cluster) => r.count, render: (r: Cluster) => r.count.toLocaleString() },
    { key: "s200", label: "200s", sortValue: (r: Cluster) => r.statuses["200"] || 0, render: (r: Cluster) => (r.statuses["200"] || 0).toLocaleString() },
    { key: "s404", label: "404s", sortValue: (r: Cluster) => r.statuses["404"] || 0, render: (r: Cluster) => (r.statuses["404"] || 0).toLocaleString() },
    { key: "rt", label: "Avg RT", sortValue: (r: Cluster) => r.responseTime.avg, render: (r: Cluster) => r.responseTime.avg + "s" },
    { key: "p95", label: "p95 RT", sortValue: (r: Cluster) => r.responseTime.p95, render: (r: Cluster) => r.responseTime.p95 + "s" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">URL Clusters ({data.clusters.length})</h2>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <DataTable data={data.clusters as unknown as Record<string, unknown>[]} columns={columns as never} pageSize={25} />
      </div>

      {selected && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Drill-down: {selected.pattern}</h3>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white">✕ Close</button>
          </div>

          <div className="grid grid-cols-4 gap-4 text-sm">
            <div><span className="text-gray-400">Total:</span> {selected.count.toLocaleString()}</div>
            <div><span className="text-gray-400">Avg RT:</span> {selected.responseTime.avg}s</div>
            <div><span className="text-gray-400">p95 RT:</span> {selected.responseTime.p95}s</div>
            <div><span className="text-gray-400">Statuses:</span> {Object.entries(selected.statuses).map(([k, v]) => `${k}:${v.toLocaleString()}`).join(", ")}</div>
          </div>

          {/* Requests by day */}
          <div>
            <h4 className="text-sm text-gray-400 mb-2">Requests by Day</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={selected.byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top UAs */}
          <div>
            <h4 className="text-sm text-gray-400 mb-2">Top User Agents</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={selected.topUAs.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="ua" stroke="#9ca3af" tick={{ fontSize: 10 }} width={150} />
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                <Bar dataKey="count" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
