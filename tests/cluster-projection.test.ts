import { describe, it, expect } from "vitest";
import { projectCluster } from "@/lib/cluster-projection";
import type { Cluster } from "@/lib/types";

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    pattern: "/api/*",
    count: 1000,
    statuses: { "200": 900, "404": 100 },
    responseTime: { avg: 0.25, p95: 0.8 },
    byDay: [
      { date: "2026-04-08", count: 300 },
      { date: "2026-04-09", count: 400 },
      { date: "2026-04-10", count: 300 },
    ],
    topUAs: [],
    detailByDay: [
      {
        date: "2026-04-08",
        count: 300,
        statuses: { "200": 280, "404": 20 },
        samples: [0.1, 0.2, 0.3, 0.4, 0.5],
        sum: 75, // true avg = 75 / 300 = 0.25
        obsCount: 300,
      },
      {
        date: "2026-04-09",
        count: 400,
        statuses: { "200": 360, "404": 40 },
        samples: [0.2, 0.4, 0.6, 0.8, 1.0],
        sum: 240, // true avg = 240 / 400 = 0.6
        obsCount: 400,
      },
      {
        date: "2026-04-10",
        count: 300,
        statuses: { "200": 260, "404": 40 },
        samples: [0.1, 0.3, 0.5, 0.7, 0.9],
        sum: 150, // true avg = 150 / 300 = 0.5
        obsCount: 300,
      },
    ],
    ...overrides,
  };
}

describe("projectCluster — no date filter", () => {
  it("returns the cluster unchanged with hasDetail=true when detail is present", () => {
    const c = makeCluster();
    const out = projectCluster(c, null, null);
    expect(out.count).toBe(1000);
    expect(out.statuses).toEqual({ "200": 900, "404": 100 });
    expect(out.responseTime).toEqual({ avg: 0.25, p95: 0.8 });
    expect(out.hasDetail).toBe(true);
  });

  it("reports hasDetail=false when detailByDay is missing", () => {
    const c = makeCluster({ detailByDay: undefined });
    expect(projectCluster(c, null, null).hasDetail).toBe(false);
  });
});

describe("projectCluster — with detail", () => {
  it("recomputes count and statuses for a range that matches one day", () => {
    const c = makeCluster();
    const out = projectCluster(c, "2026-04-09", "2026-04-09");
    expect(out.count).toBe(400);
    expect(out.statuses).toEqual({ "200": 360, "404": 40 });
    expect(out.hasDetail).toBe(true);
  });

  it("aggregates statuses across a multi-day range", () => {
    const c = makeCluster();
    const out = projectCluster(c, "2026-04-08", "2026-04-09");
    expect(out.count).toBe(700);
    expect(out.statuses).toEqual({ "200": 640, "404": 60 });
  });

  it("recomputes avg RT from summed sum and obsCount — not from sample mean", () => {
    const c = makeCluster();
    // Apr 9 only: sum=240, obsCount=400 → avg should be 0.6, not the sample mean 0.6
    const out = projectCluster(c, "2026-04-09", "2026-04-09");
    expect(out.responseTime.avg).toBe(0.6);
  });

  it("merges samples from multiple days when computing p95", () => {
    const c = makeCluster();
    const out = projectCluster(c, "2026-04-08", "2026-04-10");
    // merged samples sorted: [0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    // p95 = index floor(15 * 0.95) = 14 → sorted[14] = 1.0
    expect(out.responseTime.p95).toBe(1);
  });

  it("returns zero RT when the filtered range has no observations", () => {
    const c = makeCluster();
    const out = projectCluster(c, "2027-01-01", "2027-01-31");
    expect(out.count).toBe(0);
    expect(out.statuses).toEqual({});
    expect(out.responseTime).toEqual({ avg: 0, p95: 0 });
    expect(out.hasDetail).toBe(true);
  });

  it("does not mutate the input cluster", () => {
    const c = makeCluster();
    const statusesBefore = JSON.stringify(c.statuses);
    const rtBefore = JSON.stringify(c.responseTime);
    projectCluster(c, "2026-04-08", "2026-04-09");
    expect(JSON.stringify(c.statuses)).toBe(statusesBefore);
    expect(JSON.stringify(c.responseTime)).toBe(rtBefore);
    expect(c.count).toBe(1000);
  });
});

describe("projectCluster — fallback when no detail", () => {
  const cNoDetail = makeCluster({ detailByDay: undefined });

  it("filters count from byDay, keeps statuses and RT at full-range values", () => {
    const out = projectCluster(cNoDetail, "2026-04-09", "2026-04-09");
    expect(out.count).toBe(400); // from byDay
    // full-range fallback
    expect(out.statuses).toEqual({ "200": 900, "404": 100 });
    expect(out.responseTime).toEqual({ avg: 0.25, p95: 0.8 });
    expect(out.hasDetail).toBe(false);
  });

  it("returns count=0 when the filter excludes every byDay entry", () => {
    const out = projectCluster(cNoDetail, "2027-01-01", "2027-01-31");
    expect(out.count).toBe(0);
    expect(out.hasDetail).toBe(false);
  });
});
