// @tanstack/solid-query, with `data` reads that can never trip a <Suspense>.
//
// solid-query backs every query with a hidden createResource and calls its
// refetch() on *every* observer update — the staleTime timer expiring, a
// refetchInterval tick, window focus — even when the data hasn't changed.
// That leaves the resource pending for a microtask, and a `.data` read made
// under a <Suspense> (Layout's, or an isolate() boundary) registers a watcher
// that flips the boundary to its fallback each time: the subtree is detached
// and re-attached, so a focused editor loses focus mid-sentence (the reply
// composer every 60s, Messenger every poll). Still the case in 5.104.
//
// The fix: read `data` in a memo built with no owner, so Solid finds no
// SuspenseContext and never registers the watcher; reactivity is unchanged.
// Views already gate on isLoading/isPending, which is all the boundaries'
// (fallback-less) suspension ever amounted to.
//
// Import from here, never "@tanstack/solid-query" directly.
import {
  useQuery as rawUseQuery,
  useInfiniteQuery as rawUseInfiniteQuery,
} from "@tanstack/solid-query";
import { createMemo, createRoot, onCleanup, runWithOwner } from "solid-js";

export * from "@tanstack/solid-query";

function unsuspended<T extends object>(query: T): T {
  let dispose!: () => void;
  const data = runWithOwner(null, () =>
    createRoot((d) => {
      dispose = d;
      return createMemo(() => (query as { data: unknown }).data);
    }),
  )!;
  onCleanup(dispose);
  return new Proxy(query, { get: (t, k) => (k === "data" ? data() : Reflect.get(t, k)) });
}

// Casts: TS can't forward an overloaded signature through a wrapper.
export const useQuery = ((...args: Parameters<typeof rawUseQuery>) =>
  unsuspended(rawUseQuery(...args))) as typeof rawUseQuery;
export const useInfiniteQuery = ((...args: Parameters<typeof rawUseInfiniteQuery>) =>
  unsuspended(rawUseInfiniteQuery(...args))) as typeof rawUseInfiniteQuery;
