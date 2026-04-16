"use client";
import { useState, useMemo } from "react";
import { useSummary } from "@/lib/use-summary";
import NoProject from "@/components/NoProject";
import { Cluster } from "@/lib/types";
import DataTable from "@/components/DataTable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { useDateRange, filterByDateRange } from "@/lib/date-range-context";
import { projectCluster } from "@/lib/cluster-projection";

export default function ClustersPage() {
  const { data, error, loading } = useSummary();
  const { from, to } = useDateRange();
  const [selected, setSelected] = useState<Cluster | null>(null);

  const isFiltered = !!(from || to);

  const projected = useMemo(() => {
    if (!data) return [];
    return data.clusters.map((c) => projectCluster(c, from, to));
  }, [data, from, to]);

  const anyDetailAvailable = useMemo(() => projected.some((c) => c.hasDetail), [projected]);

  // Drill-down view follows the active filter
  const selectedProjected = useMemo(() => {
    if (!selected) return null;
    const match = projected.find((c) => c.pattern === selected.pattern);
    return match || null;
  }, [selected, projected]);

  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !data) return <NoProject error={error} />;

  // Don't render zero-count clusters when filtering — they're just noise
  const visibleClusters = isFiltered ? projected.filter((c) => c.count > 0) : projected;

  const columns = [
    {
      key: "pattern",
      label: "Pattern",
      render: (r: Cluster) => (
        <button onClick={() => setSelected(r)} className="text-blue-400 hover:underline text-left break-all">
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

  const drillSource = selectedProjected ?? selected;
  const drillHasDetail = selectedProjected?.hasDetail ?? false;
  const drillByDay = isFiltered
    ? filterByDateRange(selected?.byDay || [], "date", from, to)
    : selected?.byDay || [];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-lg md:text-2xl font-bold">
          URL Clusters ({visibleClusters.length}{isFiltered && visibleClusters.length !== data.clusters.length ? ` of ${data.clusters.length}` : ""})
        </h2>
        {isFiltered && !anyDetailAvailable && (
          <span className="text-xs text-gray-500">re-analyze logs to filter statuses / RT by date</span>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <DataTable data={visibleClusters as unknown as Record<string, unknown>[]} columns={columns as never} pageSize={25} />
      </div>

      {selected && drillSource && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 space-y-4">
          <div className="flex justify-between items-start gap-2">
            <h3 className="text-base md:text-lg font-semibold break-all">Drill-down: {drillSource.pattern}</h3>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white shrink-0">✕</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 text-xs md:text-sm">
            <div><span className="text-gray-400">Total:</span> {drillSource.count.toLocaleString()}</div>
            <div>
              <span className="text-gray-400">Avg RT:</span> {drillSource.responseTime.avg}s
              {isFiltered && !drillHasDetail && <span className="text-gray-500 ml-1">(full range)</span>}
            </div>
            <div>
              <span className="text-gray-400">p95 RT:</span> {drillSource.responseTime.p95}s
              {isFiltered && !drillHasDetail && <span className="text-gray-500 ml-1">(full range)</span>}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-gray-400">Statuses:</span> {Object.entries(drillSource.statuses).map(([k, v]) => `${k}:${v.toLocaleString()}`).join(", ")}
              {isFiltered && !drillHasDetail && <span className="text-gray-500 ml-1">(full range)</span>}
            </div>
          </div>

          {/* Requests by day */}
          <div>
            <h4 className="text-xs md:text-sm text-gray-400 mb-2">Requests by Day</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={drillByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} width={40} />
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top UAs */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <h4 className="text-xs md:text-sm text-gray-400">Top User Agents</h4>
              {isFiltered && <span className="text-xs text-gray-500">full range · no per-day UA breakdown</span>}
            </div>
            <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
              <div className="min-w-[400px]">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={(selected.topUAs || []).slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="ua" stroke="#9ca3af" tick={{ fontSize: 9 }} width={120} />
                    <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
