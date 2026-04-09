"use client";

import { useDateRange, TRACKING_START } from "@/lib/date-range-context";
import { usePathname } from "next/navigation";

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "28d", days: 28 },
  { label: "90d", days: 90 },
  { label: "All", days: 0 },
];

// Don't show on non-dashboard pages
const HIDDEN_PATHS = ["/login", "/projects"];

function todayStr() {
  return new Date().toISOString().substring(0, 10);
}

export default function DateRangePicker() {
  const { from, to, setDateRange, setPreset, isFiltered } = useDateRange();
  const pathname = usePathname();

  // Hide on login, project settings, etc.
  if (HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  const today = todayStr();

  // Determine active preset
  const daysFromToday = (dateStr: string) => {
    const diff = new Date(today).getTime() - new Date(dateStr).getTime();
    return Math.round(diff / (24 * 60 * 60 * 1000));
  };
  const activePreset = !isFiltered ? 0 : (from && to === today ? daysFromToday(from) : -1);

  return (
    <div className="flex items-center gap-3 px-4 md:px-6 lg:px-8 py-2 bg-gray-900/50 border-b border-gray-800/50 flex-wrap">
      {/* Date inputs */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={from || ""}
          min={TRACKING_START}
          max={to || today}
          onChange={(e) => setDateRange(e.target.value || null, to || today)}
          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 [color-scheme:dark]"
        />
        <span className="text-gray-600 text-xs">—</span>
        <input
          type="date"
          value={to || ""}
          min={from || TRACKING_START}
          max={today}
          onChange={(e) => setDateRange(from || TRACKING_START, e.target.value || null)}
          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 [color-scheme:dark]"
        />
      </div>

      {/* Preset buttons */}
      <div className="flex gap-1">
        {PRESETS.map((p) => {
          const isActive = p.days === 0 ? !isFiltered : activePreset === p.days;
          return (
            <button
              key={p.days}
              onClick={() => setPreset(p.days)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Active filter indicator */}
      {isFiltered && from && to && (
        <span className="text-gray-500 text-[10px] hidden sm:inline">
          {from} → {to}
        </span>
      )}
    </div>
  );
}
