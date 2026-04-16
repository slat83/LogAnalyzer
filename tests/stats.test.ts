import { describe, it, expect } from "vitest";
import { ReservoirStats, statsFromSamples } from "@/lib/parser/stats";

describe("statsFromSamples", () => {
  it("returns zero stats when count is 0", () => {
    expect(statsFromSamples([], 0, 0)).toEqual({ avg: 0, median: 0, p95: 0, p99: 0 });
  });

  it("returns zero stats when samples is empty even if count > 0", () => {
    // defensive: no samples to derive percentiles from
    expect(statsFromSamples([], 10, 5)).toEqual({ avg: 0, median: 0, p95: 0, p99: 0 });
  });

  it("computes avg from true sum and count, not from sample mean", () => {
    // avg must reflect the real observation sum/count, not just the reservoir sample
    const samples = [0.1, 0.2, 0.3]; // sample mean = 0.2
    const trueSum = 50;
    const trueCount = 100; // true avg = 0.5
    const out = statsFromSamples(samples, trueSum, trueCount);
    expect(out.avg).toBe(0.5);
  });

  it("computes percentiles by sorting samples and picking by index", () => {
    const samples = Array.from({ length: 100 }, (_, i) => (i + 1) / 100); // 0.01..1.00
    const out = statsFromSamples(samples, 50.5, 100);
    expect(out.median).toBe(0.51); // floor(100*0.5) = 50 → samples[50] = 0.51
    expect(out.p95).toBe(0.96); // floor(100*0.95) = 95 → samples[95] = 0.96
    expect(out.p99).toBe(1); // floor(100*0.99) = 99 → samples[99] = 1.00
  });

  it("does not mutate the input samples array", () => {
    const samples = [0.9, 0.1, 0.5, 0.3];
    const snapshot = [...samples];
    statsFromSamples(samples, 1.8, 4);
    expect(samples).toEqual(snapshot);
  });

  it("rounds to 3 decimal places", () => {
    const out = statsFromSamples([0.123456], 0.123456, 1);
    expect(out.avg).toBe(0.123);
    expect(out.median).toBe(0.123);
  });
});

describe("ReservoirStats.getSamples", () => {
  it("returns a snapshot of samples, not a reference", () => {
    const r = new ReservoirStats(10);
    r.add(0.1);
    r.add(0.2);
    const samples = r.getSamples();
    samples.push(999);
    expect(r.getSamples()).toEqual([0.1, 0.2]);
  });

  it("keeps all values when count <= maxSize", () => {
    const r = new ReservoirStats(5);
    for (const v of [0.1, 0.2, 0.3]) r.add(v);
    expect(r.getSamples()).toEqual([0.1, 0.2, 0.3]);
    expect(r.count).toBe(3);
    expect(r.sum).toBeCloseTo(0.6);
  });

  it("caps reservoir at maxSize but tracks true count and sum", () => {
    const r = new ReservoirStats(10);
    for (let i = 0; i < 1000; i++) r.add(1);
    expect(r.count).toBe(1000);
    expect(r.sum).toBe(1000);
    expect(r.getSamples().length).toBe(10);
  });
});
