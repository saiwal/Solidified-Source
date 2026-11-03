// Which @ui/WidgetShell look widgets render in — a display pref like corner
// radius: pconfig spa/widget_shell (else hub default), cached in localStorage,
// and a visited channel's choice shown without touching the viewer's own.
import { createContext, createSignal } from "solid-js";

export const WIDGET_SHELLS = [
  "card", "section", "banded", "rail", "glass", "legend", "tab", "compact", "fold",
] as const;
export type WidgetShellId = (typeof WIDGET_SHELLS)[number];

const LS_KEY = "hz-widget-shell";

// "flat" shipped first and was replaced by "section"; stored prefs carry over.
const valid = (v: unknown): WidgetShellId => {
  if (v === "flat") return "section";
  return (WIDGET_SHELLS as readonly unknown[]).includes(v) ? (v as WidgetShellId) : "card";
};

function readCache(): WidgetShellId {
  try {
    return valid(localStorage.getItem(LS_KEY));
  } catch {
    return "card";
  }
}

const [shell, setShellSignal] = createSignal<WidgetShellId>(readCache());
export const widgetShell = shell;

// Mirrored onto <html data-widget-shell>: [share] embeds are HTML strings
// from bbcode.ts, not components, so index.css restyles them per look.
function setShell(id: WidgetShellId): void {
  setShellSignal(id);
  if (typeof document !== "undefined") document.documentElement.dataset.widgetShell = id;
}
setShell(shell());

/** A visited channel's shell — screen only, the viewer's saved pref stays. */
export function setPageWidgetShell(v: unknown): void {
  setShell(valid(v));
}

/** The viewer's own choice: shown and cached. */
export function applyWidgetShell(v: unknown): void {
  const id = valid(v);
  setShell(id);
  try {
    localStorage.setItem(LS_KEY, id);
  } catch {
    // private mode — cache is best-effort
  }
}

/** Back to the viewer's own after leaving a channel page. */
export function loadWidgetShell(): void {
  setShell(readCache());
}

// ── Collapsible shell ───────────────────────────────────────────────────────
// Slot provides each placed widget's layout key, so a folded widget stays
// folded across navigation and reloads. ponytail: per device (localStorage),
// move into widget_layout entries if it should follow the account.

export const WidgetKeyContext = createContext<string>();

const FOLD_KEY = "hz-widget-folded";

function readFolded(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((k) => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

const [folded, setFolded] = createSignal<Set<string>>(readFolded());

export const isFolded = (key: string): boolean => folded().has(key);

export function setWidgetFolded(key: string, on: boolean): void {
  const next = new Set(folded());
  if (on) next.add(key);
  else next.delete(key);
  setFolded(next);
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify([...next]));
  } catch {
    // best-effort
  }
}
