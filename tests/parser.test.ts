import { describe, it, expect } from "vitest";
import { parseLogFiles } from "@/lib/parser";

/**
 * The parser treats input as gzipped first, then falls back to plain text on decode failure.
 * A plain UTF-8 blob is therefore a valid "log file" for these tests.
 */
function makeLogFile(name: string, lines: string[]): File {
  return new File([lines.join("\n")], name, { type: "text/plain" });
}

describe("parseLogFiles — per-day fields", () => {
  it("emits statusCodesByDay with one entry per day and correct status counts", async () => {
    const file = makeLogFile("access.log", [
      "08/Apr/2026:12:00:00 +0000 /home Mozilla/5.0 200 0.100",
      "08/Apr/2026:12:00:01 +0000 /home Mozilla/5.0 200 0.200",
      "08/Apr/2026:12:00:02 +0000 /missing Mozilla/5.0 404 0.050",
      "09/Apr/2026:12:00:00 +0000 /home Mozilla/5.0 200 0.300",
      "09/Apr/2026:12:00:01 +0000 /missing Mozilla/5.0 404 0.080",
      "09/Apr/2026:12:00:02 +0000 /missing Mozilla/5.0 404 0.090",
    ]);

    const summary = await parseLogFiles([file], [], () => {});

    expect(summary.statusCodesByDay).toBeDefined();
    expect(summary.statusCodesByDay).toHaveLength(2);

    const apr8 = summary.statusCodesByDay!.find((d) => d.date === "2026-04-08")!;
    expect(apr8.statuses).toEqual({ "200": 2, "404": 1 });

    const apr9 = summary.statusCodesByDay!.find((d) => d.date === "2026-04-09")!;
    expect(apr9.statuses).toEqual({ "200": 1, "404": 2 });
  });

  it("emits responseTimeByDay with true sum, obsCount, and sample array per day", async () => {
    const file = makeLogFile("access.log", [
      "08/Apr/2026:12:00:00 +0000 /home Mozilla/5.0 200 0.100",
      "08/Apr/2026:12:00:01 +0000 /home Mozilla/5.0 200 0.200",
      "09/Apr/2026:12:00:00 +0000 /home Mozilla/5.0 200 1.000",
    ]);

    const summary = await parseLogFiles([file], [], () => {});

    expect(summary.responseTimeByDay).toBeDefined();
    expect(summary.responseTimeByDay).toHaveLength(2);

    const apr8 = summary.responseTimeByDay!.find((d) => d.date === "2026-04-08")!;
    expect(apr8.count).toBe(2);
    expect(apr8.sum).toBeCloseTo(0.3, 5);
    expect(apr8.samples.length).toBe(2);
    expect(apr8.samples.sort()).toEqual([0.1, 0.2]);

    const apr9 = summary.responseTimeByDay!.find((d) => d.date === "2026-04-09")!;
    expect(apr9.count).toBe(1);
    expect(apr9.sum).toBeCloseTo(1.0, 5);
  });

  it("sorts per-day arrays by date ascending", async () => {
    const file = makeLogFile("access.log", [
      "10/Apr/2026:12:00:00 +0000 /home Mozilla/5.0 200 0.1",
      "08/Apr/2026:12:00:00 +0000 /home Mozilla/5.0 200 0.1",
      "09/Apr/2026:12:00:00 +0000 /home Mozilla/5.0 200 0.1",
    ]);

    const summary = await parseLogFiles([file], [], () => {});
    expect(summary.statusCodesByDay!.map((d) => d.date)).toEqual([
      "2026-04-08",
      "2026-04-09",
      "2026-04-10",
    ]);
    expect(summary.responseTimeByDay!.map((d) => d.date)).toEqual([
      "2026-04-08",
      "2026-04-09",
      "2026-04-10",
    ]);
  });
});

describe("parseLogFiles — per-cluster detailByDay", () => {
  it("populates detailByDay on each top cluster with matching per-day totals", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(`08/Apr/2026:12:00:${String(i).padStart(2, "0")} +0000 /home Mozilla/5.0 200 0.100`);
    }
    for (let i = 0; i < 5; i++) {
      lines.push(`09/Apr/2026:12:00:${String(i).padStart(2, "0")} +0000 /home Mozilla/5.0 404 0.200`);
    }
    const file = makeLogFile("access.log", lines);

    const summary = await parseLogFiles([file], [], () => {});

    expect(summary.clusters.length).toBeGreaterThan(0);
    const home = summary.clusters[0];
    expect(home.detailByDay).toBeDefined();
    expect(home.detailByDay).toHaveLength(2);

    const apr8 = home.detailByDay!.find((d) => d.date === "2026-04-08")!;
    expect(apr8.count).toBe(10);
    expect(apr8.statuses).toEqual({ "200": 10 });
    expect(apr8.obsCount).toBe(10);
    expect(apr8.sum).toBeCloseTo(1.0, 5);
    expect(apr8.samples.length).toBe(10);

    const apr9 = home.detailByDay!.find((d) => d.date === "2026-04-09")!;
    expect(apr9.count).toBe(5);
    expect(apr9.statuses).toEqual({ "404": 5 });
  });

  it("keeps cluster-level totals in sync with the sum of detailByDay", async () => {
    const lines: string[] = [];
    for (const day of ["08", "09", "10"]) {
      for (let i = 0; i < 7; i++) {
        lines.push(`${day}/Apr/2026:12:00:${String(i).padStart(2, "0")} +0000 /api Mozilla/5.0 200 0.15`);
      }
    }
    const file = makeLogFile("access.log", lines);
    const summary = await parseLogFiles([file], [], () => {});

    const cluster = summary.clusters[0];
    const detailCountSum = cluster.detailByDay!.reduce((s, d) => s + d.count, 0);
    expect(detailCountSum).toBe(cluster.count);

    const detailStatusSum = cluster.detailByDay!.reduce(
      (s, d) => s + (d.statuses["200"] || 0),
      0,
    );
    expect(detailStatusSum).toBe(cluster.statuses["200"]);
  });
});
