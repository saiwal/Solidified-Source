// Pure sort-order data — no Solid/icon imports, so the stream store and a
// node-run self-check can both import it.

export type SortOrder =
  | "created" | "commented" | "unthreaded"
  | "top" | "hot" | "discussed" | "controversial";

export type SortRange = "day" | "week" | "month" | "year" | "all";

// Orders that don't put the newest post first — the created-based new-post
// poll in createStreamStore is meaningless under these.
export const RANKED_ORDERS: readonly string[] = ["top", "hot", "discussed", "controversial"];

// Orders that rank by an accumulated count, so "over what period" is a real
// question. `hot` is excluded on purpose — its time decay is the ranking.
export const RANGE_AWARE: SortOrder[] = ["top", "discussed", "controversial"];

export const RANGES: { id: SortRange; key: string; days: number }[] = [
  { id: "day",   key: "range_day",   days: 1   },
  { id: "week",  key: "range_week",  days: 7   },
  { id: "month", key: "range_month", days: 30  },
  { id: "year",  key: "range_year",  days: 365 },
  { id: "all",   key: "range_all",   days: 0   },
];

// What a range-aware order means with no explicit range. Kept narrow on
// purpose: an unbounded count sort returns the same all-time winners on every
// visit, and it's the most expensive query the stream can run.
export const DEFAULT_RANGE: SortRange = "day";

// The range actually in force. Absent means DEFAULT_RANGE, not "all" — so
// "all" has to be written to the URL explicitly to be reachable.
export function resolveRange(order: SortOrder, range?: SortRange): SortRange | undefined {
  if (!RANGE_AWARE.includes(order)) return undefined;
  return range ?? DEFAULT_RANGE;
}

// `range` lives in the URL; the API only ever sees the dbegin it maps to.
export function rangeToDbegin(range?: SortRange, now = Date.now()): string | undefined {
  const days = RANGES.find((r) => r.id === range)?.days ?? 0;
  if (!days) return undefined;
  return new Date(now - days * 86400_000).toISOString().slice(0, 10);
}
