// @tanstack/solid-query, with v5-style `data` reads that never suspend.
//
// In solid-query 6 `query.data` is a suspending async read: the first fetch
// suspends the nearest <Loading>, a disabled query suspends forever, an
// error throws. The app was written against v5 — `data` is undefined until
// it arrives, views gate on isLoading/isPending/error, and a disabled query
// (createQueryResource with a null source) simply has no data. Under v6 that
// would blank whole pages behind Layout's <Loading>, and a focused editor
// inside one would lose focus on every refetch (the v5-era bug this file
// was first written for).
//
// So `data` here never touches v6's async data node at all: it is read from
// the query cache, re-read whenever the query's (non-suspending) status
// fields change. Touching the data node — even through latest() in an
// effect — gave every mounted query an async flight that a navigation would
// wait on; a same-module hop (article → list) then changed the URL but never
// the screen. While a new key loads, placeholderData (keepPreviousData /
// an initial value) is applied the way TanStack does. Errors stay on
// `.error`, as in v5.
//
// Import from here, never "@tanstack/solid-query" directly.
import {
  useQuery as rawUseQuery,
  useInfiniteQuery as rawUseInfiniteQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/solid-query";
import { createMemo } from "solid-js";

export * from "@tanstack/solid-query";

type Opts = { queryKey: readonly unknown[]; placeholderData?: unknown };

function unsuspended<T extends object>(query: T, opts: () => Opts, client: QueryClient): T {
  const meta = query as unknown as { status: string; fetchStatus: string; dataUpdatedAt: number; isPlaceholderData: boolean };
  let last: unknown;
  const data = createMemo(() => {
    void meta.dataUpdatedAt; // re-read when a fetch lands or setQueryData writes
    void meta.status;
    const o = opts();
    const v = client.getQueryData(o.queryKey);
    if (v !== undefined) return (last = v);
    if (!meta.isPlaceholderData) return undefined;
    const ph = o.placeholderData;
    return typeof ph === "function" ? (ph as (prev: unknown) => unknown)(last) : ph;
  });
  // v6 derives isFetching (and isLoading/isRefetching from it) with Solid's
  // isPending() on the data node — a disabled query's node never settles, so
  // reading `.isLoading` there held the reader's render forever (the Ctrl+K
  // palette never opened). Plain status fields give the v5 answers.
  const fetching = () => meta.fetchStatus === "fetching";
  const pending = () => meta.status === "pending";
  return new Proxy(query, {
    get: (t, k) => {
      if (k === "data") return data();
      if (k === "isFetching") return fetching();
      if (k === "isLoading") return pending() && fetching();
      if (k === "isRefetching") return fetching() && !pending();
      return Reflect.get(t, k);
    },
  });
}

/**
 * The native solid-query 6 hook, for code written Solid-2-style: `data` is an
 * async read — render it inside a <Loading> (AsyncBoundary), use isPending()
 * for refetches, and pair writes with action()/createOptimistic. Modules
 * move to this one at a time; the wrapped `useQuery` below keeps v5 reads for
 * the rest.
 */
export const useAsyncQuery = rawUseQuery;
export const useAsyncInfiniteQuery = rawUseInfiniteQuery;

// Casts: TS can't forward an overloaded signature through a wrapper.
function wrap<F extends (...a: any[]) => object>(raw: F): F {
  return ((opts: () => Opts, client?: () => QueryClient) => {
    const c = client?.() ?? useQueryClient();
    return unsuspended(raw(opts, client), opts, c);
  }) as unknown as F;
}
export const useQuery = wrap(rawUseQuery);
export const useInfiniteQuery = wrap(rawUseInfiniteQuery);
