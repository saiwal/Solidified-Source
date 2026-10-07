// shared/lib/createQueryResource.ts
//
// Drop-in replacement for Solid's createResource, backed by TanStack Query.
//
//   const [data] = createQueryResource("pubsites", fetchPubsites);
//   const [data] = createQueryResource("albums", () => props.nick, fetchAlbums);
//
// Same tuple shape as createResource — accessor with .loading/.error/.latest,
// plus { refetch, mutate } — but responses are cached under ["<name>", source]:
// remounts render instantly from cache, identical concurrent requests are
// deduped, and stale data revalidates in the background.
//
// Mirrored createResource semantics:
// - source of null/undefined/false → no fetch (query disabled)
// - previous data stays visible while a new source's data loads
// - `loading` is true only for the initial load / source change, NOT for
//   background revalidation (that's the point of the cache)
//
// Only usable inside a component tree (needs QueryClientProvider context).
// Module-level stores must keep using createResource.

import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/solid-query";

export type QueryResource<T> = {
  (): T | undefined;
  readonly loading: boolean;
  readonly error: Error | undefined;
  readonly latest: T | undefined;
};

export type QueryResourceActions<T> = {
  refetch: () => void;
  mutate: (value: T | undefined | ((prev: T | undefined) => T | undefined)) => void;
};

type InitOpts<T> = {
  initialValue?: T;
  /** false for data the view grows in place (paged-in comments, local
   *  replies) — a focus/reconnect refetch would replace it with page one. */
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
};

export function createQueryResource<T>(
  name: string,
  fetcher: () => Promise<T>,
  options?: InitOpts<T>,
): [QueryResource<T>, QueryResourceActions<T>];
export function createQueryResource<T, S>(
  name: string,
  source: () => S | null | undefined | false,
  fetcher: (src: S) => Promise<T>,
  options?: InitOpts<T>,
): [QueryResource<T>, QueryResourceActions<T>];
export function createQueryResource<T, S>(
  name: string,
  arg2: (() => Promise<T>) | (() => S | null | undefined | false),
  arg3?: ((src: S) => Promise<T>) | InitOpts<T>,
  arg4?: InitOpts<T>,
): [QueryResource<T>, QueryResourceActions<T>] {
  const hasSource = typeof arg3 === "function";
  const source = hasSource ? (arg2 as () => S | null | undefined | false) : undefined;
  const fetcher = hasSource ? (arg3 as (src: S) => Promise<T>) : (arg2 as () => Promise<T>);
  const options = (hasSource ? arg4 : (arg3 as InitOpts<T> | undefined)) ?? {};

  const queryClient = useQueryClient();

  const currentKey = () =>
    source ? ([name, source()] as const) : ([name] as const);

  const query = useQuery(() => {
    const src = source ? source() : undefined;
    const enabled = source ? !(src == null || src === false) : true;
    return {
      queryKey: source ? [name, src] : [name],
      queryFn: () => (source ? fetcher(src as S) : (fetcher as () => Promise<T>)()),
      enabled,
      // Only when set — an explicit undefined would override the client defaults.
      ...(options.refetchOnWindowFocus !== undefined && { refetchOnWindowFocus: options.refetchOnWindowFocus }),
      ...(options.refetchOnReconnect !== undefined && { refetchOnReconnect: options.refetchOnReconnect }),
      // Cast: TanStack's NonFunctionGuard<T> rejects generic T even though
      // the runtime shape is exactly what placeholderData expects.
      placeholderData: (options.initialValue !== undefined
        ? (prev: T | undefined) => prev ?? options.initialValue
        : keepPreviousData) as typeof keepPreviousData,
    };
  });

  const accessor = (() => query.data) as QueryResource<T>;
  Object.defineProperties(accessor, {
    loading: { get: () => query.isLoading || query.isPlaceholderData },
    error: { get: () => query.error ?? undefined },
    latest: { get: () => query.data },
  });

  return [
    accessor,
    {
      refetch: () => query.refetch(),
      mutate: (value) => queryClient.setQueryData(currentKey(), value),
    },
  ];
}
