import { createSignal } from "solid-js";
import type { WidgetSlotName } from "../types/module.types";
import { apiFetch } from "../lib/fetch";
import { type LayoutEntry, entryKey, parseWidgetLayout } from "./widget-layout";

/**
 * Reusable, named widget arrangements a module's items can be assigned to
 * instead of getting their own one-off per-item override — storage grows
 * with the number of distinct templates an owner maintains, not with the
 * number of items using them (e.g. webpages). Mirrors classic Hubzilla's
 * PDL layout_mid: an item points at 0 or 1 named layout.
 *
 *   { version: 1, templates: { "tpl_xxxxxx": { name: "...", slots: { right: [entries] } } } }
 *
 * A template's `slots` shape and entry rules are identical to one module
 * entry of widget_layout's `modules` map (see widget-layout.ts).
 *
 * Source of truth is pconfig (cat "spa", key "widget_templates"), delivered
 * to the SPA at boot via GET /spa/pconfig (own templates) and to visitors via
 * GET /spa/pconfig?channel=<nick> (the visited owner's templates, so a page
 * assigned to one renders the same widgets for everybody).
 */
export interface WidgetTemplate {
  name: string;
  slots: Partial<Record<WidgetSlotName, LayoutEntry[]>>;
  /** App chrome mode for pages assigned to this template. Absent ⇒ "default".
   * "zen" hides all app chrome AND widget slots. "focus" hides only the
   * nav rail/sidebars/mobile bars, keeping header/contentTop/footer
   * widgets visible on the page itself. "wide" hides only the right widget
   * sidebar. "compact" hides the nav rail and mobile drawer/tab bar (a
   * floating FAB covers opening the right sidebar on mobile there). */
  chrome?: "default" | "zen" | "focus" | "wide" | "compact";
}

export interface WidgetTemplates {
  version: 1;
  templates: Record<string, WidgetTemplate>;
}

// Regions a template can cover — the same slots Layout.tsx marks
// `editable` and wires a shared `pageTemplateId` to (right/header/contentTop/
// footer; leftBottom/rightVisitor are nav-sidebar and visitor-only, out of
// scope).
export const TEMPLATE_SLOTS: WidgetSlotName[] = ["right", "header", "contentTop", "footer"];

// Reuses widget-layout's tolerant single-module-entry parser: a template's
// `slots` field has the exact same shape as one `modules[moduleId]` entry.
function parseSlots(raw: unknown): Partial<Record<WidgetSlotName, LayoutEntry[]>> {
  const parsed = parseWidgetLayout({ version: 1, modules: { t: raw } });
  return parsed?.modules.t ?? {};
}

// Tolerant parser: unknown/malformed templates are dropped, never thrown on.
export function parseWidgetTemplates(raw: unknown): WidgetTemplates | null {
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

  const templates = obj.templates;
  // PHP json_encode turns an empty map into [] — treat as "no templates"
  if (Array.isArray(templates)) return { version: 1, templates: {} };
  if (!templates || typeof templates !== "object") return null;

  const clean: WidgetTemplates["templates"] = {};
  for (const [id, tpl] of Object.entries(templates)) {
    if (!tpl || typeof tpl !== "object" || Array.isArray(tpl)) continue;
    const t = tpl as Record<string, unknown>;
    if (typeof t.name !== "string") continue;
    clean[id] = {
      name: t.name,
      slots: parseSlots(t.slots),
      ...(t.chrome === "zen" || t.chrome === "focus" || t.chrome === "wide" || t.chrome === "compact"
        ? { chrome: t.chrome }
        : {}),
    };
  }
  return { version: 1, templates: clean };
}

// ── Own templates (owner managing them from the Layout Templates screen) ──────

const [templates, setTemplates] = createSignal<WidgetTemplates | null>(null);

export function useTemplates() {
  return templates;
}

export function templateEntriesFor(templateId: string, slot: WidgetSlotName): LayoutEntry[] | null {
  return templates()?.templates[templateId]?.slots[slot] ?? null;
}

export function templateName(templateId: string): string | null {
  return templates()?.templates[templateId]?.name ?? null;
}

export function templateChrome(templateId: string): "default" | "zen" | "focus" | "wide" | "compact" {
  return templates()?.templates[templateId]?.chrome ?? "default";
}

// Called from auth-store with the pconfig value at boot.
export function initWidgetTemplates(raw: string | undefined): void {
  setTemplates(raw !== undefined ? parseWidgetTemplates(raw) : null);
}

// How many of the owner's webpages are assigned each template — lets the
// Layout Templates screen flag unused ones instead of requiring the owner to
// remember/check manually before deleting. Populated only by loadTemplates()
// (the management screen's GET); mutations don't change usage themselves
// (that only changes via a page's own layout_template assignment).
const [templateUsage, setTemplateUsage] = createSignal<Record<string, number>>({});

export function useTemplateUsage() {
  return templateUsage;
}

export function templateUsageCount(templateId: string): number {
  return templateUsage()[templateId] ?? 0;
}

function parseUsage(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n >= 0) out[id] = n;
  }
  return out;
}

// ── Page-owner templates (visitors, or viewing someone else's channel) ────────

const [pageTemplates, setPageTemplates] = createSignal<WidgetTemplates | null>(null);

export function initPageWidgetTemplates(raw: string | null | undefined): void {
  setPageTemplates(raw ? parseWidgetTemplates(raw) : null);
}

export function pageTemplateEntriesFor(templateId: string, slot: WidgetSlotName): LayoutEntry[] | null {
  return pageTemplates()?.templates[templateId]?.slots[slot] ?? null;
}

export function pageTemplateChrome(templateId: string): "default" | "zen" | "focus" | "wide" | "compact" {
  return pageTemplates()?.templates[templateId]?.chrome ?? "default";
}

// ── Mutations — server is the source of truth; each call refetches state from
// the response rather than optimistically guessing (templates are edited
// from one dedicated screen, not inline like widget_layout, so the extra
// round trip isn't felt the way it would be on every drag/drop). ────────────

async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const res = await apiFetch("/spa/widget-templates", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

function applyTemplatesResponse(data: Record<string, unknown> | null): boolean {
  if (!data) return false;
  const parsed = parseWidgetTemplates({ version: 1, templates: data.templates });
  if (!parsed) return false;
  setTemplates(parsed);
  return true;
}

export async function loadTemplates(): Promise<void> {
  const res = await apiFetch("/spa/widget-templates");
  if (!res.ok) return;
  const json = await res.json();
  const data = json.data ?? json;
  setTemplates(parseWidgetTemplates(data));
  setTemplateUsage(parseUsage(data?.usage));
}

export async function createTemplate(name: string): Promise<string | null> {
  const data = await post({ action: "create", name });
  if (!applyTemplatesResponse(data)) return null;
  return typeof data?.id === "string" ? data.id : null;
}

export async function renameTemplate(id: string, name: string): Promise<boolean> {
  return applyTemplatesResponse(await post({ action: "rename", id, name }));
}

export async function setTemplateChrome(
  id: string,
  chrome: "default" | "zen" | "focus" | "wide" | "compact",
): Promise<boolean> {
  return applyTemplatesResponse(await post({ action: "set_chrome", id, chrome }));
}

export async function deleteTemplate(id: string): Promise<boolean> {
  return applyTemplatesResponse(await post({ action: "delete", id }));
}

export async function saveTemplateSlots(
  id: string,
  slot: WidgetSlotName,
  entries: LayoutEntry[],
): Promise<boolean> {
  return applyTemplatesResponse(await post({ action: "save_slots", id, slot, entries }));
}

// Re-exported for convenience so callers building entries don't need a
// separate import from widget-layout.ts.
export { entryKey };
