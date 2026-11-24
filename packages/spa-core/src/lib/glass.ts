// "Surfaces" display pref (pconfig spa/glass_ui): '0' solid, '1' frosted glass
// (<html data-glass>, blurred), '2' see-through (<html data-tint>, tint only,
// no blur). Cards, panels, sidebars and widget shells go see-through over the
// page / wallpaper. Independent of the widget shell look. Same flow as corner radius:
// own pref → localStorage cache, a visited channel's choice shown screen-only.
// The CSS lives in index.css under :root[data-glass].

const LS_KEY = "hz-glass";

type Mode = "0" | "1" | "2";
const mode = (v: unknown): Mode => {
  const s = String(v === true ? 1 : v ?? "0");
  return s === "1" || s === "2" ? s : "0";
};

// Backdrop blur is redrawn every frame anything moves over or under it; on a
// weak phone GPU that made drawers and scrolling stutter. Such devices get
// the blur-free see-through look instead (the pref itself is kept).
// ponytail: core/memory count is a rough proxy — deviceMemory is Chromium-only
// and Safari caps hardwareConcurrency, so iPhones mostly pass as capable.
const lowEnd =
  typeof matchMedia !== "undefined" &&
  matchMedia("(pointer: coarse)").matches &&
  (((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4);

/** Screen only — a visited channel's choice; the viewer's cache stays. */
export function applyGlassCSS(v: unknown): void {
  if (typeof document === "undefined") return;
  const m = mode(v);
  const root = document.documentElement;
  root.toggleAttribute("data-glass", m === "1" && !lowEnd);
  root.toggleAttribute("data-tint", m === "2" || (m === "1" && lowEnd));
}

/** The viewer's own choice: shown and cached. */
export function applyGlass(v: unknown): void {
  applyGlassCSS(v);
  try {
    localStorage.setItem(LS_KEY, mode(v));
  } catch {
    // private mode — cache is best-effort
  }
}

/** Boot / leaving a channel page: back to the viewer's own. */
export function loadGlass(): void {
  let v: string | null = null;
  try {
    v = localStorage.getItem(LS_KEY);
  } catch {
    // ignore
  }
  applyGlassCSS(v);
}
