// The slice of Solid 1's createResource the app still uses — .loading/.error/
// .latest/.state, refetch, mutate — on plain signals. Solid 2 removed it in
// favour of async memos read under <Loading>; these call sites (module-level
// stores, editor seeds, imperative loading/error UIs) never relied on
// suspending, so a signal port keeps them as they were.
//
// Differences from 1.x: reading never suspends a <Loading>; a source change
// keeps the previous value visible (state "refreshing") until the new one lands.
import { createEffect, createRoot, createSignal, getOwner, untrack, type Accessor } from "solid-js";

export type ResourceState = "unresolved" | "pending" | "ready" | "refreshing" | "errored";
export type Resource<T> = Accessor<T | undefined> & {
  readonly loading: boolean;
  readonly error: any;
  readonly latest: T | undefined;
  readonly state: ResourceState;
};
export type ResourceActions<T> = {
  mutate: (v: T | undefined | ((prev: T | undefined) => T | undefined)) => void;
  refetch: () => Promise<T | undefined>;
};
type Opts<T> = { initialValue?: T };
type Source<S> = () => S | false | null | undefined;

export function createResource<T>(fetcher: () => T | Promise<T>, opts?: Opts<T>): [Resource<T>, ResourceActions<T>];
export function createResource<T, S>(source: Source<S>, fetcher: (s: S) => T | Promise<T>, opts?: Opts<T>): [Resource<T>, ResourceActions<T>];
export function createResource<T, S>(
  a: Source<S> | (() => T | Promise<T>),
  b?: ((s: S) => T | Promise<T>) | Opts<T>,
  c?: Opts<T>,
): [Resource<T>, ResourceActions<T>] {
  const hasSource = typeof b === "function";
  const source: Source<S> = hasSource ? (a as Source<S>) : () => true as S;
  const fetcher = (hasSource ? b : a) as (s: S) => T | Promise<T>;
  const opts = (hasSource ? c : (b as Opts<T> | undefined)) ?? {};

  const start = untrack(source);
  const live = (s: S | false | null | undefined): s is S => s !== false && s != null;
  const [value, setValue] = createSignal<T | undefined>(opts.initialValue as Exclude<T, Function> | undefined);
  const [error, setError] = createSignal<unknown>(undefined);
  const [state, setState] = createSignal<ResourceState>(
    live(start) ? (opts.initialValue !== undefined ? "refreshing" : "pending") : opts.initialValue !== undefined ? "ready" : "unresolved",
  );

  let req = 0;
  function run(s: S): Promise<T | undefined> {
    const id = ++req;
    return Promise.resolve()
      .then(() => fetcher(s))
      .then(
        (v) => {
          if (id === req) { setValue(() => v); setError(undefined); setState("ready"); }
          return v;
        },
        (e) => {
          if (id === req) { setError(e); setState("errored"); }
          return undefined;
        },
      );
  }

  const track = () =>
    createEffect(source, (s) => {
      if (!live(s)) return;
      setState(value() === undefined ? "pending" : "refreshing");
      void run(s);
    }, { defer: true });
  // Module-level stores have no owner; give their effect a permanent root.
  if (getOwner()) track(); else createRoot(track);
  if (live(start)) void run(start);

  const read = (() => value()) as Resource<T>;
  Object.defineProperties(read, {
    loading: { get: () => state() === "pending" || state() === "refreshing" },
    error: { get: () => error() },
    latest: { get: () => value() },
    state: { get: () => state() },
  });
  return [
    read,
    {
      mutate: (v) => setValue(typeof v === "function" ? (v as (p: T | undefined) => T | undefined) : () => v),
      refetch: () => {
        const s = untrack(source);
        if (!live(s)) return Promise.resolve(undefined);
        setState(untrack(value) === undefined ? "pending" : "refreshing");
        return run(s);
      },
    },
  ];
}
