// Site credits strip — copyright + "Powered by Hubzilla" + active theme name.
// Permanent, global, footer-only: rendered directly by Layout.tsx below the
// footer slot on every page, not part of the widget/slot system and not
// user-removable.

import { Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchSiteInfo } from "@/modules/siteinfo/api";
import { THEMES } from "@utsukta/spa-core/types/theme.types";
import { useTheme } from "@utsukta/spa-core/lib/useTheme";
import { useI18n } from "@utsukta/spa-core/i18n";

export default function SiteCredits() {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [info] = createQueryResource("siteinfo", fetchSiteInfo);

  const themeLabel = () => THEMES.find((th) => th.id === theme())?.label ?? theme();
  const year = new Date().getFullYear();

  return (
    <footer class="border-t border-rim px-4 pt-2 pb-3 text-center text-xs text-muted">
      <p>
        &copy; {year}{" "}
        <Show when={info()} fallback="…">
          {(d) => d().site_name}
        </Show>
        {" · "}
        {t("ui.siteinfo_powered_by")}{" "}
        <Show when={info()} fallback="Hubzilla">
          {(d) => (
            <a
              href={d().project_link}
              target="_blank"
              rel="noopener noreferrer"
              class="text-accent hover:underline"
            >
              Hubzilla{d().version ? ` v${d().version}` : ""}
            </a>
          )}
        </Show>
        {" · "}
        {t("widgets.credits_theme")}: Solidified{__THEME_VERSION__ ? ` v${__THEME_VERSION__}` : ""} - {themeLabel()}
      </p>
    </footer>
  );
}
