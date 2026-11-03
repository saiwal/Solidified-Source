import { createEffect } from "solid-js";
import { createQueryResource } from "./createQueryResource";
import { applyBackgroundCSS, loadBackground, type BgFit } from "./background";
import { applyTheme, applyCustomThemeColors } from "./useTheme";
import { applyTypographyCSS, loadTypography, FONT_FAMILY_IDS, type FontSize, type FontFamily } from "./typography";
import { applyCornerRadiusCSS, loadCornerRadius, type CornerRadius } from "./corner-radius";
import { initPageWidgetLayout } from "../store/widget-layout";
import { loadWidgetShell, setPageWidgetShell } from "./widget-shell";
import { applyGlassCSS, loadGlass } from "./glass";
import { initPageWidgetTemplates } from "../store/widget-templates";
import { THEMES, type ThemeId, type CustomThemeColors } from "../types/theme.types";

const VALID_FITS    = new Set<string>(["tile", "cover"]);
const VALID_THEMES  = new Set(THEMES.map((t) => t.id));
const VALID_SIZES   = new Set<string>(["small", "medium", "large", "xl"]);
const VALID_RADII   = new Set<string>(["none", "sm", "default", "lg", "xl"]);
const VALID_FAMILIES = new Set<string>(FONT_FAMILY_IDS);

async function fetchChannelSpa(nick: string): Promise<Record<string, string> | null> {
  if (!nick) return null;
  const res = await fetch(`/spa/pconfig?channel=${encodeURIComponent(nick)}`, {
    credentials: "include",
  });
  if (!res.ok) return null;
  const json = await res.json();
  const data = json.data ?? json;
  // Logged-in users get page_spa (visited channel's prefs); anonymous get spa
  return data.page_spa ?? (data.uid === 0 ? data.spa : null);
}

/**
 * Reactively applies the visited channel's color scheme, background image, and
 * typography. Pass the result of useSubjectNick() — reacts whenever the channel
 * changes. When nick becomes "" (non-channel pages), reverts to the user's own
 * saved settings.
 */
export function useChannelTheme(channelNick: () => string) {
  const [channelSpa] = createQueryResource("channel-spa", channelNick, fetchChannelSpa);

  createEffect(() => {
    const spa = channelSpa();
    if (spa === undefined) return; // still loading

    if (spa === null) {
      // Left channel pages — restore user's own settings from localStorage
      loadBackground();
      loadTypography();
      loadCornerRadius();
      loadWidgetShell();
      loadGlass();
      applyTheme(((localStorage.getItem("hz-theme") ?? "light") as ThemeId));
      initPageWidgetLayout(null);
      initPageWidgetTemplates(null);
      return;
    }

    // Track the visited channel's widget arrangement for Slot resolution
    initPageWidgetLayout(spa.widget_layout);
    initPageWidgetTemplates(spa.widget_templates ?? null);

    // Apply the channel's background (CSS only — do not overwrite user's localStorage)
    const bgUrl = spa.bg_url ?? "";
    const bgFit = (VALID_FITS.has(spa.bg_fit ?? "") ? spa.bg_fit : "cover") as BgFit;
    applyBackgroundCSS(bgUrl, bgFit);

    // Apply the channel's color scheme (CSS only — do not overwrite user's localStorage).
    // Always apply, falling back to the site default when unset, so a previously
    // viewed channel's (or the viewer's own) theme doesn't bleed through.
    const scheme = VALID_THEMES.has((spa.color_scheme ?? "") as ThemeId) ? spa.color_scheme! : "light";
    if (scheme === "custom" && spa.custom_theme_colors) {
      try {
        applyCustomThemeColors(JSON.parse(spa.custom_theme_colors) as CustomThemeColors);
      } catch {
        applyTheme("custom");
      }
    } else {
      applyTheme(scheme as ThemeId);
    }

    // Apply the channel's typography (CSS only — do not overwrite user's localStorage)
    const fontSize = (VALID_SIZES.has(spa.font_size ?? "") ? spa.font_size : "medium") as FontSize;
    const fontFamily = (VALID_FAMILIES.has(spa.font_family ?? "") ? spa.font_family : "system") as FontFamily;
    applyTypographyCSS(fontSize, fontFamily);

    // Apply the channel's corner radius (CSS only — do not overwrite user's localStorage)
    const cornerRadius = (VALID_RADII.has(spa.corner_radius ?? "") ? spa.corner_radius : "default") as CornerRadius;
    applyCornerRadiusCSS(cornerRadius);
    setPageWidgetShell(spa.widget_shell);
    applyGlassCSS(spa.glass_ui);
  });
}
