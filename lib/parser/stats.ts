/** Reservoir sampling for approximate percentiles with O(k) memory. */
export class ReservoirStats {
  private reservoir: number[];
  private maxSize: number;
  count = 0;
  sum = 0;

  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
    this.reservoir = [];
  }

  add(val: number) {
    this.count++;
    this.sum += val;
    if (this.reservoir.length < this.maxSize) {
      this.reservoir.push(val);
    } else {
      const j = Math.floor(Math.random() * this.count);
      if (j < this.maxSize) {
        this.reservoir[j] = val;
      }
    }
  }

  getStats() {
    if (this.count === 0) return { avg: 0, median: 0, p95: 0, p99: 0 };
    const sorted = this.reservoir.slice().sort((a, b) => a - b);
    const n = sorted.length;
    return {
      avg: Math.round((this.sum / this.count) * 1000) / 1000,
      median: sorted[Math.floor(n * 0.5)],
      p95: sorted[Math.floor(n * 0.95)],
      p99: sorted[Math.floor(n * 0.99)],
    };
  }

  /** Serialize the raw reservoir samples (for storage). */
  getSamples(): number[] {
    return this.reservoir.slice();
  }
}

/**
 * Compute avg / median / p95 / p99 from a merged sample pool plus true sum and count.
 * Used to recompute response-time stats for an arbitrary filtered date range where
 * each day contributes its own reservoir samples.
 */
export function statsFromSamples(
  samples: number[],
  sum: number,
  count: number,
): { avg: number; median: number; p95: number; p99: number } {
  if (count === 0 || samples.length === 0) {
    return { avg: 0, median: 0, p95: 0, p99: 0 };
  }
  const sorted = samples.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const round3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    avg: round3(sum / count),
    median: round3(sorted[Math.floor(n * 0.5)]),
    p95: round3(sorted[Math.floor(n * 0.95)]),
    p99: round3(sorted[Math.floor(n * 0.99)]),
  };
}
