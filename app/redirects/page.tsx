"use client";
import { useMemo } from "react";
import { useSummary } from "@/lib/use-summary";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";
import DataTable from "@/components/DataTable";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { useDateRange } from "@/lib/date-range-context";
import { projectRedirects, type ProjectedRedirectPattern } from "@/lib/redirect-projection";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function RedirectsPage() {
  const { data, error, loading } = useSummary();
  const { from, to } = useDateRange();

  const projected = useMemo(() => {
    if (!data) return null;
    return projectRedirects(data.redirects, data.clusters, from, to);
  }, [data, from, to]);

  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !data || !projected) return <NoProject error={error} />;

  const { total, byStatus, byPattern, isFiltered, anyDetailAvailable } = projected;
  const pctOfTotal = data.totalRequests > 0 ? ((total / data.totalRequests) * 100).toFixed(1) : "0";

  const statusPie = Object.entries(byStatus)
    .filter(([, v]) => v > 0)
    .map(([code, count]) => ({ name: code, value: count }));

  const top10 = byPattern.slice(0, 10).map((p) => ({
    pattern: p.pattern.length > 25 ? p.pattern.slice(0, 25) + "…" : p.pattern,
    count: p.count,
  }));

  const ratioMuted = (v: number, hasDetail: boolean) => (
    <span className={isFiltered && hasDetail ? "text-gray-500" : ""}>
      {v.toLocaleString()}
    </span>
  );

  const cols = [
    {
      key: "pattern",
      label: "Pattern",
      render: (r: Record<string, unknown>) => (
        <span className="font-mono text-xs break-all">{String(r.pattern)}</span>
      ),
      sortValue: (r: Record<string, unknown>) => String(r.pattern),
    },
    {
      key: "count",
      label: "Count",
      render: (r: Record<string, unknown>) => (
        <span>
          {(r.count as number).toLocaleString()}
          {isFiltered && !(r.hasDetail as boolean) && (
            <span className="text-[10px] text-gray-500 ml-1">(full range)</span>
          )}
        </span>
      ),
      sortValue: (r: Record<string, unknown>) => r.count as number,
    },
    {
      key: "botCount",
      label: "Bot",
      render: (r: Record<string, unknown>) => (
        <span className="text-yellow-400">
          {ratioMuted(r.botCount as number, r.hasDetail as boolean)}
        </span>
      ),
      sortValue: (r: Record<string, unknown>) => r.botCount as number,
    },
    {
      key: "humanCount",
      label: "Human",
      render: (r: Record<string, unknown>) => (
        <span className="text-blue-400">
          {ratioMuted(r.humanCount as number, r.hasDetail as boolean)}
        </span>
      ),
      sortValue: (r: Record<string, unknown>) => r.humanCount as number,
    },
    {
      key: "botPct",
      label: "Bot%",
      render: (r: Record<string, unknown>) => {
        const count = r.count as number;
        const bot = r.botCount as number;
        const pct = count > 0 ? (bot / count) * 100 : 0;
        return (
          <span>
            {pct.toFixed(1)}%
            {isFiltered && (r.hasDetail as boolean) && (
              <span className="text-[10px] text-gray-500 ml-1">(ratio: full range)</span>
            )}
          </span>
        );
      },
      sortValue: (r: Record<string, unknown>) => {
        const count = r.count as number;
        const bot = r.botCount as number;
        return count > 0 ? bot / count : 0;
      },
    },
  ];

  // DataTable wants Record<string, unknown>[]; tack botPct as a sort-only
  // field (the render computes it live so no stale values).
  const tableRows: Record<string, unknown>[] = byPattern.map(
    (p: ProjectedRedirectPattern) => ({
      pattern: p.pattern,
      count: p.count,
      botCount: p.botCount,
      humanCount: p.humanCount,
      hasDetail: p.hasDetail,
    }),
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-lg md:text-2xl font-bold">↪️ Redirect Analysis</h2>
        {isFiltered && !anyDetailAvailable && (
          <span className="text-xs text-gray-500">re-analyze logs to filter redirects by date</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Card title="Total Redirects" value={total.toLocaleString()} />
        <Card title="% of All Requests" value={`${pctOfTotal}%`} />
        <Card
          title="301 / 302 / 307"
          value={`${(byStatus["301"] || 0).toLocaleString()} / ${(byStatus["302"] || 0).toLocaleString()} / ${(byStatus["307"] || 0).toLocaleString()}`}
        />
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

      {/* Sortable table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">
          Top Redirect Patterns{isFiltered ? ` (${byPattern.length} active)` : ""}
        </h3>
        <DataTable data={tableRows} columns={cols} pageSize={20} />
      </div>
    </div>
  );
}
