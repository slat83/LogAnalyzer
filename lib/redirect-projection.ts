import type { Cluster, RedirectData, RedirectPattern } from "@/lib/types";
import { filterByDateRange } from "@/lib/date-range-filter";

/**
 * Re-project the Redirects page onto an active date range.
 *
 * Redirects are HTTP 301/302/307/308. The parser keys them by cluster pattern
 * (see lib/parser/index.ts:307-313), exactly the same patterns used in the
 * top-200 cluster list. Each top cluster also carries `detailByDay` with a
 * per-day `statuses` map, so we can recompute the filtered redirect count by
 * summing those four codes across days in the window.
 *
 * Limitations of the current data:
 * - `botCount` / `humanCount` are NOT tracked per day — the parser only
 *   stores the all-time ratio per pattern. When filtering, the counts stay
 *   at their full-range values and the UI must mark the ratio as such.
 * - Redirect patterns whose cluster is outside the top-200 (rare but
 *   possible) have no detail; we fall back to the all-time count.
 */

const REDIRECT_CODES = ["301", "302", "307", "308"] as const;
type RedirectCode = (typeof REDIRECT_CODES)[number];

function isRedirectCode(code: string): code is RedirectCode {
  return (REDIRECT_CODES as readonly string[]).includes(code);
}

export type ProjectedRedirectPattern = RedirectPattern & { hasDetail: boolean };

export interface ProjectedRedirects {
  total: number;
  byStatus: Record<string, number>;
  byPattern: ProjectedRedirectPattern[];
  /** True when a filter is active. */
  isFiltered: boolean;
  /** True when at least one pattern was recomputed from detailByDay. */
  anyDetailAvailable: boolean;
}

export function projectRedirects(
  redirects: RedirectData,
  clusters: Cluster[],
  from: string | null,
  to: string | null,
): ProjectedRedirects {
  const isFiltered = !!(from || to);

  // No filter → pass through, flagging hasDetail per row so the caller can
  // render a consistent "(full range)" label on the bot/human ratio.
  const detailByPattern = new Map<string, NonNullable<Cluster["detailByDay"]>>();
  for (const c of clusters) {
    if (c.detailByDay?.length) detailByPattern.set(c.pattern, c.detailByDay);
  }

  if (!isFiltered) {
    const byPattern: ProjectedRedirectPattern[] = redirects.byPattern.map((p) => ({
      ...p,
      hasDetail: detailByPattern.has(p.pattern),
    }));
    return {
      total: redirects.total,
      byStatus: redirects.byStatus,
      byPattern,
      isFiltered: false,
      anyDetailAvailable: byPattern.some((p) => p.hasDetail),
    };
  }

  // If NO cluster has detailByDay, we can't project anything. Fall back to
  // the all-time values and flag hasDetail=false so the UI renders "(full
  // range)" on every row. Without this branch the KPI cards would read 0
  // because the per-status sum below finds no detail to aggregate.
  if (detailByPattern.size === 0) {
    return {
      total: redirects.total,
      byStatus: redirects.byStatus,
      byPattern: redirects.byPattern.map((p) => ({ ...p, hasDetail: false })),
      isFiltered: true,
      anyDetailAvailable: false,
    };
  }

  // Filtered → rebuild per pattern from detailByDay.statuses
  let anyDetailAvailable = false;
  const byPattern: ProjectedRedirectPattern[] = redirects.byPattern.map((p) => {
    const detail = detailByPattern.get(p.pattern);
    if (!detail) {
      return { ...p, hasDetail: false };
    }
    anyDetailAvailable = true;
    const days = filterByDateRange(detail, "date", from, to);
    let count = 0;
    for (const d of days) {
      for (const [code, n] of Object.entries(d.statuses)) {
        if (isRedirectCode(code)) count += n;
      }
    }
    // Preserve the all-time bot/human ratio applied to the filtered count.
    // This assumes bot mix is roughly stable over time; we flag hasDetail=true
    // so the UI can mark the ratio "(full range)".
    const origCount = p.count || 1;
    const botShare = p.botCount / origCount;
    const humanShare = p.humanCount / origCount;
    return {
      ...p,
      count,
      botCount: Math.round(count * botShare),
      humanCount: Math.round(count * humanShare),
      hasDetail: true,
    };
  });

  // Drop zero-count rows that were successfully projected; keep rows without
  // detail even if their all-time count is zero (unlikely but possible).
  const filtered = byPattern
    .filter((p) => !p.hasDetail || p.count > 0)
    .sort((a, b) => b.count - a.count);

  // byStatus: sum each redirect code across every cluster's detail in the
  // window. This is exact for patterns that have detail; patterns without
  // detail are excluded, which matches the per-pattern total above.
  const byStatus: Record<string, number> = {};
  for (const [pattern, detail] of detailByPattern) {
    if (!pattern) continue;
    const days = filterByDateRange(detail, "date", from, to);
    for (const d of days) {
      for (const [code, n] of Object.entries(d.statuses)) {
        if (isRedirectCode(code)) {
          byStatus[code] = (byStatus[code] || 0) + n;
        }
      }
    }
  }

  const total = Object.values(byStatus).reduce((s, v) => s + v, 0);

  return {
    total,
    byStatus,
    byPattern: filtered,
    isFiltered: true,
    anyDetailAvailable,
  };
}
