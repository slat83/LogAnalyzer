"use client";
import { useGscHealthAll } from "@/lib/use-gsc-health";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function CwvPage() {
  const { data, loading, error } = useGscHealthAll("core_web_vitals");
  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !Object.keys(data).length) return <NoProject error={error} />;

  // Chart section: daily trend (Poor / Needs Improvement / Good)
  const chartSection = Object.entries(data).find(([k]) => k.includes("Диаграмма") || k.includes("Chart"));
  const chartData = (chartSection?.[1] || []).map((r) => {
    const d = r.data as Record<string, string>;
    const vals = Object.values(d);
    return {
      date: r.report_date,
      poor: parseInt(String(vals[1] || "0")) || 0,
      needsImprovement: parseInt(String(vals[2] || "0")) || 0,
      good: parseInt(String(vals[3] || "0")) || 0,
    };
  }).filter((r) => r.good > 0 || r.poor > 0 || r.needsImprovement > 0);

  // Issues table
  const issuesSection = Object.entries(data).find(([k]) => k.includes("Таблица") || k.includes("Table"));
  const issues = (issuesSection?.[1] || []).map((r) => {
    const d = r.data as Record<string, string>;
    const vals = Object.values(d);
    return { level: vals[0] || "", issue: vals[1] || "", validation: vals[2] || "", urls: parseInt(String(vals[3] || "0")) || 0 };
  });

  // Metadata (device type)
  const metaSection = Object.entries(data).find(([k]) => k.includes("Метаданные") || k.includes("Metadata"));
  const device = metaSection?.[1]?.[0]?.data ? Object.values(metaSection[1][0].data as Record<string, string>)[1] || "" : "";

  const latest = chartData[chartData.length - 1];
  const totalGood = latest?.good || 0;
  const totalNI = latest?.needsImprovement || 0;
  const totalPoor = latest?.poor || 0;
  const total = totalGood + totalNI + totalPoor;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">⚙️ Core Web Vitals</h1>
        {device && <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">{device}</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card title="Good" value={totalGood.toLocaleString()} sub={total > 0 ? `${Math.round(totalGood/total*100)}%` : ""} />
        <Card title="Needs Improvement" value={totalNI.toLocaleString()} sub={total > 0 ? `${Math.round(totalNI/total*100)}%` : ""} />
        <Card title="Poor" value={totalPoor.toLocaleString()} sub={total > 0 ? `${Math.round(totalPoor/total*100)}%` : ""} />
        <Card title="Total URLs" value={total.toLocaleString()} />
      </div>

      {chartData.length > 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">CWV Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }} />
              <Legend />
              <Line type="monotone" dataKey="good" stroke="#10b981" strokeWidth={2} dot={false} name="Good" />
              <Line type="monotone" dataKey="needsImprovement" stroke="#f59e0b" strokeWidth={2} dot={false} name="Needs Improvement" />
              <Line type="monotone" dataKey="poor" stroke="#ef4444" strokeWidth={2} dot={false} name="Poor" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {issues.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
          <h2 className="text-lg font-semibold text-white p-5 pb-3">Issues</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-800 text-gray-400">
              <th className="px-4 py-2 text-left">Level</th>
              <th className="px-4 py-2 text-left">Issue</th>
              <th className="px-4 py-2 text-right">URLs</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr></thead>
            <tbody>
              {issues.map((iss, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${iss.level.includes("Низкая") || iss.level.includes("Poor") ? "bg-red-900/50 text-red-300" : "bg-yellow-900/50 text-yellow-300"}`}>{iss.level.includes("Низкая") || iss.level.includes("Poor") ? "Poor" : "NI"}</span></td>
                  <td className="px-4 py-2 text-gray-300 text-xs max-w-md">{iss.issue.replace(/&quot;/g, '"')}</td>
                  <td className="px-4 py-2 text-right text-gray-100 font-medium">{iss.urls.toLocaleString()}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{iss.validation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
