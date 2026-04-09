"use client";
import { useGscHealthAll } from "@/lib/use-gsc-health";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";

const num = (v: unknown) => parseInt(String(v || "0").replace(/[\s\u00a0]/g, "")) || 0;

export default function CrawlErrorsPage() {
  const { data, loading, error } = useGscHealthAll("coverage");
  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !Object.keys(data).length) return <NoProject error={error} />;

  // Critical issues from Coverage export
  const critKey = Object.keys(data).find((k) => k.includes("Критические") || k.includes("Critical"));
  const critIssues = (data[critKey || ""] || []).map((r) => {
    const d = r.data as Record<string, string>;
    return {
      reason: d["Причина"] || d["Reason"] || Object.values(d)[0] || "",
      source: d["Источник"] || d["Source"] || Object.values(d)[1] || "",
      status: d["Проверка"] || d["Validation"] || Object.values(d)[2] || "",
      pages: num(d["Страницы"] || d["Pages"] || Object.values(d)[3]),
    };
  }).filter((i) => i.pages > 0).sort((a, b) => b.pages - a.pages);

  // Minor issues
  const minorKey = Object.keys(data).find((k) => k.includes("Незначительные") || k.includes("Minor"));
  const minorIssues = (data[minorKey || ""] || []).map((r) => {
    const d = r.data as Record<string, string>;
    return {
      reason: d["Причина"] || d["Reason"] || Object.values(d)[0] || "",
      source: d["Источник"] || d["Source"] || Object.values(d)[1] || "",
      status: d["Проверка"] || d["Validation"] || Object.values(d)[2] || "",
      pages: num(d["Страницы"] || d["Pages"] || Object.values(d)[3]),
    };
  }).filter((i) => i.pages > 0);

  const totalCriticalPages = critIssues.reduce((s, i) => s + i.pages, 0);
  const totalMinorPages = minorIssues.reduce((s, i) => s + i.pages, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">🔍 Crawl & Index Errors</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card title="Critical Issues" value={String(critIssues.length)} />
        <Card title="Critical Pages" value={totalCriticalPages.toLocaleString()} />
        <Card title="Minor Issues" value={String(minorIssues.length)} />
        <Card title="Minor Pages" value={totalMinorPages.toLocaleString()} />
      </div>

      {critIssues.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Critical Issues</h2>
          <div className="space-y-3">
            {critIssues.map((iss, i) => (
              <div key={i} className="flex items-center gap-4 py-2 border-b border-gray-800/30 last:border-0">
                <div className="flex-1">
                  <div className="text-gray-200 font-medium">{iss.reason}</div>
                  <div className="text-gray-500 text-xs mt-0.5">{iss.source} · {iss.status}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-red-400 font-bold text-lg">{iss.pages.toLocaleString()}</div>
                  <div className="text-gray-500 text-xs">pages</div>
                </div>
                {/* Visual bar */}
                <div className="w-32 shrink-0">
                  <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-red-500/70 h-full rounded-full" style={{ width: `${Math.min((iss.pages / critIssues[0].pages) * 100, 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {minorIssues.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Minor Issues</h2>
          <div className="space-y-3">
            {minorIssues.map((iss, i) => (
              <div key={i} className="flex items-center gap-4 py-2 border-b border-gray-800/30 last:border-0">
                <div className="flex-1">
                  <div className="text-gray-200 font-medium">{iss.reason}</div>
                  <div className="text-gray-500 text-xs mt-0.5">{iss.source} · {iss.status}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-yellow-400 font-bold">{iss.pages.toLocaleString()}</div>
                  <div className="text-gray-500 text-xs">pages</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
