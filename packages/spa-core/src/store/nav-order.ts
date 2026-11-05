// shared/store/nav-order.ts
//
// Persists the user's preferred nav item order (keyed by NavItemDef.path) to
// pconfig (cat "spa", key "nav_order"), with a localStorage cache so the nav
// doesn't flash the default order before pconfig loads. Set by dragging items
// directly in the live nav (Layout.tsx) — there is no settings-page UI for this.

import { createSignal } from "solid-js";
import type { NavItemDef } from "../types/module.types";
import { apiFetch } from "../lib/fetch";

const STORAGE_KEY = "hz-nav-order";

function parseOrder(raw: unknown): string[] {
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

function readCache(): string[] {
  try {
    return parseOrder(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeCache(order: string[]): void {
  try {
    if (order.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage full / private mode — cache is best-effort
  }
}

const [navOrder, setNavOrderSignal] = createSignal<string[]>(readCache());
export { navOrder };

// Called from auth-store with the pconfig value at boot — the server wins,
// including its absence (a reset on another device must clear this cache too).
export function initNavOrder(raw: string | undefined): void {
  const parsed = raw !== undefined ? parseOrder(raw) : [];
  setNavOrderSignal(parsed);
  writeCache(parsed);
}

function persist(order: string[]): void {
  setNavOrderSignal(order);
  writeCache(order);
  apiFetch("/spa/settings/integrations", {
    method: "POST",
    body: JSON.stringify({ action: "reorder", order }),
  }).catch(() => {});
}

// Sort items by stored order; items not in the list keep their relative
// order, appended after any explicitly ordered ones.
export function applyNavItemOrder(items: NavItemDef[]): NavItemDef[] {
  const order = navOrder();
  if (order.length === 0) return items;
  const idx = new Map(order.map((path, i) => [path, i]));
  // Items the saved order has never seen (a newly enabled app or module) keep
  // their natural, alphabetical slot instead of all piling up at the end.
  const out = items.filter((i) => idx.has(i.path)).sort((a, b) => idx.get(a.path)! - idx.get(b.path)!);
  items.forEach((item, i) => {
    if (!idx.has(item.path)) out.splice(Math.min(i, out.length), 0, item);
  });
  return out;
}

// Commit a new order for a *subset* of the nav (e.g. just the mobile bottom
// tab bar, or just the "more" drawer overflow, or the full desktop list).
// Items outside the subset keep their absolute position; the subset's
// relative order is replaced with `subsetPathsInOrder`.
export function commitNavOrder(fullOrderedItems: NavItemDef[], subsetPathsInOrder: string[]): void {
  const subset = new Set(subsetPathsInOrder);
  let i = 0;
  const next = fullOrderedItems.map((item) =>
    subset.has(item.path) ? subsetPathsInOrder[i++] : item.path,
  );
  persist(next);
}
