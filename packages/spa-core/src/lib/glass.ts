// "Translucent surfaces" display pref (pconfig spa/glass_ui, '1' = on): cards,
// panels, sidebars and filled widget shells go see-through over the page /
// wallpaper. Independent of the widget shell look. Same flow as corner radius:
// own pref → localStorage cache, a visited channel's choice shown screen-only.
// The CSS lives in index.css under :root[data-glass].

const LS_KEY = "hz-glass";

const on = (v: unknown) => v === true || v === 1 || v === "1";

/** Screen only — a visited channel's choice; the viewer's cache stays. */
export function applyGlassCSS(v: unknown): void {
  if (typeof document === "undefined") return;
  document.documentElement.toggleAttribute("data-glass", on(v));
}

/** The viewer's own choice: shown and cached. */
export function applyGlass(v: unknown): void {
  applyGlassCSS(v);
  try {
    localStorage.setItem(LS_KEY, on(v) ? "1" : "0");
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
