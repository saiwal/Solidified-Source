// node --experimental-strip-types packages/spa-core/src/lib/theme-colors.test.ts
import assert from "node:assert";

const { buildCustomThemeCSS, withColorChange, normalizeHex } = await import("./theme-colors.ts");

const legacy = { base: "#1e1e2e", txt: "#cdd6f4", accent: "#cba6f7", isDark: true };

// A 3-key object (what older accounts have stored) still derives everything.
const legacyCss = buildCustomThemeCSS(legacy);
assert(legacyCss.includes("--color-base: #1e1e2e;"));
assert(legacyCss.includes("--color-surface: color-mix(in srgb, #1e1e2e, white 8%);"));

// A palette captured from a preset is emitted verbatim, not re-mixed.
const nord = {
  base: "#2e3440", txt: "#eceff4", accent: "#88c0d0", isDark: true,
  surface: "#3b4252", rim: "#4c566a", accentMuted: "#2d3f4f",
};
const nordCss = buildCustomThemeCSS(nord);
assert(nordCss.includes("--color-surface: #3b4252;"));
assert(nordCss.includes("--color-rim: #4c566a;"));

// Changing the accent re-derives only the accent-dependent vars.
const reaccented = withColorChange(nord, "accent", "#ff0000");
const reaccentedCss = buildCustomThemeCSS(reaccented);
assert(reaccentedCss.includes("--color-accent: #ff0000;"));
assert(reaccentedCss.includes("--color-accent-muted: color-mix(in srgb, #ff0000, #2e3440 82%);"));
assert(reaccentedCss.includes("--color-surface: #3b4252;"), "surface must survive an accent edit");
assert(reaccentedCss.includes("--color-rim: #4c566a;"), "rim must survive an accent edit");

// Changing the background drops the overrides mixed from the old background.
const rebased = withColorChange(nord, "base", "#000000");
assert(!("surface" in rebased));
assert(!("rim" in rebased));
assert(buildCustomThemeCSS(rebased).includes("--color-surface: color-mix(in srgb, #000000, white 8%);"));

// undefined = reset one advanced row back to derived.
assert(!("surface" in withColorChange(nord, "surface", undefined)));
assert("rim" in withColorChange(nord, "surface", undefined));

// Toggling dark mode must not throw away colors taken from the preset.
const lightened = withColorChange(nord, "isDark", false);
const lightenedCss = buildCustomThemeCSS(lightened);
assert(lightenedCss.includes("--color-surface: #3b4252;"), "dark toggle must keep explicit colors");
assert(lightenedCss.includes("--color-accent-muted: #2d3f4f;"));
// ...but colors that were never set follow the new light/dark tint.
assert(lightenedCss.includes("--color-elevated: color-mix(in srgb, #2e3440, white 18%);"));

// The shipped stylesheet is minified, so reading a preset back gives short hex.
// Rejecting it silently re-derived --color-elevated (#fff in every light theme)
// into a grey mix, which is what "editing a light preset" used to look like.
assert.equal(normalizeHex("#fff"), "#ffffff");
assert.equal(normalizeHex("#EFF1F5"), "#EFF1F5");
assert.equal(normalizeHex("  #0f6 "), "#00ff66");
assert.equal(normalizeHex("color-mix(in srgb, red, blue)"), null);
assert(buildCustomThemeCSS({ ...nord, elevated: "#fff" }).includes("--color-elevated: #ffffff;"));

// Values reach a <style> tag, and a visitor renders the page owner's stored
// colors — anything not a hex literal must fall back to the formula, not escape.
const hostile = { ...legacy, surface: "#fff; } html { display: none } x{y:z" };
const hostileCss = buildCustomThemeCSS(hostile);
assert(!hostileCss.includes("display: none"));
assert(hostileCss.includes("--color-surface: color-mix(in srgb, #1e1e2e, white 8%);"));

// A raised surface must read as raised in light themes too — deriving it
// toward black is what made hand-built light themes look like grey cards.
const lightBuilt = { base: "#eeeee8", txt: "#1c1c1a", accent: "#4f6ef7", isDark: false };
const lightCss = buildCustomThemeCSS(lightBuilt);
assert(lightCss.includes("--color-elevated: color-mix(in srgb, #eeeee8, white 18%);"));
assert(lightCss.includes("--color-overlay: color-mix(in srgb, #eeeee8, black 8%);"));

// Status colors: older stored themes have none, so the hue follows light/dark...
assert(legacyCss.includes("--color-danger: #f87171;"));
assert(lightCss.includes("--color-danger: #dc2626;"));
assert(lightCss.includes("--color-warning-muted: color-mix(in srgb, #d97706, #eeeee8 84%);"));
// ...and re-picking a hue re-derives its muted/txt but keeps its fg.
const redder = withColorChange({ ...nord, dangerMuted: "#111111", dangerFg: "#000000" }, "danger", "#ff0000");
assert(!("dangerMuted" in redder));
assert.equal(redder.dangerFg, "#000000");
assert(buildCustomThemeCSS(redder).includes("--color-danger-txt: color-mix(in srgb, #ff0000, white 15%);"));

console.log("theme-colors: ok");
