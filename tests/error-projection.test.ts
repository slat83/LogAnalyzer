import { describe, it, expect } from "vitest";
import { projectErrors } from "@/lib/error-projection";
import type { Cluster, ErrorEntry, SlowEntry } from "@/lib/types";

function makeCluster(pattern: string, detail: Cluster["detailByDay"]): Cluster {
  return {
    pattern,
    count: detail?.reduce((s, d) => s + d.count, 0) ?? 0,
    statuses: {},
    responseTime: { avg: 0, p95: 0 },
    byDay: detail?.map((d) => ({ date: d.date, count: d.count })) ?? [],
    topUAs: [],
    detailByDay: detail,
  };
}

/** Pattern that lives in the top-200 clusters (so it has detailByDay) */
const WITH_DETAIL = "/api/vin/*";

/** Pattern that made it into top-50 errors but NOT top-200 clusters */
const NO_DETAIL = "/rare/404-only/*";

function fixtureClusters(): Cluster[] {
  return [
    makeCluster(WITH_DETAIL, [
      {
        date: "2026-04-08",
        count: 300,
        statuses: { "200": 270, "404": 30 },
        samples: [0.2, 0.4],
        sum: 60,
        obsCount: 300,
      },
      {
        date: "2026-04-09",
        count: 400,
        statuses: { "200": 350, "404": 40, "500": 10 },
        samples: [0.3, 0.5],
        sum: 100,
        obsCount: 400,
      },
      {
        date: "2026-04-10",
        count: 300,
        statuses: { "200": 270, "404": 25, "503": 5 },
        samples: [0.4, 0.6],
        sum: 90,
        obsCount: 300,
      },
    ]),
  ];
}

function fixtureErrors(): {
  "404": ErrorEntry[];
  "500": ErrorEntry[];
  slow: SlowEntry[];
} {
  return {
    // 30+40+25 = 95 for WITH_DETAIL, 12 for NO_DETAIL (all-time only)
    "404": [
      { pattern: WITH_DETAIL, count: 95, examples: ["/api/vin/abc"] },
      { pattern: NO_DETAIL, count: 12, examples: ["/rare/404-only/x"] },
    ],
    // 10 + 5 = 15 5xx on WITH_DETAIL
    "500": [
      { pattern: WITH_DETAIL, count: 15 },
    ],
    // avgTime is slow-only (not recoverable from detailByDay)
    slow: [
      { pattern: WITH_DETAIL, avgTime: 1.8, count: 50 },
      { pattern: NO_DETAIL, avgTime: 2.5, count: 8 },
    ],
  };
}

describe("projectErrors — no filter", () => {
  it("returns rows unchanged, marking detail availability per pattern", () => {
    const out = projectErrors(fixtureErrors(), fixtureClusters(), null, null);

    expect(out.err404).toHaveLength(2);
    const withDetail = out.err404.find((e) => e.pattern === WITH_DETAIL);
    const noDetail = out.err404.find((e) => e.pattern === NO_DETAIL);
    expect(withDetail?.count).toBe(95);
    expect(withDetail?.hasDetail).toBe(true);
    expect(noDetail?.count).toBe(12);
    expect(noDetail?.hasDetail).toBe(false);
  });
});

describe("projectErrors — 404 filtering", () => {
  it("recomputes count from detailByDay.statuses[404] across the window", () => {
    // Window 2026-04-09..2026-04-10 -> 40 + 25 = 65 404s
    const out = projectErrors(
      fixtureErrors(),
      fixtureClusters(),
      "2026-04-09",
      "2026-04-10",
    );
    const withDetail = out.err404.find((e) => e.pattern === WITH_DETAIL);
    expect(withDetail?.count).toBe(65);
    expect(withDetail?.hasDetail).toBe(true);
    expect(out.anyDetailAvailable).toBe(true);
  });

  it("keeps NO_DETAIL rows unchanged and flags hasDetail=false", () => {
    const out = projectErrors(
      fixtureErrors(),
      fixtureClusters(),
      "2026-04-09",
      "2026-04-10",
    );
    const noDetail = out.err404.find((e) => e.pattern === NO_DETAIL);
    expect(noDetail?.count).toBe(12); // unchanged from full-range
    expect(noDetail?.hasDetail).toBe(false);
  });

  it("drops rows whose filtered count drops to zero, but keeps NO_DETAIL rows", () => {
    // A pattern with detail but 0 404s in the window should disappear
    const clusters = [
      makeCluster(WITH_DETAIL, [
        {
          date: "2026-04-08",
          count: 100,
          statuses: { "200": 100 }, // no 404s in window
          samples: [],
          sum: 0,
          obsCount: 100,
        },
      ]),
    ];
    const out = projectErrors(
      { "404": [{ pattern: WITH_DETAIL, count: 50, examples: [] }], "500": [], slow: [] },
      clusters,
      "2026-04-08",
      "2026-04-08",
    );
    expect(out.err404).toHaveLength(0);
  });
});

describe("projectErrors — 5xx filtering", () => {
  it("sums all 5xx codes, not just 500", () => {
    // 04-09 has 500:10, 04-10 has 503:5 -> 15 total
    const out = projectErrors(
      fixtureErrors(),
      fixtureClusters(),
      "2026-04-09",
      "2026-04-10",
    );
    expect(out.err5xx[0].count).toBe(15);
  });

  it("window containing only 500s excludes 503s (date boundary correctness)", () => {
    // Window 04-08..04-09 only -> 500:10 on 04-09, no 503s
    const out = projectErrors(
      fixtureErrors(),
      fixtureClusters(),
      "2026-04-08",
      "2026-04-09",
    );
    expect(out.err5xx[0].count).toBe(10);
  });

  it("ignores non-5xx codes like 400, 404, 200", () => {
    const clusters = [
      makeCluster(WITH_DETAIL, [
        {
          date: "2026-04-09",
          count: 100,
          statuses: { "200": 50, "404": 30, "400": 15, "520": 5 },
          samples: [],
          sum: 0,
          obsCount: 0,
        },
      ]),
    ];
    const out = projectErrors(
      { "404": [], "500": [{ pattern: WITH_DETAIL, count: 100 }], slow: [] },
      clusters,
      "2026-04-09",
      "2026-04-09",
    );
    // Only the 520 counts as 5xx
    expect(out.err5xx[0].count).toBe(5);
  });
});

describe("projectErrors — slow filtering", () => {
  it("projects count from detailByDay but keeps avgTime as full-range", () => {
    // Window 04-09..04-10 -> 400 + 300 = 700 total requests
    const out = projectErrors(
      fixtureErrors(),
      fixtureClusters(),
      "2026-04-09",
      "2026-04-10",
    );
    const slow = out.slow.find((e) => e.pattern === WITH_DETAIL);
    expect(slow?.count).toBe(700);
    // avgTime comes from the parser's slow-only reservoir; detailByDay doesn't
    // carry it, so we MUST preserve the original value unchanged.
    expect(slow?.avgTime).toBe(1.8);
  });
});

describe("projectErrors — sorting", () => {
  it("sorts 404 table by filtered count descending", () => {
    // Build two WITH_DETAIL clusters: one drops in the window, the other grows
    const clusters: Cluster[] = [
      makeCluster("/a/*", [
        { date: "2026-04-09", count: 100, statuses: { "404": 100 }, samples: [], sum: 0, obsCount: 0 },
      ]),
      makeCluster("/b/*", [
        { date: "2026-04-09", count: 50, statuses: { "404": 50 }, samples: [], sum: 0, obsCount: 0 },
      ]),
    ];
    // All-time ordering is /a first (100 > 50); filtered window keeps the same order
    const errors = {
      "404": [
        { pattern: "/b/*", count: 50, examples: [] },
        { pattern: "/a/*", count: 100, examples: [] },
      ],
      "500": [],
      slow: [],
    };
    const out = projectErrors(errors, clusters, "2026-04-09", "2026-04-09");
    expect(out.err404.map((e) => e.pattern)).toEqual(["/a/*", "/b/*"]);
  });
});
