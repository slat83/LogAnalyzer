import { describe, it, expect } from "vitest";
import { projectRedirects } from "@/lib/redirect-projection";
import type { Cluster, RedirectData } from "@/lib/types";

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

const WITH_DETAIL = "/a/*";
const NO_DETAIL = "/b/*";

function fixtureClusters(): Cluster[] {
  return [
    makeCluster(WITH_DETAIL, [
      {
        date: "2026-04-08",
        count: 100,
        statuses: { "200": 60, "301": 20, "302": 10, "307": 5, "308": 5 },
        samples: [],
        sum: 0,
        obsCount: 0,
      },
      {
        date: "2026-04-09",
        count: 200,
        statuses: { "200": 150, "301": 30, "302": 15, "307": 5 },
        samples: [],
        sum: 0,
        obsCount: 0,
      },
      {
        date: "2026-04-10",
        count: 150,
        statuses: { "200": 100, "301": 30, "302": 20 },
        samples: [],
        sum: 0,
        obsCount: 0,
      },
    ]),
  ];
}

function fixtureRedirects(): RedirectData {
  // All-time totals: WITH_DETAIL gets 40+50+50 = 140 redirects across 3 days.
  // NO_DETAIL has 25 all-time (invisible to detail projection).
  return {
    total: 165,
    byStatus: { "301": 80, "302": 45, "307": 10, "308": 5, "400": 25 } as Record<string, number>,
    byPattern: [
      {
        pattern: WITH_DETAIL,
        count: 140,
        botCount: 70, // 50% bot share
        humanCount: 70,
      },
      {
        pattern: NO_DETAIL,
        count: 25,
        botCount: 5,
        humanCount: 20,
      },
    ],
  };
}

describe("projectRedirects — no filter", () => {
  it("passes through, flagging hasDetail per pattern", () => {
    const out = projectRedirects(fixtureRedirects(), fixtureClusters(), null, null);
    expect(out.isFiltered).toBe(false);
    expect(out.total).toBe(165); // unchanged
    const withDetail = out.byPattern.find((p) => p.pattern === WITH_DETAIL);
    const noDetail = out.byPattern.find((p) => p.pattern === NO_DETAIL);
    expect(withDetail?.hasDetail).toBe(true);
    expect(noDetail?.hasDetail).toBe(false);
  });
});

describe("projectRedirects — filtered window", () => {
  it("recomputes pattern count by summing 301/302/307/308 across days in window", () => {
    // Window 2026-04-09..2026-04-10:
    //   04-09: 30+15+5 = 50
    //   04-10: 30+20 = 50
    //   Total: 100
    const out = projectRedirects(
      fixtureRedirects(),
      fixtureClusters(),
      "2026-04-09",
      "2026-04-10",
    );
    const withDetail = out.byPattern.find((p) => p.pattern === WITH_DETAIL);
    expect(withDetail?.count).toBe(100);
    expect(withDetail?.hasDetail).toBe(true);
  });

  it("preserves all-time bot/human ratio on the filtered count", () => {
    // WITH_DETAIL has 50% bot ratio (70 of 140). Window count = 100.
    // Expect bot = 50, human = 50.
    const out = projectRedirects(
      fixtureRedirects(),
      fixtureClusters(),
      "2026-04-09",
      "2026-04-10",
    );
    const withDetail = out.byPattern.find((p) => p.pattern === WITH_DETAIL);
    expect(withDetail?.botCount).toBe(50);
    expect(withDetail?.humanCount).toBe(50);
  });

  it("sums byStatus across all detail clusters for the window", () => {
    const out = projectRedirects(
      fixtureRedirects(),
      fixtureClusters(),
      "2026-04-09",
      "2026-04-10",
    );
    expect(out.byStatus["301"]).toBe(60); // 30 + 30
    expect(out.byStatus["302"]).toBe(35); // 15 + 20
    expect(out.byStatus["307"]).toBe(5);
    expect(out.byStatus["308"] || 0).toBe(0);
    // 400 is NOT a redirect code — must be excluded even if it appeared
    expect(out.byStatus["400"]).toBeUndefined();
  });

  it("total equals sum of byStatus in the window", () => {
    const out = projectRedirects(
      fixtureRedirects(),
      fixtureClusters(),
      "2026-04-09",
      "2026-04-10",
    );
    expect(out.total).toBe(100);
  });

  it("drops patterns with zero redirects in window but keeps NO_DETAIL rows", () => {
    // 04-08..04-08 only: WITH_DETAIL has 40 redirects, NO_DETAIL stays at 25
    const out = projectRedirects(
      fixtureRedirects(),
      fixtureClusters(),
      "2026-04-08",
      "2026-04-08",
    );
    expect(out.byPattern.find((p) => p.pattern === WITH_DETAIL)?.count).toBe(40);
    expect(out.byPattern.find((p) => p.pattern === NO_DETAIL)?.count).toBe(25);
    expect(out.byPattern.find((p) => p.pattern === NO_DETAIL)?.hasDetail).toBe(false);
  });

  it("sorts filtered patterns by count descending", () => {
    // Build two patterns where detail reorders them under the window
    const clusters: Cluster[] = [
      makeCluster("/small/*", [
        { date: "2026-04-09", count: 5, statuses: { "301": 5 }, samples: [], sum: 0, obsCount: 0 },
      ]),
      makeCluster("/big/*", [
        { date: "2026-04-09", count: 50, statuses: { "301": 50 }, samples: [], sum: 0, obsCount: 0 },
      ]),
    ];
    const redirects: RedirectData = {
      total: 55,
      byStatus: { "301": 55 },
      byPattern: [
        { pattern: "/small/*", count: 5, botCount: 1, humanCount: 4 },
        { pattern: "/big/*", count: 50, botCount: 25, humanCount: 25 },
      ],
    };
    const out = projectRedirects(redirects, clusters, "2026-04-09", "2026-04-09");
    expect(out.byPattern.map((p) => p.pattern)).toEqual(["/big/*", "/small/*"]);
  });
});

describe("projectRedirects — anyDetailAvailable flag", () => {
  it("is true when at least one redirect pattern maps to a detailed cluster", () => {
    const out = projectRedirects(
      fixtureRedirects(),
      fixtureClusters(),
      "2026-04-09",
      "2026-04-09",
    );
    expect(out.anyDetailAvailable).toBe(true);
  });

  it("is false when no redirect pattern has a matching detailed cluster", () => {
    const out = projectRedirects(
      { total: 10, byStatus: { "301": 10 }, byPattern: [{ pattern: NO_DETAIL, count: 10, botCount: 3, humanCount: 7 }] },
      [], // no clusters with detail
      "2026-04-09",
      "2026-04-09",
    );
    expect(out.anyDetailAvailable).toBe(false);
  });
});

describe("projectRedirects — no-detail fallback under filter", () => {
  it("preserves all-time total and byStatus when no cluster has detailByDay", () => {
    // Regression: previously when anyDetailAvailable was false, the KPI cards
    // showed Total=0 and 301/302/307=0/0/0 because byStatus was rebuilt from
    // detail clusters (none exist). The UI banner already tells the user the
    // filter is ineffective; numbers must stay at all-time.
    const out = projectRedirects(
      {
        total: 1000,
        byStatus: { "301": 600, "302": 400 },
        byPattern: [
          { pattern: "/x/*", count: 700, botCount: 350, humanCount: 350 },
          { pattern: "/y/*", count: 300, botCount: 150, humanCount: 150 },
        ],
      },
      [], // zero clusters, so no detailByDay
      "2026-04-09",
      "2026-04-10",
    );
    expect(out.total).toBe(1000);
    expect(out.byStatus).toEqual({ "301": 600, "302": 400 });
    expect(out.byPattern[0].count).toBe(700);
    expect(out.byPattern.every((p) => !p.hasDetail)).toBe(true);
    expect(out.anyDetailAvailable).toBe(false);
    expect(out.isFiltered).toBe(true);
  });
});
