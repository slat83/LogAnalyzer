"use client";
import { useEffect, useState } from "react";
import { loadSummary } from "@/lib/data";
import { Summary } from "@/lib/types";
import DataTable from "@/components/DataTable";

export default function ErrorsPage() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => { loadSummary().then(setData); }, []);
  if (!data) return <div className="text-gray-400 p-8">Loading...</div>;

  const cols404 = [
    { key: "pattern", label: "Pattern" },
    { key: "count", label: "Count", render: (r: Record<string, unknown>) => (r.count as number).toLocaleString(), sortValue: (r: Record<string, unknown>) => r.count as number },
    { key: "examples", label: "Examples", render: (r: Record<string, unknown>) => (
      <div className="text-xs text-gray-500 max-w-md truncate">{(r.examples as string[] || []).join(", ")}</div>
    )},
  ];

  const cols500 = [
    { key: "pattern", label: "Pattern" },
    { key: "count", label: "Count", render: (r: Record<string, unknown>) => (r.count as number).toLocaleString(), sortValue: (r: Record<string, unknown>) => r.count as number },
  ];

  const colsSlow = [
    { key: "pattern", label: "Pattern" },
    { key: "avgTime", label: "Avg Time", render: (r: Record<string, unknown>) => (r.avgTime as number).toFixed(3) + "s", sortValue: (r: Record<string, unknown>) => r.avgTime as number },
    { key: "count", label: "Count", render: (r: Record<string, unknown>) => (r.count as number).toLocaleString(), sortValue: (r: Record<string, unknown>) => r.count as number },
  ];

  const total404 = data.errors["404"].reduce((s, e) => s + e.count, 0);
  const total500 = data.errors["500"].reduce((s, e) => s + e.count, 0);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Errors Analysis</h2>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-yellow-400">{total404.toLocaleString()}</div>
          <div className="text-gray-400">404 Errors</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-red-400">{total500.toLocaleString()}</div>
          <div className="text-gray-400">5xx Errors</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-orange-400">{data.errors.slow.length}</div>
          <div className="text-gray-400">Slow Patterns (&gt;1s avg)</div>
        </div>
      </div>

      {/* 404 Errors */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-lg font-semibold mb-3">404 Top Patterns</h3>
        <DataTable data={data.errors["404"] as unknown as Record<string, unknown>[]} columns={cols404} pageSize={15} />
      </div>

      {/* 500 Errors */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-lg font-semibold mb-3">5xx Errors</h3>
        <DataTable data={data.errors["500"] as unknown as Record<string, unknown>[]} columns={cols500} pageSize={15} />
      </div>

      {/* Slow */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-lg font-semibold mb-3">Slow Patterns (avg &gt; 1s)</h3>
        <DataTable data={data.errors.slow as unknown as Record<string, unknown>[]} columns={colsSlow} pageSize={15} />
      </div>
    </div>
  );
}
