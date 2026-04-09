"use client";
import { useState } from "react";
import { useGscHealth } from "@/lib/use-gsc-health";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";

export default function CanonicalPage() {
  const { data, loading, error } = useGscHealth("canonical");
  const [filter, setFilter] = useState("all");
  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !data.length) return <NoProject error={error} />;

  const rows = data.map((r) => ({ date: r.report_date, ...(r.data as Record<string, unknown>) })) as Record<string, unknown>[];
  const flagCounts = { OK: 0, MISMATCH: 0, OTHER: 0 };
  rows.forEach((r) => {
    const f = String(r.flag || "").toUpperCase();
    if (f === "OK") flagCounts.OK++;
    else if (f.includes("MISMATCH")) flagCounts.MISMATCH++;
    else flagCounts.OTHER++;
  });

  const filtered = filter === "all" ? rows : rows.filter((r) => {
    const f = String(r.flag || "").toUpperCase();
    if (filter === "ok") return f === "OK";
    if (filter === "mismatch") return f.includes("MISMATCH");
    return f !== "OK" && !f.includes("MISMATCH");
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">🔗 Canonical Audit</h1>
      <div className="grid grid-cols-3 gap-3">
        <Card title="OK" value={String(flagCounts.OK)} />
        <Card title="Mismatch" value={String(flagCounts.MISMATCH)} />
        <Card title="Other Issues" value={String(flagCounts.OTHER)} />
      </div>
      <div className="flex gap-2">
        {["all", "ok", "mismatch", "other"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded text-sm ${filter === f ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-800 text-gray-400">
            <th className="px-3 py-2 text-left">URL</th>
            <th className="px-3 py-2 text-left">Verdict</th>
            <th className="px-3 py-2 text-left">Robots</th>
            <th className="px-3 py-2 text-left">Flag</th>
          </tr></thead>
          <tbody>
            {filtered.slice(0, 100).map((r, i) => (
              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-3 py-2 text-blue-400 text-xs max-w-xs truncate">{String(r.url || "")}</td>
                <td className="px-3 py-2 text-gray-300">{String(r.indexingVerdict || "")}</td>
                <td className="px-3 py-2 text-gray-400">{String(r.robotsState || "")}</td>
                <td className="px-3 py-2">{String(r.flag) === "OK" ? <span className="text-green-400">OK</span> : <span className="text-red-400">{String(r.flag || "")}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
