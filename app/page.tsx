"use client";
import { useSummary } from "@/lib/use-summary";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";
import { useDateRange, filterByDateRange } from "@/lib/date-range-context";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function OverviewPage() {
  const { data, error, loading } = useSummary();
  const { from, to } = useDateRange();
  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !data) return <NoProject error={error} />;

  // Apply date range filter
  const isFiltered = !!(from || to);
  const filteredByDay = filterByDateRange(data.requestsByDay, "date", from, to);

  // Recalculate KPIs from filtered time-series
  const filteredTotal = filteredByDay.reduce((s, d) => s + d.count, 0);
  const filteredDateRange = filteredByDay.length > 0
    ? `${filteredByDay[0].date} → ${filteredByDay[filteredByDay.length - 1].date}`
    : `${data.dateRange.from} → ${data.dateRange.to}`;

  const statusData = Object.entries(data.statusCodes)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ name: code, value: count }));

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-lg md:text-2xl font-bold">Overview</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card title="Total Requests" value={isFiltered ? filteredTotal : data.totalRequests} sub={isFiltered ? `filtered from ${data.totalRequests.toLocaleString()}` : undefined} />
        <Card title="Unique URLs" value={data.uniqueUrls} sub="(capped at 100k)" />
        <Card title="Date Range" value={filteredDateRange} sub={isFiltered ? `${filteredByDay.length} days` : undefined} />
        <Card title="Avg Response Time" value={`${data.responseTime.avg}s`} sub={`p95: ${data.responseTime.p95}s | p99: ${data.responseTime.p99}s`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Requests by Day */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
          <h3 className="text-base md:text-lg font-semibold mb-3">Requests by Day</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={filteredByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} width={40} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Status Codes Pie */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
          <h3 className="text-base md:text-lg font-semibold mb-3">Status Codes</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`} labelLine={{ strokeWidth: 1 }}>
                {statusData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bot vs Human */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">Bot vs Human Traffic</h3>
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <div className="text-center">
            <div className="text-xl md:text-3xl font-bold text-blue-400">{data.botVsHuman.human.requests.toLocaleString()}</div>
            <div className="text-xs md:text-base text-gray-400">Human Requests</div>
            <div className="text-xs text-gray-500">Avg RT: {data.botVsHuman.human.avgResponseTime}s</div>
          </div>
          <div className="text-center">
            <div className="text-xl md:text-3xl font-bold text-yellow-400">{data.botVsHuman.bot.requests.toLocaleString()}</div>
            <div className="text-xs md:text-base text-gray-400">Bot Requests</div>
            <div className="text-xs text-gray-500">Avg RT: {data.botVsHuman.bot.avgResponseTime}s</div>
          </div>
        </div>
      </div>

      {/* Response Time */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">Response Time Distribution</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 text-center">
          <div>
            <div className="text-lg md:text-xl font-bold text-green-400">{data.responseTime.avg}s</div>
            <div className="text-gray-500 text-xs md:text-sm">Average</div>
          </div>
          <div>
            <div className="text-lg md:text-xl font-bold text-blue-400">{data.responseTime.median}s</div>
            <div className="text-gray-500 text-xs md:text-sm">Median</div>
          </div>
          <div>
            <div className="text-lg md:text-xl font-bold text-yellow-400">{data.responseTime.p95}s</div>
            <div className="text-gray-500 text-xs md:text-sm">p95</div>
          </div>
          <div>
            <div className="text-lg md:text-xl font-bold text-red-400">{data.responseTime.p99}s</div>
            <div className="text-gray-500 text-xs md:text-sm">p99</div>
          </div>
        </div>
      </div>
    </div>
  );
}
