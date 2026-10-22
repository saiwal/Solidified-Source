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
import { Switch } from "@ui/Toggle";
import { Badge } from "@ui/Badge";
import { Button } from "@ui/Button";

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
                            <Badge tone="accent">{t("admin.default_badge")}</Badge>
                          </Show>
                          <Show when={theme.mobile}>
                            <Badge>{t("admin.mobile_badge")}</Badge>
                          </Show>
                          <Show when={theme.experimental}>
                            <Badge tone="warning">{t("admin.experimental_badge")}</Badge>
                          </Show>
                          <Show when={!theme.compatible}>
                            <span class="px-1.5 py-0.5 text-xs rounded-full border border-danger/40 text-danger-txt">{t("admin.incompatible_badge")}</span>
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
                          <Button
                            variant="ghost"
                            size="sm"
                            pressed={configTheme() === theme.name}
                            onClick={() => setConfigTheme(configTheme() === theme.name ? null : theme.name)}
                          >
                            {t("admin.settings_label")}
                          </Button>
                        </Show>
                        <Switch
                          checked={theme.allowed}
                          // void: the refetch lands after the toggle resolves, so re-syncing on
                          // settle would flick the switch back until it does.
                          onChange={() => void onToggle(theme.name)}
                          label={theme.allowed ? "Disable" : "Allow"}
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
