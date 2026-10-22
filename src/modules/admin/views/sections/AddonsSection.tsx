import { For, Show, createSignal } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchAdminAddons, toggleAddon } from "../../api";
import HookSettingsForm from "./HookSettingsForm";
import { fetchAddonSettings, saveAddonSettings } from "../../api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Switch } from "@ui/Toggle";
import { Card } from "@ui/Card";
import { Badge } from "@ui/Badge";

export default function AddonsSection() {
  const { t } = useI18n();
  const [addons, { refetch }] = createQueryResource("admin-addons", fetchAdminAddons);
  // One open panel at a time — these forms are tall and rarely compared.
  const [openSettings, setOpenSettings] = createSignal<string | null>(null);

  async function onToggle(slug: string) {
    // A disabled addon's *_plugin_admin() isn't loaded, so close its panel.
    if (openSettings() === slug) setOpenSettings(null);
    await toggleAddon(slug);
    refetch();
  }

  return (
    <SubPageContent title={t("admin.addons_title")} description={t("admin.addons_desc")}>
      <Show when={addons()} fallback={<Skeleton />}>
        {(list) => (
          <div class="space-y-2">
            <p class="text-sm text-muted">{list().length} {t("admin.addons_found")}</p>
            <div class="space-y-2">
              <For each={list()}>
                {(addon) => (
                  <Card class="p-3">
                   <div class="flex items-start justify-between gap-4">
                    <div class="space-y-0.5 min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium text-txt">{addon.name}</p>
                        <Show when={addon.active}>
                          <Badge tone="success">
                            {t("admin.active_badge")}
                          </Badge>
                        </Show>
                      </div>
                      <Show when={addon.description}>
                        <p class="text-xs text-muted truncate">{addon.description}</p>
                      </Show>
                      <div class="flex items-center gap-2 text-xs text-muted">
                        <Show when={addon.version}>
                          <span>v{addon.version}</span>
                        </Show>
                        <Show when={addon.author}>
                          <span>·</span>
                          <span>{addon.author}</span>
                        </Show>
                      </div>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                      <Show when={addon.active && addon.has_settings}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOpenSettings((s) => (s === addon.slug ? null : addon.slug))}
                          aria-expanded={openSettings() === addon.slug}
                        >
                          {t("admin.settings_label")}
                        </Button>
                      </Show>
                      <span class={`px-2 py-0.5 text-xs rounded border ${addon.installed ? "border-accent text-accent" : "border-rim text-muted"}`}>
                        {addon.installed ? t("admin.installed_badge") : t("admin.not_installed_badge")}
                      </span>
                      <Switch
                        checked={addon.active}
                        // void: the refetch lands after the toggle resolves, so re-syncing on
                        // settle would flick the switch back until it does.
                        onChange={() => void onToggle(addon.slug)}
                        label={addon.active ? "Disable" : "Enable"}
                      />
                    </div>
                   </div>
                   <Show when={openSettings() === addon.slug}>
                     <HookSettingsForm
                       id={addon.slug}
                       load={fetchAddonSettings}
                       save={saveAddonSettings}
                     />
                   </Show>
                  </Card>
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
