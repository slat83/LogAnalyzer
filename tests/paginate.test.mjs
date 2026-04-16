// Node built-in test runner — no vitest dep needed in this worktree.
// Run with:  node --test tests/paginate.test.mjs
//
// These tests guard the pagination invariant that backs lib/paginate.ts.
// Before this helper existed, app/api/projects/[id]/summary/route.ts called
// cluster_daily with a single .range(0, 19999). Supabase PostgREST silently
// capped every response at 1000 rows, so for 200 clusters × 12 days the
// earliest 5 days came back and days 6–12 were invisible. The Clusters page
// then showed "0 of 200" whenever the user filtered to the last 7 days.
//
// The algorithm below is the exact one in lib/paginate.ts, re-expressed here
// so the test is independent of TypeScript tooling. If you change one, change
// the other.

import { test } from "node:test";
import { strict as assert } from "node:assert";

const SUPABASE_MAX_ROWS = 1000;

async function fetchAllPaged(build) {
  const all = [];
  for (let offset = 0; ; offset += SUPABASE_MAX_ROWS) {
    const { data } = await build(offset, offset + SUPABASE_MAX_ROWS - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < SUPABASE_MAX_ROWS) break;
  }
  return all;
}

/** Simulates Supabase: hard cap 1000 rows, ordered by `day` ascending. */
function makeFakeSupabaseSource(allRows) {
  let pageCalls = 0;
  const sorted = [...allRows].sort((a, b) => a.day.localeCompare(b.day));
  async function build(from, to) {
    pageCalls++;
    const windowEnd = Math.min(to, from + SUPABASE_MAX_ROWS - 1);
    const slice = sorted.slice(from, windowEnd + 1);
    return { data: slice, error: null };
  }
  return { build, calls: () => pageCalls };
}

test("fetchAllPaged returns every row when total exceeds 1000", async () => {
  // 200 clusters × 12 days = 2400 rows, the exact shape that broke prod
  const rows = [];
  for (let d = 4; d <= 15; d++) {
    const day = `2026-04-${String(d).padStart(2, "0")}`;
    for (let c = 0; c < 200; c++) {
      rows.push({ cluster_id: `c${c}`, day, request_count: 100 });
    }
  }
  const src = makeFakeSupabaseSource(rows);
  const result = await fetchAllPaged(src.build);

  assert.equal(result.length, 2400, "must fetch all 2400 rows, not the first 1000");

  const uniqueDays = new Set(result.map((r) => r.day));
  assert.equal(uniqueDays.size, 12, "all 12 days must survive — none dropped by cap");

  // The regression: without pagination, days 04-09..04-15 (the last 7) would
  // be missing, and the "last 7 days" filter would render an empty table.
  for (let d = 9; d <= 15; d++) {
    const day = `2026-04-${String(d).padStart(2, "0")}`;
    assert.ok(
      result.some((r) => r.day === day),
      `day ${day} must be in the result — otherwise the Clusters page 7d filter blanks`,
    );
  }

  assert.equal(src.calls(), 3, "2400 rows should require 3 pages (1000+1000+400)");
});

test("fetchAllPaged stops on a short page without a wasted round-trip", async () => {
  const rows = [];
  for (let i = 0; i < 1500; i++) rows.push({ id: i, day: "2026-04-10", request_count: 1 });
  const src = makeFakeSupabaseSource(rows);
  const result = await fetchAllPaged(src.build);

  assert.equal(result.length, 1500);
  assert.equal(src.calls(), 2, "1500 rows = full page + short page; no third call");
});

test("fetchAllPaged handles the common small case in one page", async () => {
  const rows = Array.from({ length: 42 }, (_, i) => ({ id: i, day: "2026-04-10" }));
  const src = makeFakeSupabaseSource(rows);
  const result = await fetchAllPaged(src.build);

  assert.equal(result.length, 42);
  assert.equal(src.calls(), 1, "small result must not trigger a second fetch");
});

test("fetchAllPaged exits cleanly when the table is empty", async () => {
  const src = makeFakeSupabaseSource([]);
  const result = await fetchAllPaged(src.build);

  assert.deepEqual(result, []);
  assert.equal(src.calls(), 1, "empty result is learned in a single page");
});

test("fetchAllPaged handles null data from Supabase without throwing", async () => {
  let calls = 0;
  const result = await fetchAllPaged(async () => {
    calls++;
    return { data: null, error: null };
  });

  assert.deepEqual(result, []);
  assert.equal(calls, 1);
});

test("fetchAllPaged passes through exactly 1000-row windows", async () => {
  // Edge case: exactly one full page. Must make a second call to learn
  // whether more rows exist, but the second call returns empty and we stop.
  const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i, day: "2026-04-10" }));
  const src = makeFakeSupabaseSource(rows);
  const result = await fetchAllPaged(src.build);

  assert.equal(result.length, 1000);
  assert.equal(src.calls(), 2, "full page requires a follow-up to confirm no more rows");
});
