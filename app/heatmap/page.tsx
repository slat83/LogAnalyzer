"use client";
import { useEffect, useState } from "react";
import { loadSummary } from "@/lib/data";
import { Summary } from "@/lib/types";

function getColor(value: number, min: number, max: number): string {
  if (max === min) return "rgb(34, 197, 94)";
  const ratio = Math.min((value - min) / (max - min), 1);
  // Green (low) → Yellow (mid) → Red (high)
  if (ratio < 0.5) {
    const r = Math.round(34 + (234 - 34) * (ratio * 2));
    const g = Math.round(197 - (197 - 179) * (ratio * 2));
    const b = Math.round(94 - 94 * (ratio * 2));
    return `rgb(${r},${g},${b})`;
  } else {
    const r = Math.round(234 + (239 - 234) * ((ratio - 0.5) * 2));
    const g = Math.round(179 - (179 - 68) * ((ratio - 0.5) * 2));
    const b = Math.round(0 + 68 * ((ratio - 0.5) * 2));
    return `rgb(${r},${g},${b})`;
  }
}

function getVolumeColor(value: number, min: number, max: number): string {
  if (max === min || value === 0) return "rgb(31, 41, 55)";
  const ratio = Math.min((value - min) / (max - min), 1);
  const r = Math.round(31 + (59 - 31) * ratio);
  const g = Math.round(41 + (130 - 41) * ratio);
  const b = Math.round(55 + (246 - 55) * ratio);
  return `rgb(${r},${g},${b})`;
}

function HeatmapGrid({ title, data, days, hours, colorFn, formatFn }: {
  title: string;
  data: number[][];
  days: string[];
  hours: number[];
  colorFn: (v: number, min: number, max: number) => string;
  formatFn: (v: number) => string;
}) {
  const allValues = data.flat().filter(v => v > 0);
  const min = allValues.length > 0 ? Math.min(...allValues) : 0;
  const max = allValues.length > 0 ? Math.max(...allValues) : 1;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
      <h3 className="text-base md:text-lg font-semibold mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour headers */}
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: `60px repeat(24, 1fr)` }}>
            <div className="text-[9px] text-gray-500"></div>
            {hours.map(h => (
              <div key={h} className="text-[9px] text-gray-500 text-center">{h}</div>
            ))}
          </div>
          {/* Rows */}
          {days.map((day, di) => (
            <div key={day} className="grid gap-[2px] mt-[2px]" style={{ gridTemplateColumns: `60px repeat(24, 1fr)` }}>
              <div className="text-xs text-gray-400 flex items-center">{day}</div>
              {hours.map((_, hi) => {
                const val = data[di]?.[hi] ?? 0;
                const bg = val > 0 ? colorFn(val, min, max) : "rgb(31, 41, 55)";
                return (
                  <div
                    key={hi}
                    className="aspect-square rounded-sm flex items-center justify-center text-[8px] text-white/80 font-medium cursor-default hover:ring-1 hover:ring-white/30"
                    style={{ backgroundColor: bg, minHeight: "20px" }}
                    title={`${day} ${hi}:00 — ${formatFn(val)}`}
                  >
                    {val > 0 ? formatFn(val) : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-500">
        <span>Low</span>
        <div className="flex gap-[1px]">
          {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
            <div key={i} className="w-4 h-3 rounded-sm" style={{ backgroundColor: colorFn(min + (max - min) * r, min, max) }} />
          ))}
        </div>
        <span>High</span>
      </div>
    </div>
  );
}

export default function HeatmapPage() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => { loadSummary().then(setData); }, []);
  if (!data) return <div className="text-gray-400 p-8">Loading...</div>;

  const hm = data.heatmap;

  return (
    <div className="space-y-4 md:space-y-6">
      <h2 className="text-lg md:text-2xl font-bold">🔥 Response Time & Traffic Heatmap</h2>

      <HeatmapGrid
        title="Average Response Time (seconds)"
        data={hm.responseTime}
        days={hm.days}
        hours={hm.hours}
        colorFn={getColor}
        formatFn={(v) => v.toFixed(2)}
      />

      <HeatmapGrid
        title="Request Volume"
        data={hm.requests}
        days={hm.days}
        hours={hm.hours}
        colorFn={getVolumeColor}
        formatFn={(v) => v >= 1000 ? (v / 1000).toFixed(0) + "k" : String(v)}
      />
    </div>
  );
}
