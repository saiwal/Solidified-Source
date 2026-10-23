import { createSignal } from "solid-js";
import type { ThemeId, CustomThemeColors } from "../types/theme.types";
import { apiFetch } from "./fetch";
import { THEME_VARS, buildCustomThemeCSS, normalizeHex, DEFAULT_CUSTOM_COLORS } from "./theme-colors";
import { withThemeTransition } from "./theme-transition";

export { THEME_VARS, buildCustomThemeCSS, withColorChange, normalizeHex, DEFAULT_CUSTOM_COLORS } from "./theme-colors";
export type { DerivedColorKey } from "./theme-colors";

const STORAGE_KEY = "hz-theme";
const CUSTOM_COLORS_KEY = "hz-custom-theme";

export const DARK_THEMES = new Set<ThemeId>([
  "dark",
  "nord",
  "dracula",
  "monokai",
  "gruvbox-dark",
  "catppuccin-mocha",
  "solarized-dark",
  "tokyo-night",
  "one-dark",
  "cyberpunk",
  "matrix",
  "rose-pine",
  "high-contrast",
]);

function loadCustomColorsFromStorage(): CustomThemeColors {
  try {
    const stored = localStorage.getItem(CUSTOM_COLORS_KEY);
    if (stored) return { ...DEFAULT_CUSTOM_COLORS, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_CUSTOM_COLORS;
}

const [theme, setTheme] = createSignal<ThemeId>(
  (localStorage.getItem(STORAGE_KEY) as ThemeId) ?? "light"
);

const [customColors, setCustomColors] = createSignal<CustomThemeColors>(
  loadCustomColorsFromStorage()
);

/** Read the currently applied theme's colors so "custom" can start from them. */
export function colorsFromAppliedTheme(): CustomThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const colors: CustomThemeColors = {
    ...DEFAULT_CUSTOM_COLORS,
    isDark: document.documentElement.classList.contains("dark"),
  };
  for (const { key, css } of THEME_VARS) {
    // Shipped CSS is minified (#ffffff -> #fff), so normalize before storing:
    // <input type="color"> only accepts the six-digit form.
    const hex = normalizeHex(cs.getPropertyValue(css));
    if (hex) (colors as unknown as Record<string, string>)[key] = hex;
  }
  return colors;
}

/** Current value of a CSS var as #rrggbb, resolving color-mix() via the browser. */
export function resolvedColor(cssVar: string): string {
  const probe = document.createElement("span");
  probe.style.cssText = `color: var(${cssVar}); position: absolute; visibility: hidden`;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/[\d.]+/g);
  probe.remove();
  if (!rgb) return "#000000";
  return (
    "#" +
    rgb
      .slice(0, 3)
      .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
      .join("")
  );
}


function injectCustomThemeStyle(colors: CustomThemeColors) {
  let styleEl = document.getElementById("hz-custom-theme") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "hz-custom-theme";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = buildCustomThemeCSS(colors);
}

export function applyCustomThemeColors(colors: CustomThemeColors) {
  injectCustomThemeStyle(colors);
  document.documentElement.setAttribute("data-theme", "custom");
  document.documentElement.classList.toggle("dark", colors.isDark);
}

export function applyTheme(id: ThemeId) {
  if (id === "custom") {
    applyCustomThemeColors(loadCustomColorsFromStorage());
    return;
  }
  document.documentElement.setAttribute("data-theme", id);
  document.documentElement.classList.toggle("dark", DARK_THEMES.has(id));
}

/**
 * Applies a *stored* scheme — at boot (auth-store) or when the settings form
 * loads. Deliberately unanimated: this is a load, not a switch, and animating
 * it would fade a scheme in on every login. UI that previews a picker value
 * wraps this in withThemeTransition itself (DisplaySection).
 */
export function initTheme(id: ThemeId, customColorsJson?: string) {
  setTheme(id);
  if (id === "custom") {
    let colors = loadCustomColorsFromStorage();
    if (customColorsJson) {
      try {
        const parsed = JSON.parse(customColorsJson);
        colors = { ...DEFAULT_CUSTOM_COLORS, ...parsed };
        setCustomColors(colors);
        localStorage.setItem(CUSTOM_COLORS_KEY, customColorsJson);
      } catch {}
    }
    applyCustomThemeColors(colors);
  } else {
    applyTheme(id);
  }
  localStorage.setItem(STORAGE_KEY, id);
}

export function useTheme() {
  const switchTheme = (id: ThemeId) => {
    // The signal moves inside the transition too: the scheme's own highlight in
    // the picker is part of the frame being cross-faded, so moving it outside
    // would make that one detail jump while everything else dissolves.
    withThemeTransition(() => {
      setTheme(id);
      if (id === "custom") {
        applyCustomThemeColors(customColors());
      } else {
        applyTheme(id);
      }
    });
    localStorage.setItem(STORAGE_KEY, id);
    apiFetch("/spa/settings/display", {
      method: "POST",
      body: JSON.stringify({ color_scheme: id }),
    }).catch(() => {});
  };

  const updateCustomColors = (colors: CustomThemeColors) => {
    // Inject the CSS before the signal fires: subscribers read back resolved
    // var values (see resolvedColor) and would otherwise see the old palette.
    // No transition here on purpose: this runs on every tick of a colour
    // picker drag, so a fade would chase the cursor.
    if (theme() === "custom") {
      applyCustomThemeColors(colors);
    }
    setCustomColors(colors);
    const json = JSON.stringify(colors);
    localStorage.setItem(CUSTOM_COLORS_KEY, json);
    apiFetch("/spa/settings/display", {
      method: "POST",
      body: JSON.stringify({ color_scheme: "custom", custom_theme_colors: json }),
    }).catch(() => {});
  };

  return { theme, switchTheme, customColors, updateCustomColors };
}
