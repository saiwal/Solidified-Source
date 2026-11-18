// A signal whose reads see a write immediately (Solid 1 behaviour) while
// still tracking like any signal.
//
// Solid 2 batches writes: `setX(v); x()` returns the old value until the
// next flush. That's right for UI state, but imperative state machines here
// (the jellyfin player queue, page stores that set a nick then fetch, paging
// cursors) write and read back in one step, and threading every new value
// through by hand would mean rewriting them. Use this for that kind of
// imperatively driven state only; UI state stays on createSignal.
import { createSignal } from "solid-js";

export function createSyncSignal<T>(init: T): [get: () => T, set: (v: T | ((prev: T) => T)) => T] {
  let cur = init;
  const [version, bump] = createSignal(0);
  const get = () => (version(), cur);
  const set = (v: T | ((prev: T) => T)) => {
    const next = typeof v === "function" ? (v as (prev: T) => T)(cur) : v;
    if (!Object.is(next, cur)) {
      cur = next;
      bump((n) => n + 1);
    }
    return cur;
  };
  return [get, set];
}
