/**
 * Supabase PostgREST caps every response at 1000 rows regardless of .range().
 * Any query that can legitimately return more than 1000 rows (cluster_daily,
 * bot_daily, cluster_user_agents over many clusters, etc.) must paginate —
 * otherwise PostgREST silently truncates and the caller gets a subset that
 * looks valid but is biased toward whatever .order() put first.
 *
 * The most insidious variant: .order("day") + truncation at 1000 rows means
 * the earliest days are returned and the most recent are dropped. A "last 7
 * days" filter then finds nothing and the UI shows an empty state even though
 * the data exists. See the URL Clusters page regression on 2026-04-16.
 */

export const SUPABASE_MAX_ROWS = 1000;

type PagedBuilder<T> = (
  from: number,
  to: number,
) => PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Repeatedly invokes the query builder with incrementing 1000-row windows
 * until a short page (or an empty page) signals the end. The caller passes
 * a closure that returns the Supabase query with `.range(from, to)` applied;
 * everything else (filters, ordering, joins) is baked into that closure.
 *
 * Pure — accepts any Promise-compatible builder — so this module has no
 * runtime dependency on the Supabase SDK and is unit-testable with a fake
 * page source.
 */
export async function fetchAllPaged<T>(build: PagedBuilder<T>): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += SUPABASE_MAX_ROWS) {
    const { data } = await build(offset, offset + SUPABASE_MAX_ROWS - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < SUPABASE_MAX_ROWS) break;
  }
  return all;
}
