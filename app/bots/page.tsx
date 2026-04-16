"use client";
import { useMemo, useState, useEffect } from "react";
import { useSummary } from "@/lib/use-summary";
import NoProject from "@/components/NoProject";
import DataTable from "@/components/DataTable";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import { useDateRange } from "@/lib/date-range-context";
import { projectBots } from "@/lib/bot-projection";

export default function BotsPage() {
  const { data, error, loading } = useSummary();
  const { from, to } = useDateRange();
  const [selectedBot, setSelectedBot] = useState<string | null>(null);

  const projected = useMemo(() => {
    if (!data) return null;
    return projectBots(data.bots, data.requestsByDay, data.botVsHuman, data.totalRequests, from, to);
  }, [data, from, to]);

  // Default the drill-down to the largest bot in the current window; preserve
  // the user's pick across filter changes as long as that bot still has rows.
  useEffect(() => {
    if (!projected || projected.bots.length === 0) return;
    if (!selectedBot || !projected.bots.find((b) => b.name === selectedBot)) {
      setSelectedBot(projected.bots[0].name);
    }
  }, [projected, selectedBot]);

  if (loading) return <div className="text-gray-400 p-8">Loading...</div>;
  if (error || !data || !projected) return <NoProject error={error} />;

  const { bots, botVsHuman, totalRequests, isFiltered } = projected;
  const active = selectedBot ? bots.find((b) => b.name === selectedBot) : null;

  const botTableData = bots.map((b) => ({ name: b.name, requests: b.requests }));
  const botCols = [
    { key: "name", label: "Bot" },
    { key: "requests", label: "Requests", render: (r: Record<string, unknown>) => (r.requests as number).toLocaleString(), sortValue: (r: Record<string, unknown>) => r.requests as number },
  ];

  const humanPct = totalRequests > 0 ? (botVsHuman.human.requests / totalRequests) * 100 : 0;
  const botPct = totalRequests > 0 ? (botVsHuman.bot.requests / totalRequests) * 100 : 0;

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-lg md:text-2xl font-bold">Bot Analysis</h2>

      {/* Bot vs Human */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 text-center">
          <div className="text-xl md:text-3xl font-bold text-blue-400">{botVsHuman.human.requests.toLocaleString()}</div>
          <div className="text-xs md:text-base text-gray-400">Human ({humanPct.toFixed(1)}%)</div>
          <div className="text-xs text-gray-500">
            Avg RT: {botVsHuman.human.avgResponseTime}s
            {isFiltered && <span className="ml-1">(full range)</span>}
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 text-center">
          <div className="text-xl md:text-3xl font-bold text-yellow-400">{botVsHuman.bot.requests.toLocaleString()}</div>
          <div className="text-xs md:text-base text-gray-400">Bots ({botPct.toFixed(1)}%)</div>
          <div className="text-xs text-gray-500">
            Avg RT: {botVsHuman.bot.avgResponseTime}s
            {isFiltered && <span className="ml-1">(full range)</span>}
          </div>
        </div>
      </div>

      {/* All bots table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
        <h3 className="text-base md:text-lg font-semibold mb-3">
          All Bots{isFiltered ? ` (${bots.length} active)` : ""}
        </h3>
        <DataTable data={botTableData as unknown as Record<string, unknown>[]} columns={botCols} pageSize={20} />
      </div>

      {/* Drill-down — user picks any bot */}
      {active && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4 space-y-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="text-base md:text-lg font-semibold">🔍 Bot Detail</h3>
            <select
              value={active.name}
              onChange={(e) => setSelectedBot(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-1.5"
            >
              {bots.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} ({b.requests.toLocaleString()})
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">{active.requests.toLocaleString()} requests</span>
          </div>

          <div>
            <h4 className="text-xs md:text-sm text-gray-400 mb-2">Requests by Day</h4>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={active.byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} width={40} />
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h4 className="text-xs md:text-sm text-gray-400 mb-2">
              Top Crawled Pages
              {isFiltered && <span className="text-[10px] text-gray-500 ml-1">(full range)</span>}
            </h4>
            {active.topPages.length > 0 ? (
              <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
                <div className="min-w-[500px]">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={active.topPages.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="url" stroke="#9ca3af" tick={{ fontSize: 9 }} width={200} />
                      <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                      <Bar dataKey="count" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic">No top-page data tracked for this bot.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
