// packages/spa-core/src/lib/persisted.ts
//
// A signal mirrored into localStorage — the shape every browser-only user
// preference in the SPA had hand-rolled (comment order, thread mode, scroll
// style, view toggles…). One key per preference, on purpose: localStorage is
// synchronous so there is no boot fetch to save by packing them into one blob,
// and separate keys can't clobber each other when two tabs write different
// preferences.
//
// Not for pconfig caches (nav-order.ts, disabled-frontend-modules.ts) — those
// mirror a server value and the server has to win at boot.

import { createSignal, type Accessor } from "solid-js";

/**
 * Reads `key` once at module load and writes it back on every set.
 * Values are stored as strings; pass `parse` for anything that isn't one
 * (returning `undefined` rejects a stored value and falls back), and `format`
 * when the round trip isn't `String(v)`.
 *
 * Storage access is wrapped: Safari private mode throws on both read and
 * write, and a preference is never worth taking the app down for.
 */
export function persistedSignal<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | undefined = (raw) => raw as T,
  format: (value: T) => string = String,
): [Accessor<T>, (value: T) => void] {
  let initial = fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) initial = parse(raw) ?? fallback;
  } catch {
    // storage blocked — fall back
  }

  const [value, setValue] = createSignal<T>(initial);

  return [
    value,
    (next: T) => {
      setValue(() => next);
      try {
        localStorage.setItem(key, format(next));
      } catch {
        // best-effort
      }
    },
  ];
}

/** `parse` for a string union — anything not listed falls back. */
export const oneOf =
  <T extends string>(...allowed: T[]) =>
  (raw: string): T | undefined =>
    (allowed as string[]).includes(raw) ? (raw as T) : undefined;

/** `parse`/`format` pair for a boolean stored as "1"/"0". */
export const boolFlag = {
  parse: (raw: string): boolean | undefined =>
    raw === "1" ? true : raw === "0" ? false : undefined,
  format: (value: boolean): string => (value ? "1" : "0"),
};
