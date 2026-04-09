"use client";
import { useState } from "react";
import { useGscHealthAll } from "@/lib/use-gsc-health";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useDateRange, filterByDateRange } from "@/lib/date-range-context";

const num = (v: unknown) => parseInt(String(v || "0").replace(/[\s\u00a0]/g, "")) || 0;

function parseSection(rows: { data: Record<string, unknown> }[]): Record<string, string>[] {
  return rows.map((r) => {
    const vals: Record<string, string> = {};
    Object.entries(r.data).forEach(([k, v]) => { vals[k] = String(v || ""); });
    return vals;
  });
}

function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm shadow-xl">
      <div className="text-gray-400 text-xs mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="text-white font-medium">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function CwvPage() {
  const { data, loading, error } = useGscHealthAll("core_web_vitals");
  const { from, to } = useDateRange();
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");

  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !Object.keys(data).length) return <NoProject error={error} />;

  const prefix = device + ":";
  const hasMobile = Object.keys(data).some((k) => k.startsWith("mobile:"));
  const hasDesktop = Object.keys(data).some((k) => k.startsWith("desktop:"));

  // Chart data
  const chartKey = Object.keys(data).find((k) => k.startsWith(prefix) && (k.includes("Диаграмма") || k.includes("Chart")))
    || Object.keys(data).find((k) => k.includes("Диаграмма"));
  const chartData = parseSection(data[chartKey || ""] || []).map((r) => {
    // Match by key name (Russian or English) — NOT positional, since JSON key order varies
    const findVal = (keywords: string[]) => {
      const key = Object.keys(r).find((k) => keywords.some((kw) => k.toLowerCase().includes(kw)));
      return key ? num(r[key]) : 0;
    };
    return {
      date: r["Дата"] || r["Date"] || Object.values(r)[0],
      poor: findVal(["низкая", "poor"]),
      needsImprovement: findVal(["увеличить", "needs", "improvement"]),
      good: findVal(["хорошо", "good"]),
    };
  }).filter((r) => r.good > 0 || r.poor > 0 || r.needsImprovement > 0);

  const filteredChartData = filterByDateRange(chartData, "date", from, to);

  // Issues
  const issuesKey = Object.keys(data).find((k) => k.startsWith(prefix) && (k.includes("Таблица") || k.includes("Table")))
    || Object.keys(data).find((k) => k.includes("Таблица"));
  const issues = parseSection(data[issuesKey || ""] || []).map((r) => {
    const vals = Object.values(r);
    return { level: vals[0] || "", issue: String(vals[1] || "").replace(/&quot;/g, '"'), status: vals[2] || "", urls: num(vals[3]) };
  }).filter((iss) => iss.issue);

  const latest = filteredChartData[filteredChartData.length - 1];
  const total = latest ? latest.good + latest.needsImprovement + latest.poor : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">⚙️ Core Web Vitals</h1>
        {(hasMobile || hasDesktop) && (
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            <button onClick={() => setDevice("mobile")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${device === "mobile" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>
              📱 Mobile
            </button>
            <button onClick={() => setDevice("desktop")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${device === "desktop" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>
              🖥️ Desktop
            </button>
          </div>
        )}
      </div>

      {filteredChartData.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card title="Good" value={latest ? String(latest.good) : "—"} sub={total > 0 ? `${Math.round((latest?.good || 0) / total * 100)}%` : ""} />
            <Card title="Needs Improvement" value={latest ? String(latest.needsImprovement) : "—"} sub={total > 0 ? `${Math.round((latest?.needsImprovement || 0) / total * 100)}%` : ""} />
            <Card title="Poor" value={latest ? String(latest.poor) : "—"} sub={total > 0 ? `${Math.round((latest?.poor || 0) / total * 100)}%` : ""} />
            <Card title="Total URLs" value={total.toLocaleString()} />
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white mb-4">
              CWV Trend ({device === "mobile" ? "Mobile" : "Desktop"})
            </h2>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={filteredChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Legend />
                <Area type="monotone" dataKey="good" fill="#10b98130" stroke="#10b981" strokeWidth={2} name="Good" stackId="1" />
                <Area type="monotone" dataKey="needsImprovement" fill="#f59e0b30" stroke="#f59e0b" strokeWidth={2} name="Needs Improvement" stackId="1" />
                <Area type="monotone" dataKey="poor" fill="#ef444430" stroke="#ef4444" strokeWidth={2} name="Poor" stackId="1" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {issues.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-4">
                Issues ({device === "mobile" ? "Mobile" : "Desktop"})
              </h3>
              <div className="space-y-3">
                {issues.map((iss, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-800/30 last:border-0">
                    <span className={`text-xs px-2 py-1 rounded shrink-0 ${
                      iss.level.includes("Низкая") || iss.level.includes("Poor")
                        ? "bg-red-900/50 text-red-300"
                        : "bg-yellow-900/50 text-yellow-300"
                    }`}>
                      {iss.level.includes("Низкая") || iss.level.includes("Poor") ? "Poor" : "Needs Improvement"}
                    </span>
                    <span className="text-gray-300 text-sm flex-1">{iss.issue}</span>
                    <span className="text-gray-100 font-semibold text-sm shrink-0">{iss.urls.toLocaleString()} URLs</span>
                    <span className="text-gray-500 text-xs shrink-0">{iss.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-gray-500 text-center py-12">
          <div className="text-3xl mb-2">📊</div>
          No {device === "mobile" ? "mobile" : "desktop"} CWV data found.
          Upload the corresponding Core Web Vitals export from GSC.
        </div>
      )}
    </div>
  );
}
