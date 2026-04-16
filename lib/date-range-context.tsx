"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

// Re-export so existing imports (`import { filterByDateRange } from "@/lib/date-range-context"`) keep working.
export { filterByDateRange } from "./date-range-filter";

interface DateRange {
  from: string | null;
  to: string | null;
}

interface DateRangeContextType extends DateRange {
  setDateRange: (from: string | null, to: string | null) => void;
  clearDateRange: () => void;
  setPreset: (days: number) => void;
  isFiltered: boolean;
}

const DateRangeContext = createContext<DateRangeContextType>({
  from: null, to: null,
  setDateRange: () => {}, clearDateRange: () => {}, setPreset: () => {},
  isFiltered: false,
});

export function useDateRange() {
  return useContext(DateRangeContext);
}

const STORAGE_KEY = "loganalyzer_date_range";
const TRACKING_START = "2026-03-11";

function todayStr() {
  return new Date().toISOString().substring(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().substring(0, 10);
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setFrom(parsed.from || null);
        setTo(parsed.to || null);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  const setDateRange = useCallback((f: string | null, t: string | null) => {
    // Clamp from to tracking start
    const clampedFrom = f && f < TRACKING_START ? TRACKING_START : f;
    setFrom(clampedFrom);
    setTo(t);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ from: clampedFrom, to: t }));
  }, []);

  const clearDateRange = useCallback(() => {
    setFrom(null);
    setTo(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const setPreset = useCallback((days: number) => {
    if (days === 0) {
      clearDateRange();
    } else {
      setDateRange(daysAgo(days), todayStr());
    }
  }, [setDateRange, clearDateRange]);

  if (!loaded) return <>{children}</>;

  return (
    <DateRangeContext.Provider value={{ from, to, setDateRange, clearDateRange, setPreset, isFiltered: !!(from || to) }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export { TRACKING_START };
