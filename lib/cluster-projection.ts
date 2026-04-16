import type { Cluster } from "@/lib/types";
import { filterByDateRange } from "@/lib/date-range-filter";
import { statsFromSamples } from "@/lib/parser/stats";

export type ProjectedCluster = Cluster & { hasDetail: boolean };

/**
 * Re-project a Cluster onto an active date range.
 *
 * - When per-day detail is present, every metric (count, statuses, avg RT, p95 RT)
 *   is recomputed from it.
 * - When only per-day counts exist (older analyses), only `count` is filtered;
 *   statuses/RT fall back to the cluster's full-range values.
 * - When the range is empty, the cluster is returned unchanged.
 */
export function projectCluster(
  c: Cluster,
  from: string | null,
  to: string | null,
): ProjectedCluster {
  const isFiltered = !!(from || to);
  if (!isFiltered) return { ...c, hasDetail: !!c.detailByDay?.length };

  if (c.detailByDay?.length) {
    const days = filterByDateRange(c.detailByDay, "date", from, to);
    let count = 0,
      sum = 0,
      obsCount = 0;
    const statuses: Record<string, number> = {};
    const samples: number[] = [];
    for (const d of days) {
      count += d.count;
      sum += d.sum;
      obsCount += d.obsCount;
      for (const [k, v] of Object.entries(d.statuses)) {
        statuses[k] = (statuses[k] || 0) + v;
      }
      if (d.samples?.length) samples.push(...d.samples);
    }
    const rt =
      obsCount > 0
        ? statsFromSamples(samples, sum, obsCount)
        : { avg: 0, median: 0, p95: 0, p99: 0 };
    return {
      ...c,
      count,
      statuses,
      responseTime: { avg: rt.avg, p95: rt.p95 },
      hasDetail: true,
    };
  }

  // Fallback: only per-day counts are available (older analyses)
  const byDayFiltered = filterByDateRange(c.byDay, "date", from, to);
  const count = byDayFiltered.reduce((s, d) => s + d.count, 0);
  return { ...c, count, hasDetail: false };
}
