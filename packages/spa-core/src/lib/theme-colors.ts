// Pure palette logic for the "custom" theme. No DOM, no network — see
// useTheme.ts for the applying/persisting side, useTheme.test.ts for the check.
import type { CustomThemeColors } from "../types/theme.types";

export const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
  base: "#1e1e2e",
  txt: "#cdd6f4",
  accent: "#cba6f7",
  isDark: true,
};

/**
 * #rgb or #rrggbb -> #rrggbb, anything else -> null.
 * Three-digit form matters: the CSS minifier ships `--color-elevated:#fff`,
 * so reading a preset back out of the browser yields short hex. Everything
 * else is rejected because these values are interpolated into a <style> tag,
 * and a visitor renders the *page owner's* stored colors (useChannelTheme).
 */
export function normalizeHex(value: unknown): string | null {
  const m = String(value ?? "").trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1];
  return "#" + (h.length === 3 ? [...h].map((c) => c + c).join("") : h);
}

const mix = (a: string, b: string, pct: string) => `color-mix(in srgb, ${a}, ${b} ${pct})`;
const tint = (c: CustomThemeColors) => (c.isDark ? "white" : "black");

function statusVars<N extends "danger" | "success" | "warning">(name: N, light: string, dark: string) {
  const hue = (c: CustomThemeColors) => c[name] ?? (c.isDark ? dark : light);
  return [
    { key: name, css: `--color-${name}`, derive: hue },
    { key: `${name}Muted`, css: `--color-${name}-muted`, derive: (c: CustomThemeColors) => mix(hue(c), c.base, "84%") },
    { key: `${name}Txt`, css: `--color-${name}-txt`, derive: (c: CustomThemeColors) => mix(hue(c), tint(c), "15%") },
    { key: `${name}Fg`, css: `--color-${name}-fg`, derive: () => "#ffffff" },
  ] as const;
}

/** Every `--color-*` var a theme defines, with the formula used when it isn't overridden. */
export const THEME_VARS = [
  { key: "base", css: "--color-base", derive: (c: CustomThemeColors) => c.base },
  { key: "surface", css: "--color-surface", derive: (c) => mix(c.base, tint(c), "8%") },
  // Raised and recessed surfaces do not follow the light/dark tint: across the
  // 23 presets, elevated is lighter than base in every one and overlay is
  // darker in all but two, light themes included.
  { key: "elevated", css: "--color-elevated", derive: (c) => mix(c.base, "white", "18%") },
  { key: "overlay", css: "--color-overlay", derive: (c) => mix(c.base, "black", "8%") },
  { key: "txt", css: "--color-txt", derive: (c) => c.txt },
  { key: "muted", css: "--color-muted", derive: (c) => mix(c.txt, c.base, "50%") },
  { key: "subtle", css: "--color-subtle", derive: (c) => mix(c.txt, c.base, "70%") },
  { key: "rim", css: "--color-rim", derive: (c) => mix(c.txt, c.base, "78%") },
  { key: "rimStrong", css: "--color-rim-strong", derive: (c) => mix(c.txt, c.base, "68%") },
  { key: "accent", css: "--color-accent", derive: (c) => c.accent },
  { key: "accentMuted", css: "--color-accent-muted", derive: (c) => mix(c.accent, c.base, "82%") },
  { key: "accentTxt", css: "--color-accent-txt", derive: (c) => mix(c.accent, tint(c), "15%") },
  { key: "accentFg", css: "--color-accent-fg", derive: () => "#ffffff" },
  // Status hues are fixed (no base knob of their own), so a custom theme only
  // needs to pick light/dark; muted/txt follow the same formulas as accent.
  ...statusVars("danger", "#dc2626", "#f87171"),
  ...statusVars("success", "#16a34a", "#4ade80"),
  ...statusVars("warning", "#d97706", "#fbbf24"),
] as const satisfies readonly {
  key: keyof CustomThemeColors;
  css: string;
  derive: (c: CustomThemeColors) => string;
}[];

/** The vars beyond base/txt/accent — editable individually, derived when unset. */
export type DerivedColorKey = Exclude<
  (typeof THEME_VARS)[number]["key"],
  "base" | "txt" | "accent"
>;

/** Which overrides stop being valid when one of the base knobs changes. */
const DEPENDENTS: Partial<Record<keyof CustomThemeColors, DerivedColorKey[]>> = {
  base: [
    "surface", "elevated", "overlay", "muted", "subtle", "rim", "rimStrong",
    "accentMuted", "dangerMuted", "successMuted", "warningMuted",
  ],
  txt: ["muted", "subtle", "rim", "rimStrong"],
  accent: ["accentMuted", "accentTxt"],
  danger: ["dangerMuted", "dangerTxt"],
  success: ["successMuted", "successTxt"],
  warning: ["warningMuted", "warningTxt"],
  // isDark deliberately absent: it only flips the light/dark tint used by the
  // formulas, so unset vars re-derive on their own and explicit colors stay.
};

/**
 * Set one color, dropping the overrides that were derived from it so they
 * re-derive. Passing `undefined` clears the key (reset to derived).
 */
export function withColorChange(
  colors: CustomThemeColors,
  key: keyof CustomThemeColors,
  value: string | boolean | undefined
): CustomThemeColors {
  const next = { ...colors } as Record<string, unknown>;
  if (value === undefined) delete next[key];
  else next[key] = value;
  for (const dep of DEPENDENTS[key] ?? []) delete next[dep];
  return next as unknown as CustomThemeColors;
}

/** Drop anything that isn't a plain hex color before it reaches the stylesheet. */
function sanitize(colors: CustomThemeColors): CustomThemeColors {
  const out = { isDark: !!colors.isDark } as Record<string, unknown>;
  for (const { key } of THEME_VARS) {
    const hex = normalizeHex(colors[key]);
    if (hex) out[key] = hex;
  }
  // The formulas need these three, so fall back rather than emit `undefined`.
  out.base ??= DEFAULT_CUSTOM_COLORS.base;
  out.txt ??= DEFAULT_CUSTOM_COLORS.txt;
  out.accent ??= DEFAULT_CUSTOM_COLORS.accent;
  return out as unknown as CustomThemeColors;
}

/** Overrides win; anything unset falls back to its formula. */
export function buildCustomThemeCSS(colors: CustomThemeColors): string {
  const safe = sanitize(colors);
  const rows = THEME_VARS.map(
    ({ key, css, derive }) => `  ${css}: ${safe[key] ?? derive(safe)};`
  );
  return `[data-theme="custom"] {\n${rows.join("\n")}\n}`;
}
