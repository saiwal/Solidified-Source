// shared/lib/query-client.ts
//
// Singleton TanStack Query client shared by the whole app.
// Exported separately from App.tsx so stores can invalidate/refetch queries
// without needing a component context (e.g. refetchNavData in nav-store).

import { unwrap } from "solid-js/store";
import { QueryClient, replaceEqualDeep } from "./query.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data younger than this is served from cache without a network request.
      staleTime: 60_000,
      // Unused cache entries are garbage-collected after 30 minutes.
      gcTime: 30 * 60_000,
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // solid-query forces structuralSharing off and, with no `reconcile`,
      // swaps in a brand-new data tree on every refetch — so a focus refetch
      // after 60s made every <For> remount its rows (avatars reloading,
      // widgets "flashing") even when nothing changed. This restores
      // query-core's sharing: unchanged subtrees keep their identity.
      reconcile: (prev: unknown, next: unknown) => replaceEqualDeep(unwrap(prev), next),
      // Default "online" never calls the fetcher while the browser reports
      // offline, so a query mounted offline sat in "pending" forever instead
      // of reaching the SW cache / offline-fallback.ts. This runs it once and
      // only pauses the retries.
      networkMode: "offlineFirst",
    },
  },
});
