import { createSignal } from "solid-js";
import type { WidgetSlotName } from "../types/module.types";
import { apiFetch } from "../lib/fetch";

/**
 * User-customised widget placement, keyed by module then slot:
 *   { version: 1, modules: { hq: { right: ["shared.notifications", "network.savedSearch"] } } }
 *
 * A slot entry is either a plain widget id (singleton widgets) or an instance
 * object for multiInstance widgets:
 *   { id: "cart.item_card", key: "cart.item_card#a1b2c3", config: { sku: "..." } }
 * `key` is unique within the slot; `config` is the per-instance settings blob
 * handed to the widget component as its `config` prop.
 *
 * Absence of a module/slot entry means "use the registry defaults".
 * An explicit empty array means "the user removed every widget here".
 *
 * Source of truth is pconfig (cat "spa", key "widget_layout"); localStorage
 * holds a copy so the sidebar doesn't flash defaults while pconfig loads.
 */
export interface WidgetInstance {
  id: string;
  key: string;
  config?: Record<string, unknown>;
  /** Width in 12ths of the slot's row, for the grid-laid-out slots
   * (header/contentTop/footer). Absent means full width. */
  span?: number;
}

export type LayoutEntry = string | WidgetInstance;

export interface WidgetLayout {
  version: 1;
  modules: Record<string, Partial<Record<WidgetSlotName, LayoutEntry[]>>>;
}

export function entryId(e: LayoutEntry): string {
  return typeof e === "string" ? e : e.id;
}

export function entryKey(e: LayoutEntry): string {
  return typeof e === "string" ? e : e.key;
}

export function entryConfig(e: LayoutEntry): Record<string, unknown> | undefined {
  return typeof e === "string" ? undefined : e.config;
}

export function entrySpan(e: LayoutEntry): number | undefined {
  return typeof e === "string" ? undefined : e.span;
}

/** Fresh unique key for a new instance of a multiInstance widget. */
export function makeInstanceKey(widgetId: string): string {
  return `${widgetId}#${Math.random().toString(36).slice(2, 8)}`;
}

const LS_KEY = "hz-widget-layout";
const SLOT_NAMES = new Set<string>(["right", "leftBottom", "rightVisitor", "header", "footer", "contentTop"]);

/** Retired slots mapped to the slot that replaced them. `gridTop` sat between
 * `header` and `contentTop` and auto-packed its widgets into masonry columns;
 * once widgets got their own widths it had nothing left that `contentTop`
 * couldn't do, so it folded into it. Layouts saved while it existed are
 * migrated on parse (see parseWidgetLayout) rather than dropped; the next save
 * retires the key. */
const RETIRED_SLOTS: Record<string, WidgetSlotName> = {
  gridTop: "contentTop",
};
/** Fold order, so a merged slot keeps its old top-to-bottom reading order. */
const SLOT_ORDER = ["header", "gridTop", "contentTop"];

function parseEntry(raw: unknown): LayoutEntry | null {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || typeof obj.key !== "string") return null;
  const entry: WidgetInstance = { id: obj.id, key: obj.key };
  if (obj.config && typeof obj.config === "object" && !Array.isArray(obj.config)) {
    entry.config = obj.config as Record<string, unknown>;
  }
  if (typeof obj.span === "number" && Number.isInteger(obj.span) && obj.span >= 1 && obj.span <= 12) {
    entry.span = obj.span;
  }
  return entry;
}

// Tolerant parser: unknown slots/shapes are dropped, never thrown on —
// stored layouts outlive code changes.
export function parseWidgetLayout(raw: unknown): WidgetLayout | null {
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) return null;

  const modules = obj.modules;
  // PHP json_encode turns an empty map into [] — treat as "no customisation"
  if (Array.isArray(modules)) return { version: 1, modules: {} };
  if (!modules || typeof modules !== "object") return null;

  const clean: WidgetLayout["modules"] = {};
  for (const [moduleId, slots] of Object.entries(modules)) {
    if (!slots || typeof slots !== "object" || Array.isArray(slots)) continue;
    const cleanSlots: Partial<Record<WidgetSlotName, LayoutEntry[]>> = {};
    const seenBySlot = new Map<string, Set<string>>();
    // Retired slots fold into their replacement rather than being dropped, so
    // a user keeps every widget they ever placed. Sorted by the regions' old
    // on-screen order, so the merge is deterministic and reads the same way it
    // used to, whatever order the keys happen to sit in the stored JSON.
    const slotEntries = Object.entries(slots as Record<string, unknown>).sort(
      ([a], [b]) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b),
    );
    for (const [slot, entries] of slotEntries) {
      const target = RETIRED_SLOTS[slot] ?? slot;
      if (!SLOT_NAMES.has(target) || !Array.isArray(entries)) continue;
      let seen = seenBySlot.get(target);
      if (!seen) seenBySlot.set(target, (seen = new Set<string>()));
      const cleanEntries: LayoutEntry[] = cleanSlots[target as WidgetSlotName] ?? [];
      for (const rawEntry of entries) {
        const entry = parseEntry(rawEntry);
        if (entry === null || seen.has(entryKey(entry))) continue;
        seen.add(entryKey(entry));
        cleanEntries.push(entry);
      }
      cleanSlots[target as WidgetSlotName] = cleanEntries;
    }
    if (Object.keys(cleanSlots).length) clean[moduleId] = cleanSlots;
  }
  return { version: 1, modules: clean };
}

function readCache(): WidgetLayout | null {
  try {
    return parseWidgetLayout(localStorage.getItem(LS_KEY));
  } catch {
    return null;
  }
}

function writeCache(layout: WidgetLayout | null): void {
  try {
    if (layout) localStorage.setItem(LS_KEY, JSON.stringify(layout));
    else localStorage.removeItem(LS_KEY);
  } catch {
    // storage full / private mode — cache is best-effort
  }
}

const [layout, setLayout] = createSignal<WidgetLayout | null>(readCache());

// UI state: whether the sidebar is in widget-edit mode (toggled from Layout's
// pencil button, consumed by Slot). Session-only, never persisted.
const [editingWidgets, setEditingWidgets] = createSignal(false);
export { editingWidgets, setEditingWidgets };

export function useWidgetLayout() {
  return layout;
}

// The user's list for a module+slot, or null when the defaults apply
export function layoutFor(moduleId: string, slot: WidgetSlotName): LayoutEntry[] | null {
  return layout()?.modules[moduleId]?.[slot] ?? null;
}

// ── Page-owner layout ─────────────────────────────────────────────────────────
// The visited channel owner's layout, so visitors see their pages arranged as
// the owner set them. Fed by useChannelTheme's per-channel prefs fetch; cleared
// (null) when leaving channel pages. Never persisted on this device.

const [pageLayout, setPageLayout] = createSignal<WidgetLayout | null>(null);

export function initPageWidgetLayout(raw: string | null | undefined): void {
  setPageLayout(raw ? parseWidgetLayout(raw) : null);
}

// The page owner's list for a module+slot, or null when the defaults apply
export function pageLayoutFor(moduleId: string, slot: WidgetSlotName): LayoutEntry[] | null {
  return pageLayout()?.modules[moduleId]?.[slot] ?? null;
}

// Called from auth-store with the pconfig value at boot — the server wins,
// including its absence (a reset on another device must clear this one's cache).
export function initWidgetLayout(raw: string | undefined): void {
  const parsed = raw !== undefined ? parseWidgetLayout(raw) : null;
  setLayout(parsed);
  writeCache(parsed);
}

// Optimistic save; pass null to reset every page to defaults.
// Returns false (and rolls back) when the server rejects the write.
export async function saveWidgetLayout(next: WidgetLayout | null): Promise<boolean> {
  const prev = layout();
  setLayout(next);
  writeCache(next);
  try {
    const res = await apiFetch("/spa/widget-layout", {
      method: "POST",
      body: JSON.stringify({ layout: next }),
    });
    if (!res.ok) throw new Error(`widget-layout save failed: ${res.status}`);
    return true;
  } catch {
    setLayout(prev);
    writeCache(prev);
    return false;
  }
}

// Replace one module+slot list (null removes the override so defaults apply again)
export function saveSlotLayout(
  moduleId: string,
  slot: WidgetSlotName,
  entries: LayoutEntry[] | null,
): Promise<boolean> {
  const current = layout() ?? { version: 1 as const, modules: {} };
  const moduleSlots = { ...current.modules[moduleId] };
  if (entries === null) delete moduleSlots[slot];
  else moduleSlots[slot] = entries;

  const modules = { ...current.modules };
  if (Object.keys(moduleSlots).length) modules[moduleId] = moduleSlots;
  else delete modules[moduleId];

  const next: WidgetLayout | null = Object.keys(modules).length
    ? { version: 1, modules }
    : null;
  return saveWidgetLayout(next);
}
