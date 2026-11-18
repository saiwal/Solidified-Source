// shared/lib/query-client.ts
//
// Singleton TanStack Query client shared by the whole app.
// Exported separately from App.tsx so stores can invalidate/refetch queries
// without needing a component context (e.g. refetchNavData in nav-store).

import { QueryClient } from "./query.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data younger than this is served from cache without a network request.
      staleTime: 60_000,
      // Unused cache entries are garbage-collected after 5 minutes — kept short
      // for low-RAM devices; offline-fallback.ts (IndexedDB) still covers back-nav.
      gcTime: 5 * 60_000,
      // A redirect answer (fetchDisplayItem) is final, not a failure to retry.
      retry: (failures, err) => !(err as { redirect?: string }).redirect && failures < 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // (solid-query 5 needed a `reconcile` here to keep unchanged subtrees
      // identity across refetches; 6 uses query-core's structural sharing again.)
      // Default "online" never calls the fetcher while the browser reports
      // offline, so a query mounted offline sat in "pending" forever instead
      // of reaching the SW cache / offline-fallback.ts. This runs it once and
      // only pauses the retries.
      networkMode: "offlineFirst",
    },
  },
});

/** Refetch everything under `key` and resolve once it has landed — what an
 *  action() yields after its write, so the optimistic value hands over to
 *  fresh server data instead of flickering back to the old one. */
export const invalidate = (key: readonly unknown[]) =>
  queryClient.invalidateQueries({ queryKey: key });
