"use client";
import { useEffect, useState } from "react";
import { loadSummary } from "@/lib/data";
import { Summary } from "@/lib/types";
import Card from "@/components/Card";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#3b82f6"];

export default function CrawlBudgetPage() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => { loadSummary().then(setData); }, []);
  if (!data) return <div className="text-gray-400 p-8">Loading...</div>;

  const cb = data.crawlBudget;

  const donutData = [
    { name: "Useful (200 HTML)", value: cb.useful.count },
    { name: "404 Not Found", value: cb.waste.notFound404.count },
    { name: "Redirects (3xx)", value: cb.waste.redirects.count },
    { name: "410 Gone", value: cb.waste.gone410.count },
    { name: "Static Assets", value: cb.waste.static.count },
  ].filter(d => d.value > 0);

  const wasteCategories = [
    { category: "Redirects (301/302/307)", count: cb.waste.redirects.count, percent: cb.waste.redirects.percent },
    { category: "404 Not Found", count: cb.waste.notFound404.count, percent: cb.waste.notFound404.percent },
    { category: "410 Gone", count: cb.waste.gone410.count, percent: cb.waste.gone410.percent },
    { category: "Static Assets (.js/.css/.png)", count: cb.waste.static.count, percent: cb.waste.static.percent },
  ];

  const wasteScore = cb.waste.total.percent;
  const wasteColor = wasteScore > 50 ? "text-red-400" : wasteScore > 30 ? "text-yellow-400" : "text-green-400";

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-lg md:text-2xl font-bold">🕷️ Crawl Budget Analysis</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">Crawl Waste Score</div>
          <div className={`text-3xl md:text-4xl font-bold ${wasteColor}`}>{wasteScore}%</div>
          <div className="text-gray-500 text-xs mt-1">of Googlebot crawls wasted</div>
        </div>
        <Card title="Total Googlebot Requests" value={cb.totalGooglebot.toLocaleString()} />
        <Card title="Useful Crawls (200 HTML)" value={cb.useful.count.toLocaleString()} sub={`${cb.useful.percent}%`} />
        <Card title="Total Waste" value={cb.waste.total.count.toLocaleString()} sub={`${cb.waste.total.percent}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Donut chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
          <h3 className="text-base md:text-lg font-semibold mb-3">Googlebot Crawl Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="45%"
                innerRadius={50} outerRadius={90}
                label={({ name, percent }) => `${name.split(" ")[0]} ${(percent * 100).toFixed(1)}%`}
                labelLine={{ strokeWidth: 1 }}>
                {donutData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Waste breakdown table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
          <h3 className="text-base md:text-lg font-semibold mb-3">Waste Breakdown</h3>
          <table className="w-full text-xs md:text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left py-2 px-2">Category</th>
                <th className="text-right py-2 px-2">Requests</th>
                <th className="text-right py-2 px-2">% of Googlebot</th>
              </tr>
            </thead>
            <tbody>
              {wasteCategories.map((w, i) => (
                <tr key={i} className="border-b border-gray-800/50">
                  <td className="py-2 px-2">{w.category}</td>
                  <td className="py-2 px-2 text-right">{w.count.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right">
                    <span className={w.percent > 10 ? "text-red-400" : "text-gray-300"}>{w.percent}%</span>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-700 font-bold">
                <td className="py-2 px-2">Total Waste</td>
                <td className="py-2 px-2 text-right">{cb.waste.total.count.toLocaleString()}</td>
                <td className="py-2 px-2 text-right text-red-400">{cb.waste.total.percent}%</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Googlebot Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Total requests: <span className="text-white font-medium">{cb.totalGooglebot.toLocaleString()}</span></div>
              <div>Useful crawls: <span className="text-green-400 font-medium">{cb.useful.count.toLocaleString()} ({cb.useful.percent}%)</span></div>
              <div>Wasted crawls: <span className="text-red-400 font-medium">{cb.waste.total.count.toLocaleString()} ({cb.waste.total.percent}%)</span></div>
              <div>410 from Googlebot: <span className="text-yellow-400 font-medium">{data.gone410.googlebotRequests.toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
