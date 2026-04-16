import { describe, it, expect } from "vitest";
import { filterByDateRange } from "@/lib/date-range-filter";

const items = [
  { date: "2026-04-01", count: 1 },
  { date: "2026-04-05", count: 2 },
  { date: "2026-04-10", count: 3 },
  { date: "2026-04-15", count: 4 },
];

describe("filterByDateRange", () => {
  it("returns all items when both bounds are null", () => {
    expect(filterByDateRange(items, "date", null, null)).toEqual(items);
  });

  it("filters by from bound (inclusive)", () => {
    expect(filterByDateRange(items, "date", "2026-04-05", null).map((i) => i.count)).toEqual([2, 3, 4]);
  });

  it("filters by to bound (inclusive)", () => {
    expect(filterByDateRange(items, "date", null, "2026-04-10").map((i) => i.count)).toEqual([1, 2, 3]);
  });

  it("filters by both bounds inclusively", () => {
    expect(filterByDateRange(items, "date", "2026-04-05", "2026-04-10").map((i) => i.count)).toEqual([2, 3]);
  });

  it("returns empty when range excludes all items", () => {
    expect(filterByDateRange(items, "date", "2027-01-01", "2027-12-31")).toEqual([]);
  });

  it("keeps items whose date field is missing (does not drop them)", () => {
    // defensive fallback for rows without a date — should remain
    const mixed = [...items, { date: "", count: 99 }];
    const out = filterByDateRange(mixed, "date", "2026-04-05", "2026-04-10");
    expect(out.some((i) => i.count === 99)).toBe(true);
  });

  it("works on any key name, not just 'date'", () => {
    const rows = [
      { day: "2026-04-01", v: "a" },
      { day: "2026-04-10", v: "b" },
    ];
    expect(filterByDateRange(rows, "day", "2026-04-05", null)).toEqual([{ day: "2026-04-10", v: "b" }]);
  });
});
