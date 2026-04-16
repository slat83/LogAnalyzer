import type { Cluster, ErrorEntry, SlowEntry } from "@/lib/types";
import { filterByDateRange } from "@/lib/date-range-filter";

/**
 * Re-project the Errors tables onto an active date range.
 *
 * The parser keys every error by the same cluster pattern used in the main
 * clusters list (see lib/parser/index.ts, `errors404[cluster]` etc.). For any
 * error row whose pattern matches a top-200 cluster that has per-day detail
 * (`detailByDay`), we can recompute the filtered count from the cluster's
 * per-day status breakdown — no DB round-trip, no re-parse.
 *
 * Rows whose pattern is outside the top-200 clusters (a common case when a
 * low-volume URL family is 99% 404s) have no detail, so we keep the original
 * all-time count and flag `hasDetail: false` so the UI can show "(full range)".
 *
 * Slow patterns' `avgTime` is the average RT **among slow requests only**
 * (rt > 1s) — that slice is NOT captured in `detailByDay`, which carries a
 * reservoir of ALL RT samples. We can filter the count but we cannot
 * recompute the slow-only avg from detail. Keep avgTime at its full-range
 * value when filtering; the UI marks it "(full range)".
 */

export type ProjectedErrorEntry = ErrorEntry & { hasDetail: boolean };
export type ProjectedSlowEntry = SlowEntry & { hasDetail: boolean };

export interface ProjectedErrors {
  err404: ProjectedErrorEntry[];
  err5xx: ProjectedErrorEntry[];
  slow: ProjectedSlowEntry[];
  /** True iff at least one row was recomputed from per-day detail. Lets
      the UI decide whether to show the "(full range)" banner. */
  anyDetailAvailable: boolean;
}

function isFiveXx(statusCode: string): boolean {
  return statusCode.length === 3 && statusCode.startsWith("5");
}

function sumStatusAcrossDays(
  detail: NonNullable<Cluster["detailByDay"]>,
  match: (code: string) => boolean,
): number {
  let total = 0;
  for (const d of detail) {
    for (const [code, n] of Object.entries(d.statuses)) {
      if (match(code)) total += n;
    }
  }
  return total;
}

function sumCountAcrossDays(
  detail: NonNullable<Cluster["detailByDay"]>,
): number {
  let total = 0;
  for (const d of detail) total += d.count;
  return total;
}

export function projectErrors(
  errors: { "404": ErrorEntry[]; "500": ErrorEntry[]; slow: SlowEntry[] },
  clusters: Cluster[],
  from: string | null,
  to: string | null,
): ProjectedErrors {
  const isFiltered = !!(from || to);

  // Precompute a lookup from pattern to the cluster's filtered detailByDay,
  // so every error row maps to its cluster in O(1).
  const detailByPattern = new Map<string, NonNullable<Cluster["detailByDay"]>>();
  for (const c of clusters) {
    if (c.detailByDay?.length) {
      detailByPattern.set(c.pattern, c.detailByDay);
    }
  }

  let anyDetailAvailable = false;

  const project404 = (e: ErrorEntry): ProjectedErrorEntry => {
    if (!isFiltered) return { ...e, hasDetail: !!detailByPattern.get(e.pattern) };
    const detail = detailByPattern.get(e.pattern);
    if (!detail) return { ...e, hasDetail: false };
    anyDetailAvailable = true;
    const filtered = filterByDateRange(detail, "date", from, to);
    const count = sumStatusAcrossDays(filtered, (c) => c === "404");
    return { ...e, count, hasDetail: true };
  };

  const project5xx = (e: ErrorEntry): ProjectedErrorEntry => {
    if (!isFiltered) return { ...e, hasDetail: !!detailByPattern.get(e.pattern) };
    const detail = detailByPattern.get(e.pattern);
    if (!detail) return { ...e, hasDetail: false };
    anyDetailAvailable = true;
    const filtered = filterByDateRange(detail, "date", from, to);
    const count = sumStatusAcrossDays(filtered, isFiveXx);
    return { ...e, count, hasDetail: true };
  };

  const projectSlow = (e: SlowEntry): ProjectedSlowEntry => {
    if (!isFiltered) return { ...e, hasDetail: !!detailByPattern.get(e.pattern) };
    const detail = detailByPattern.get(e.pattern);
    if (!detail) return { ...e, hasDetail: false };
    anyDetailAvailable = true;
    const filtered = filterByDateRange(detail, "date", from, to);
    // Count = total requests for this cluster in the window. avgTime stays
    // full-range because detailByDay carries all-RT reservoir, not slow-only.
    const count = sumCountAcrossDays(filtered);
    return { ...e, count, hasDetail: true };
  };

  const err404 = errors["404"]
    .map(project404)
    .filter((e) => !isFiltered || !e.hasDetail || e.count > 0)
    .sort((a, b) => b.count - a.count);

  const err5xx = errors["500"]
    .map(project5xx)
    .filter((e) => !isFiltered || !e.hasDetail || e.count > 0)
    .sort((a, b) => b.count - a.count);

  const slow = errors.slow
    .map(projectSlow)
    .filter((e) => !isFiltered || !e.hasDetail || e.count > 0)
    .sort((a, b) => b.avgTime - a.avgTime);

  return { err404, err5xx, slow, anyDetailAvailable };
}
