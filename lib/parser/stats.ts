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
}
