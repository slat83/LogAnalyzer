"use client";
import { useSummary } from "@/lib/use-summary";
import NoProject from "@/components/NoProject";
import Card from "@/components/Card";
import { useDateRange, filterByDateRange } from "@/lib/date-range-context";
import { statsFromSamples } from "@/lib/parser/stats";
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

  // Recalculate totals from filtered time-series
  const filteredTotal = filteredByDay.reduce((s, d) => s + d.count, 0);
  const filteredDateRange = filteredByDay.length > 0
    ? `${filteredByDay[0].date} → ${filteredByDay[filteredByDay.length - 1].date}`
    : `${data.dateRange.from} → ${data.dateRange.to}`;

  // Recalculate bot/human totals from per-bot byDay series
  const filteredBotTotal = isFiltered
    ? Object.values(data.bots).reduce(
        (s, b) => s + filterByDateRange(b.byDay, "date", from, to).reduce((ss, d) => ss + d.count, 0),
        0
      )
    : data.botVsHuman.bot.requests;
  const filteredHumanTotal = isFiltered
    ? Math.max(0, filteredTotal - filteredBotTotal)
    : data.botVsHuman.human.requests;

  // Status codes — aggregate per-day breakdown if available
  const hasStatusByDay = Array.isArray(data.statusCodesByDay) && data.statusCodesByDay.length > 0;
  let statusCounts: Record<string, number> = data.statusCodes;
  if (isFiltered && hasStatusByDay) {
    const filteredDays = filterByDateRange(data.statusCodesByDay!, "date", from, to);
    const agg: Record<string, number> = {};
    for (const d of filteredDays) {
      for (const [code, cnt] of Object.entries(d.statuses)) {
        agg[code] = (agg[code] || 0) + cnt;
      }
    }
    statusCounts = agg;
  }
  const statusData = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ name: code, value: count }));

  // Response time — recompute percentiles from per-day samples if available
  const hasRtByDay = Array.isArray(data.responseTimeByDay) && data.responseTimeByDay.length > 0;
  let rt = data.responseTime;
  if (isFiltered && hasRtByDay) {
    const filteredDays = filterByDateRange(data.responseTimeByDay!, "date", from, to);
    const mergedSamples: number[] = [];
    let sum = 0, count = 0;
    for (const d of filteredDays) {
      if (d.samples?.length) mergedSamples.push(...d.samples);
      sum += d.sum;
      count += d.count;
    }
    rt = count > 0 ? statsFromSamples(mergedSamples, sum, count) : { avg: 0, median: 0, p95: 0, p99: 0 };
  }

  // Show stale-data label on blocks whose filtering requires an older re-analyzed dataset
  const statusStale = isFiltered && !hasStatusByDay;
  const rtStale = isFiltered && !hasRtByDay;

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-lg md:text-2xl font-bold">Overview</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card title="Total Requests" value={isFiltered ? filteredTotal : data.totalRequests} sub={isFiltered ? `filtered from ${data.totalRequests.toLocaleString()}` : undefined} />
        <Card title="Unique URLs" value={data.uniqueUrls} sub={isFiltered ? "full range (capped at 100k)" : "(capped at 100k)"} />
        <Card title="Date Range" value={filteredDateRange} sub={isFiltered ? `${filteredByDay.length} days` : undefined} />
        <Card title="Avg Response Time" value={`${rt.avg}s`} sub={`p95: ${rt.p95}s | p99: ${rt.p99}s${rtStale ? " · full range" : ""}`} />
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
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-base md:text-lg font-semibold">Status Codes</h3>
            {statusStale && <span className="text-xs text-gray-500">full range · re-analyze for per-day</span>}
          </div>
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
            <div className="text-xl md:text-3xl font-bold text-blue-400">{filteredHumanTotal.toLocaleString()}</div>
            <div className="text-xs md:text-base text-gray-400">Human Requests</div>
            <div className="text-xs text-gray-500">Avg RT: {data.botVsHuman.human.avgResponseTime}s{isFiltered ? " (full range)" : ""}</div>
          </div>
          <div className="text-center">
            <div className="text-xl md:text-3xl font-bold text-yellow-400">{filteredBotTotal.toLocaleString()}</div>
            <div className="text-xs md:text-base text-gray-400">Bot Requests</div>
            <div className="text-xs text-gray-500">Avg RT: {data.botVsHuman.bot.avgResponseTime}s{isFiltered ? " (full range)" : ""}</div>
          </div>
        </div>
      </div>

      {/* Response Time */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-base md:text-lg font-semibold">Response Time Distribution</h3>
          {rtStale && <span className="text-xs text-gray-500">full range · re-analyze for per-day</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 text-center">
          <div>
            <div className="text-lg md:text-xl font-bold text-green-400">{rt.avg}s</div>
            <div className="text-gray-500 text-xs md:text-sm">Average</div>
          </div>
          <div>
            <div className="text-lg md:text-xl font-bold text-blue-400">{rt.median}s</div>
            <div className="text-gray-500 text-xs md:text-sm">Median</div>
          </div>
          <div>
            <div className="text-lg md:text-xl font-bold text-yellow-400">{rt.p95}s</div>
            <div className="text-gray-500 text-xs md:text-sm">p95</div>
          </div>
          <div>
            <div className="text-lg md:text-xl font-bold text-red-400">{rt.p99}s</div>
            <div className="text-gray-500 text-xs md:text-sm">p99</div>
          </div>
        </div>
      </div>
    </div>
  );
}
