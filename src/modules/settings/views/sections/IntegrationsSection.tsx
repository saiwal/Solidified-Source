import { Show, For, createSignal, createMemo, type JSX } from "solid-js";
import { toast } from "@utsukta/spa-core/store/toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/solid-query";
import SubPageContent from "@/shared/views/SubPageContent";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { getNavIcon, biToNavIcon } from "@/shared/views/NavItem";
import { MdOutlineSettings } from "solid-icons/md";
import { refetchNavData } from "@utsukta/spa-core/store/nav-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { appLabel } from "@utsukta/spa-core/lib/app-labels";
import NsfwConfigModal from "./NsfwConfigModal";
import CardsConfigModal from "./CardsConfigModal";
import { getFrontendToggleableModules, frontendFeatureEnabled } from "@utsukta/spa-core/module-registry";
import { disabledFrontendModules, setFrontendModuleEnabled } from "@utsukta/spa-core/store/disabled-frontend-modules";

interface AppEntry {
  name: string;
  description: string;
  photo: string;
  installed: boolean;
  pinned: boolean;
  featured: boolean;
  requires: string;
}

/** Installed apps that get a gear on their row (lowercased app names). */
const CONFIGURABLE_APPS = new Set(["nsfw", "cards"]);

type AppAction = "install" | "uninstall" | "nav";
type FilterTab = "all" | "installed" | "available";

// One list holds both backend apps and frontend-only features; `app` is unset
// for the latter, which have no nav toggle and no server round-trip.
interface Row {
  key: string;
  label: string;
  description: string;
  icon: JSX.Element;
  enabled: boolean;
  frontend: boolean;
  app?: AppEntry;
}

async function fetchIntegrations(): Promise<{ apps: AppEntry[]; kanban: boolean }> {
  const res = await apiFetch("/spa/settings/integrations");
  if (!res.ok) throw new Error(`Failed to load apps: ${res.status}`);
  const { data } = await res.json();
  return { apps: data.apps as AppEntry[], kanban: data.kanban === 1 };
}

async function appAction(name: string, action: AppAction, enabled?: boolean): Promise<void> {
  const res = await apiFetch("/spa/settings/integrations", {
    method: "POST",
    body: JSON.stringify({ name, action, ...(enabled !== undefined ? { enabled } : {}) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Server error ${res.status}`);
  }
}

function AppIcon(props: { app: AppEntry }) {
  const { t } = useI18n();
  const biIcon = () => {
    const photo = props.app.photo;
    if (photo.startsWith("icon:")) return photo.slice(5);
    return "";
  };
  const iconKey = () => biToNavIcon(biIcon()) || props.app.name.toLowerCase();
  const isUrl = () => !props.app.photo.startsWith("icon:") && props.app.photo !== "";

  return (
    <Show
      when={isUrl()}
      fallback={
        <div class="w-9 h-9 rounded-lg bg-elevated flex items-center justify-center text-txt shrink-0">
          {getNavIcon(iconKey(), 18)}
        </div>
      }
    >
      <img
        src={props.app.photo}
        alt={appLabel(props.app.name, t)}
        class="w-9 h-9 rounded-lg object-cover shrink-0 bg-elevated p-2"
      />
    </Show>
  );
}

function Toggle(props: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      aria-pressed={props.on}
      class={[
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        props.on ? "bg-accent" : "bg-elevated border border-rim",
      ].join(" ")}
    >
      <span class="sr-only">{props.label}</span>
      <span
        class={[
          "inline-block h-4 w-4 rounded-full transition-transform",
          props.on ? "translate-x-6 bg-accent-fg" : "translate-x-1 bg-muted",
        ].join(" ")}
      />
    </button>
  );
}

export default function IntegrationsSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery(() => ({
    queryKey: ["settings", "integrations"] as const,
    queryFn: fetchIntegrations,
  }));
  const [search, setSearch] = createSignal("");
  const [filter, setFilter] = createSignal<FilterTab>("all");
  // Which installed app's config dialog is open, by lowercased app name.
  const [configApp, setConfigApp] = createSignal<string | null>(null);

  const rows = createMemo<Row[]>(() => {
    const apps: Row[] = (query.data?.apps ?? []).map((app) => ({
      key: `app:${app.name}`,
      label: appLabel(app.name, t),
      description: app.description,
      icon: <AppIcon app={app} />,
      enabled: app.installed,
      frontend: false,
      app,
    }));

    const disabled = disabledFrontendModules();
    const features: Row[] = getFrontendToggleableModules().map((mod) => {
      const f = mod.frontendFeature;
      return {
        key: `feat:${mod.id}`,
        label: typeof f.label === "function" ? f.label() : f.label,
        description: (typeof f.description === "function" ? f.description() : f.description) ?? "",
        icon: (
          <div class="w-9 h-9 rounded-lg bg-elevated flex items-center justify-center text-txt shrink-0">
            {getNavIcon(mod.navItem?.icon ?? mod.id, 18)}
          </div>
        ),
        enabled: frontendFeatureEnabled(f, mod.id, disabled),
        frontend: true,
      };
    });

    return [...apps, ...features].sort((a, b) => a.label.localeCompare(b.label));
  });

  const filtered = createMemo(() => {
    const q = search().toLowerCase();
    return rows().filter((row) => {
      if (filter() === "installed" && !row.enabled) return false;
      if (filter() === "available" && row.enabled) return false;
      if (q && !row.label.toLowerCase().includes(q) && !row.description.toLowerCase().includes(q))
        return false;
      return true;
    });
  });

  const appMutation = useMutation(() => ({
    mutationFn: ({ app, action, enabled }: { app: AppEntry; action: AppAction; enabled?: boolean }) =>
      appAction(app.name, action, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "integrations"] });
      refetchNavData();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Unknown error");
    },
  }));

  // While the mutation is in flight, `variables` holds the pending {app, action}
  const isBusy = (name: string) =>
    appMutation.isPending && appMutation.variables?.app.name === name;

  const run = (app: AppEntry, action: AppAction, enabled?: boolean) =>
    appMutation.mutate({ app, action, enabled });

  const toggleRow = (row: Row) => {
    if (row.app) run(row.app, row.app.installed ? "uninstall" : "install");
    else setFrontendModuleEnabled(row.key.slice(5), !row.enabled);
  };

  const TABS: { value: FilterTab; labelKey: string }[] = [
    { value: "all",       labelKey: "settings.integ_tab_all" },
    { value: "installed", labelKey: "settings.integ_tab_installed" },
    { value: "available", labelKey: "settings.integ_tab_available" },
  ];

  return (
    <SubPageContent
      title={t("settings.title_integrations")}
      description={t("settings.desc_integrations")}
    >
      <div class="flex gap-2 flex-wrap">
        <div class="flex rounded-lg border border-rim overflow-hidden text-xs font-medium">
          <For each={TABS}>
            {(tab) => (
              <button
                type="button"
                onClick={() => setFilter(tab.value)}
                class={`px-3 py-1.5 transition-colors
                  ${filter() === tab.value
                    ? "bg-elevated text-txt"
                    : "text-muted hover:bg-elevated hover:text-txt"
                  }`}
              >
                {t(tab.labelKey as any)}
              </button>
            )}
          </For>
        </div>
        <input
          type="search"
          placeholder={t("settings.integ_search_placeholder")}
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          class="flex-1 min-w-1 px-3 py-1.5 text-sm rounded-lg bg-surface border border-rim
                 text-txt hover:border-rim-strong focus:outline-none focus:border-accent
                 placeholder:text-muted"
        />
      </div>

      <Show when={!query.isPending} fallback={<Skeleton />}>
        <Show
          when={filtered().length > 0}
          fallback={
            <p class="text-sm text-muted text-center py-8">{t("settings.integ_no_results")}</p>
          }
        >
          {/* Column headers — the per-row labels used to repeat on every line */}
          <div class="hidden sm:flex items-center gap-3 pb-1 border-b border-rim
                      text-[10px] uppercase tracking-wide text-muted">
            <span class="flex-1">{t("settings.integ_app_label")}</span>
            <span class="w-11 text-center">{t("settings.integ_nav_label")}</span>
            <span class="w-11 text-center">{t("settings.integ_install_label")}</span>
            <span class="w-7" />
          </div>

          <div class="divide-y divide-rim">
            <For each={filtered()}>
              {(row) => (
                <div class="flex items-center gap-3 py-3">
                  {row.icon}

                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-txt leading-snug">
                      {row.label}
                      <Show when={row.frontend}>
                        <span class="ml-2 align-middle rounded px-1.5 py-0.5 text-[10px] font-normal
                                     uppercase tracking-wide bg-elevated text-muted">
                          {t("settings.integ_frontend_badge")}
                        </span>
                      </Show>
                    </p>
                    <Show when={row.description}>
                      <p class="text-xs text-muted mt-0.5 leading-relaxed">{row.description}</p>
                    </Show>
                  </div>

                  <div class="w-11 flex justify-center shrink-0">
                    <Show when={row.app?.installed}>
                      <input
                        type="checkbox"
                        class="w-4 h-4 accent-accent cursor-pointer
                               disabled:opacity-40 disabled:cursor-not-allowed
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        checked={!!(row.app!.pinned || row.app!.featured)}
                        disabled={isBusy(row.app!.name)}
                        title={row.app!.pinned || row.app!.featured
                          ? t("settings.integ_hide_nav")
                          : t("settings.integ_show_nav")}
                        onChange={() =>
                          run(row.app!, "nav", !(row.app!.pinned || row.app!.featured))}
                      />
                    </Show>
                  </div>

                  <div class="w-11 flex justify-center shrink-0">
                    <Toggle
                      on={row.enabled}
                      disabled={!!row.app && isBusy(row.app.name)}
                      label={row.enabled ? t("settings.integ_remove") : t("settings.integ_install")}
                      onClick={() => toggleRow(row)}
                    />
                  </div>

                  {/* Config lives after the toggles, not between them */}
                  <div class="w-7 shrink-0">
                    <Show when={row.app?.installed && CONFIGURABLE_APPS.has(row.app.name.toLowerCase())}>
                      <button
                        type="button"
                        title={t("settings.integ_configure")}
                        onClick={() => setConfigApp(row.app!.name.toLowerCase())}
                        class="w-7 h-7 flex items-center justify-center rounded-lg transition-colors
                               text-muted hover:bg-elevated hover:text-txt"
                      >
                        <MdOutlineSettings size={16} />
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={configApp() === "nsfw"}>
        <NsfwConfigModal onClose={() => setConfigApp(null)} />
      </Show>

      <Show when={configApp() === "cards"}>
        <CardsConfigModal
          kanban={!!query.data?.kanban}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["settings", "integrations"] })}
          onClose={() => setConfigApp(null)}
        />
      </Show>
    </SubPageContent>
  );
}

function Skeleton() {
  return (
    <div class="divide-y divide-rim animate-pulse">
      <For each={[0, 1, 2, 3, 4, 5]}>
        {() => (
          <div class="flex items-center gap-3 py-3">
            <div class="w-9 h-9 rounded-lg bg-elevated shrink-0" />
            <div class="flex-1 space-y-1.5">
              <div class="h-3.5 w-32 rounded bg-elevated" />
              <div class="h-3 w-48 rounded bg-elevated" />
            </div>
            <div class="h-6 w-11 rounded-full bg-elevated" />
            <div class="h-6 w-11 rounded-full bg-elevated" />
            <div class="w-7" />
          </div>
        )}
      </For>
    </div>
  );
}
