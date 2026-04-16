"use client";
import { useMemo } from "react";
import { useSummary } from "@/lib/use-summary";
import NoProject from "@/components/NoProject";
import DataTable from "@/components/DataTable";
import { useDateRange } from "@/lib/date-range-context";
import { projectErrors } from "@/lib/error-projection";

export default function ErrorsPage() {
  const { data, error, loading } = useSummary();
  const { from, to } = useDateRange();
  const isFiltered = !!(from || to);

  const projected = useMemo(() => {
    if (!data) return null;
    return projectErrors(data.errors, data.clusters, from, to);
  }, [data, from, to]);

  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !data || !projected) return <NoProject error={error} />;

  const detailBadge = (hasDetail: boolean) =>
    isFiltered && !hasDetail ? (
      <span className="text-[10px] text-gray-500 ml-1">(full range)</span>
    ) : null;

  const cols404 = [
    { key: "pattern", label: "Pattern" },
    {
      key: "count",
      label: "Count",
      render: (r: Record<string, unknown>) => (
        <span>
          {(r.count as number).toLocaleString()}
          {detailBadge(r.hasDetail as boolean)}
        </span>
      ),
      sortValue: (r: Record<string, unknown>) => r.count as number,
    },
    { key: "examples", label: "Examples", render: (r: Record<string, unknown>) => (
      <div className="text-xs text-gray-500 max-w-[200px] md:max-w-md truncate">{(r.examples as string[] || []).join(", ")}</div>
    )},
  ];

  const cols500 = [
    { key: "pattern", label: "Pattern" },
    {
      key: "count",
      label: "Count",
      render: (r: Record<string, unknown>) => (
        <span>
          {(r.count as number).toLocaleString()}
          {detailBadge(r.hasDetail as boolean)}
        </span>
      ),
      sortValue: (r: Record<string, unknown>) => r.count as number,
    },
  ];

  const colsSlow = [
    { key: "pattern", label: "Pattern" },
    {
      key: "avgTime",
      label: "Avg Time",
      render: (r: Record<string, unknown>) => (
        <span>
          {(r.avgTime as number).toFixed(3) + "s"}
          {/* avgTime can't be filtered by date — the slow-only reservoir
              isn't persisted. Always show full-range when any filter is on. */}
          {isFiltered ? <span className="text-[10px] text-gray-500 ml-1">(full range)</span> : null}
        </span>
      ),
      sortValue: (r: Record<string, unknown>) => r.avgTime as number,
    },
    {
      key: "count",
      label: "Count",
      render: (r: Record<string, unknown>) => (
        <span>
          {(r.count as number).toLocaleString()}
          {detailBadge(r.hasDetail as boolean)}
        </span>
      ),
      sortValue: (r: Record<string, unknown>) => r.count as number,
    },
  ];

  const total404 = projected.err404.reduce((s, e) => s + e.count, 0);
  const total500 = projected.err5xx.reduce((s, e) => s + e.count, 0);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-lg md:text-2xl font-bold">Errors Analysis</h2>
        {isFiltered && !projected.anyDetailAvailable && (
          <span className="text-xs text-gray-500">re-analyze logs to filter error counts by date</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 text-center">
          <div className="text-2xl md:text-3xl font-bold text-yellow-400">{total404.toLocaleString()}</div>
          <div className="text-xs md:text-base text-gray-400">404 Errors</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 text-center">
          <div className="text-2xl md:text-3xl font-bold text-red-400">{total500.toLocaleString()}</div>
          <div className="text-xs md:text-base text-gray-400">5xx Errors</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 text-center">
          <div className="text-2xl md:text-3xl font-bold text-orange-400">{projected.slow.length}</div>
          <div className="text-xs md:text-base text-gray-400">Slow Patterns (&gt;1s avg)</div>
        </div>
      </div>

      {/* 404 Errors */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">404 Top Patterns</h3>
        <DataTable data={projected.err404 as unknown as Record<string, unknown>[]} columns={cols404} pageSize={15} />
      </div>

      {/* 500 Errors */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">5xx Errors</h3>
        <DataTable data={projected.err5xx as unknown as Record<string, unknown>[]} columns={cols500} pageSize={15} />
      </div>

      {/* Slow */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">Slow Patterns (avg &gt; 1s)</h3>
        <DataTable data={projected.slow as unknown as Record<string, unknown>[]} columns={colsSlow} pageSize={15} />
      </div>
    </div>
  );
}
