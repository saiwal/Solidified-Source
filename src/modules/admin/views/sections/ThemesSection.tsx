import { createSignal, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import {
  fetchAdminThemes,
  fetchThemeSettings,
  saveThemeSettings,
  toggleTheme,
} from "../../api";
import HookSettingsForm from "./HookSettingsForm";
import { useI18n } from "@utsukta/spa-core/i18n";

export default function ThemesSection() {
  const { t } = useI18n();
  const [result, { refetch }] = createQueryResource("admin-themes", fetchAdminThemes);
  const [configTheme, setConfigTheme] = createSignal<string | null>(null);

  async function onToggle(name: string) {
    await toggleTheme(name);
    refetch();
  }

  return (
    <SubPageContent title={t("admin.themes_title")} description={t("admin.themes_desc")}>
      <Show when={result()} fallback={<Skeleton />}>
        {(r) => (
          <div class="space-y-2">
            <p class="text-sm text-muted">{r().themes.length} {t("admin.themes_found")}</p>
            <div class="space-y-2">
              <For each={r().themes}>
                {(theme) => (
                  <div class={`rounded-lg border p-3 bg-surface ${theme.current ? "border-accent" : "border-rim"}`}>
                    <div class="flex items-start justify-between gap-4">
                      <div class="space-y-0.5 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <p class="text-sm font-medium text-txt font-mono">{theme.name}</p>
                          <Show when={theme.current}>
                            <span class="px-1.5 py-0.5 text-xs rounded-full bg-accent/10 text-accent">{t("admin.default_badge")}</span>
                          </Show>
                          <Show when={theme.mobile}>
                            <span class="px-1.5 py-0.5 text-xs rounded-full bg-elevated text-muted">{t("admin.mobile_badge")}</span>
                          </Show>
                          <Show when={theme.experimental}>
                            <span class="px-1.5 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">{t("admin.experimental_badge")}</span>
                          </Show>
                          <Show when={!theme.compatible}>
                            <span class="px-1.5 py-0.5 text-xs rounded-full border border-red-300 text-red-600">{t("admin.incompatible_badge")}</span>
                          </Show>
                        </div>
                        <Show when={theme.description}>
                          <p class="text-xs text-muted">{theme.description}</p>
                        </Show>
                        <Show when={theme.version}>
                          <p class="text-xs text-muted">v{theme.version}</p>
                        </Show>
                      </div>

                      <div class="flex items-center gap-2 shrink-0">
                        <Show when={theme.has_settings}>
                          <button
                            type="button"
                            onClick={() => setConfigTheme(configTheme() === theme.name ? null : theme.name)}
                            class={`px-2 py-1 text-xs rounded border transition-colors
                              ${configTheme() === theme.name
                                ? "border-accent text-accent bg-accent/5"
                                : "border-rim text-muted hover:bg-elevated"}`}
                          >
                            {t("admin.settings_label")}
                          </button>
                        </Show>
                        <input
                          type="checkbox"
                          checked={theme.allowed}
                          onChange={() => onToggle(theme.name)}
                          aria-label={theme.allowed ? "Disable" : "Allow"}
                          class="appearance-none relative h-6 w-11 shrink-0 cursor-pointer rounded-full
                                 bg-elevated border border-rim transition-colors
                                 checked:bg-accent checked:border-accent
                                 after:absolute after:top-1/2 after:-translate-y-1/2 after:translate-x-1
                                 after:h-4 after:w-4 after:rounded-full after:bg-muted
                                 after:transition-transform after:duration-150 motion-reduce:after:transition-none
                                 checked:after:translate-x-6 checked:after:bg-accent-fg
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60
                                 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                        />
                      </div>
                    </div>

                    <Show when={configTheme() === theme.name}>
                      <HookSettingsForm
                        id={theme.name}
                        load={fetchThemeSettings}
                        save={saveThemeSettings}
                      />
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>
    </SubPageContent>
  );
}

function Skeleton() {
  return (
    <div class="space-y-2 animate-pulse">
      {Array.from({ length: 4 }, () => (
        <div class="h-16 rounded-lg border border-rim bg-elevated/30" />
      ))}
    </div>
  );
}
