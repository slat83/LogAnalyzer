/**
 * Date-range filter utility.
 *
 * Kept in a plain .ts module (separate from date-range-context.tsx) so tests and
 * other .ts-only consumers can import it without pulling in the React provider
 * and its JSX, which Vitest won't transform under Next's jsx:"preserve" tsconfig.
 */

/** Filter an array of items by date range. Items must have a string date field. */
export function filterByDateRange<T>(
  items: T[],
  dateKey: keyof T,
  from: string | null,
  to: string | null,
): T[] {
  if (!from && !to) return items;
  return items.filter((item) => {
    const d = String(item[dateKey] || "");
    if (!d) return true;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}
