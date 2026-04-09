"use client";
import { useGscHealth } from "@/lib/use-gsc-health";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";

export default function CrawlErrorsPage() {
  const { data, loading, error } = useGscHealth("crawl_errors");
  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !data.length) return <NoProject error={error} />;

  const rows = data.map((r) => ({ date: r.report_date, ...(r.data as Record<string, unknown>) })) as Record<string, unknown>[];
  const latest = rows[rows.length - 1];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">🔍 Crawl Errors</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card title="Total Checked" value={String(latest?.totalChecked || 0)} />
        <Card title="Problematic" value={String(latest?.totalProblematic || 0)} />
        <Card title="New This Week" value={String(latest?.newThisWeek || 0)} />
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-800 text-gray-400">
            <th className="px-4 py-3 text-left">Date</th>
            <th className="px-4 py-3 text-right">Checked</th>
            <th className="px-4 py-3 text-right">Problematic</th>
            <th className="px-4 py-3 text-right">New</th>
            <th className="px-4 py-3 text-left">Details</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-4 py-2 text-gray-300">{String(r.date)}</td>
                <td className="px-4 py-2 text-right text-gray-300">{String(r.totalChecked || 0)}</td>
                <td className="px-4 py-2 text-right">{Number(r.totalProblematic) > 0 ? <span className="text-red-400">{String(r.totalProblematic)}</span> : <span className="text-green-400">0</span>}</td>
                <td className="px-4 py-2 text-right text-gray-300">{String(r.newThisWeek || 0)}</td>
                <td className="px-4 py-2 text-gray-500 text-xs max-w-md truncate">{String(r.newUrls || "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
