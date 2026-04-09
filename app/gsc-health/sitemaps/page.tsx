"use client";
import { useGscHealth } from "@/lib/use-gsc-health";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function SitemapsPage() {
  const { data, loading, error } = useGscHealth("sitemap");
  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !data.length) return <NoProject error={error} />;

  const chartData = data.map((r) => ({
    date: r.report_date,
    total: (r.data.sitemapTotalUrls as number) || 0,
    submitted: (r.data.gscSubmitted as number) || 0,
    delta: (r.data.delta as number) || 0,
  }));
  const latest = chartData[chartData.length - 1];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">🗺️ Sitemap Freshness</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card title="Sitemap URLs" value={latest?.total.toLocaleString() || "—"} />
        <Card title="GSC Submitted" value={latest?.submitted.toLocaleString() || "—"} />
        <Card title="Coverage" value={latest && latest.total > 0 ? `${Math.round((latest.submitted / latest.total) * 100)}%` : "—"} />
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">URL Count Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 11 }} />
            <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }} />
            <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} name="Sitemap Total" />
            <Line type="monotone" dataKey="submitted" stroke="#10b981" strokeWidth={2} name="GSC Submitted" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
