"use client";
import { useEffect, useState } from "react";
import { loadSummary } from "@/lib/data";
import { Summary } from "@/lib/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const LANG_LABELS: Record<string, string> = {
  en: "English", es: "Español", fr: "Français", ru: "Русский", pl: "Polski",
  ar: "العربية", de: "Deutsch", pt: "Português", it: "Italiano", nl: "Nederlands",
  uk: "Українська", ja: "日本語", ko: "한국어", zh: "中文", tr: "Türkçe", vi: "Tiếng Việt",
};

export default function LanguagesPage() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => { loadSummary().then(setData); }, []);
  if (!data) return <div className="text-gray-400 p-8">Loading...</div>;

  const langs = data.languages;
  const chartData = langs.slice(0, 15).map(l => ({
    lang: LANG_LABELS[l.lang] || l.lang.toUpperCase(),
    requests: l.requests,
    ok200: l.ok200,
    err404: l.err404,
  }));

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-lg md:text-2xl font-bold">🌍 Language Split</h2>

      {/* Bar chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">Requests by Language</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="lang" stroke="#9ca3af" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={60} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(0) + "k" : v} width={50} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="requests" fill="#3b82f6" name="Total" radius={[4, 4, 0, 0]} />
            <Bar dataKey="ok200" fill="#10b981" name="200 OK" radius={[4, 4, 0, 0]} />
            <Bar dataKey="err404" fill="#ef4444" name="404" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 overflow-x-auto">
        <h3 className="text-base md:text-lg font-semibold mb-3">Language Breakdown</h3>
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left py-2 px-2">Language</th>
              <th className="text-right py-2 px-2">Requests</th>
              <th className="text-right py-2 px-2">200 OK</th>
              <th className="text-right py-2 px-2">404</th>
              <th className="text-right py-2 px-2">Error Rate</th>
              <th className="text-right py-2 px-2">Bot %</th>
            </tr>
          </thead>
          <tbody>
            {langs.map((l, i) => {
              const errRate = l.requests > 0 ? ((l.err404 / l.requests) * 100).toFixed(1) : "0";
              return (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 px-2 font-medium">
                    {LANG_LABELS[l.lang] || l.lang.toUpperCase()}
                    <span className="text-gray-500 ml-1 text-xs">({l.lang})</span>
                  </td>
                  <td className="py-2 px-2 text-right">{l.requests.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right text-green-400">{l.ok200.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right text-red-400">{l.err404.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right">
                    <span className={parseFloat(errRate) > 10 ? "text-red-400" : "text-gray-300"}>{errRate}%</span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span className={l.botPercent > 50 ? "text-yellow-400" : "text-gray-300"}>{l.botPercent}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
