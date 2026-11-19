// Solid-2-native twin of createQueryResource: same call shape, same cache
// keys (["<name>", source]), but data() is an async read. Render it inside
// <AsyncBoundary> (Loading + Errored): the first load shows the fallback, an
// error shows a retry, and a later source change keeps the old content on
// screen until the new data lands (dim it with pending()).
//
//   const [data, { refetch }] = createAsyncResource("admin-queue", fetchAdminQueue);
//   const [albums] = createAsyncResource("albums", () => props.nick, fetchAlbums);
//
// A null/undefined/false source means "nothing to fetch": data() is then
// undefined and never suspends. (A disabled native query would stay pending
// forever, which hides its boundary and holds router navigations.)
//
// Don't read data() in effects, event handlers or form seeding — it throws
// while pending. Those sites stay on createQueryResource.

import { isPending } from "solid-js";
import { useAsyncQuery, useQueryClient } from "./query";
import { invalidate } from "./query-client";

type Opts = {
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  staleTime?: number;
};

export type AsyncResourceActions = {
  /** Refetch; resolves once the new data has landed. */
  refetch: () => Promise<void>;
  /** A refetch / source change is in flight while old data is shown. */
  pending: () => boolean;
};

export type AsyncResourceActionsOf<T> = AsyncResourceActions & {
  /** The cached value without suspending (undefined until it lands) — for
   *  the odd read outside a boundary, like a widget's footer. */
  peek: () => T | undefined;
};

export function createAsyncResource<T>(
  name: string,
  fetcher: () => Promise<T>,
  options?: Opts,
): [() => T, AsyncResourceActionsOf<T>];
export function createAsyncResource<T, S>(
  name: string,
  source: () => S | null | undefined | false,
  fetcher: (src: S) => Promise<T>,
  options?: Opts,
): [() => T | undefined, AsyncResourceActionsOf<T>];
export function createAsyncResource<T, S>(
  name: string,
  arg2: (() => Promise<T>) | (() => S | null | undefined | false),
  arg3?: ((src: S) => Promise<T>) | Opts,
  arg4?: Opts,
): [() => T | undefined, AsyncResourceActionsOf<T>] {
  const hasSource = typeof arg3 === "function";
  const source = hasSource ? (arg2 as () => S | null | undefined | false) : () => true as S;
  const fetcher = hasSource ? (arg3 as (src: S) => Promise<T>) : (arg2 as () => Promise<T>);
  const options = (hasSource ? arg4 : (arg3 as Opts | undefined)) ?? {};
  const off = () => { const s = source(); return s == null || s === false; };
  const key = () => (hasSource ? [name, source()] : [name]);

  const q = useAsyncQuery(() => ({
    queryKey: key(),
    // From the key, not source(): queryFn runs inside the query's effect,
    // where a source() read would be an untracked read.
    queryFn: ({ queryKey }) => fetcher(queryKey[1] as S),
    enabled: !off(),
    ...(options.refetchOnWindowFocus !== undefined && { refetchOnWindowFocus: options.refetchOnWindowFocus }),
    ...(options.refetchOnReconnect !== undefined && { refetchOnReconnect: options.refetchOnReconnect }),
    ...(options.staleTime !== undefined && { staleTime: options.staleTime }),
  }));

  const client = useQueryClient();
  const data = () => (off() ? undefined : (q.data as T));
  const peek = () => {
    void q.dataUpdatedAt; // re-read when a fetch lands
    return off() ? undefined : client.getQueryData<T>(key());
  };
  return [data, { refetch: () => invalidate(key()), pending: () => isPending(data), peek }];
}
