import { For, Show, createSignal } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchAdminAddons, toggleAddon } from "../../api";
import AddonSettingsForm from "./AddonSettingsForm";
import { useI18n } from "@utsukta/spa-core/i18n";

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
                  <div class="rounded-lg border border-rim p-3 bg-surface">
                   <div class="flex items-start justify-between gap-4">
                    <div class="space-y-0.5 min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium text-txt">{addon.name}</p>
                        <Show when={addon.active}>
                          <span class="px-1.5 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            {t("admin.active_badge")}
                          </span>
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
                        <button
                          type="button"
                          onClick={() => setOpenSettings((s) => (s === addon.slug ? null : addon.slug))}
                          class="px-2 py-0.5 text-xs rounded border border-rim text-muted hover:text-txt hover:border-accent transition-colors"
                          aria-expanded={openSettings() === addon.slug}
                        >
                          {t("admin.addon_settings")}
                        </button>
                      </Show>
                      <span class={`px-2 py-0.5 text-xs rounded border ${addon.installed ? "border-accent text-accent" : "border-rim text-muted"}`}>
                        {addon.installed ? t("admin.installed_badge") : t("admin.not_installed_badge")}
                      </span>
                      <input
                        type="checkbox"
                        checked={addon.active}
                        onChange={() => onToggle(addon.slug)}
                        aria-label={addon.active ? "Disable" : "Enable"}
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
                   <Show when={openSettings() === addon.slug}>
                     <AddonSettingsForm slug={addon.slug} />
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
