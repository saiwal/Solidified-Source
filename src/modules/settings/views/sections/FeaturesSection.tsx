import { Show, For, createMemo } from "solid-js";
import { useQuery, useMutation, useQueryClient } from "@utsukta/spa-core/lib/query";
import SubPageContent from "@/shared/views/SubPageContent";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { toast } from "@utsukta/spa-core/store/toast";
import { refetchNavData } from "@utsukta/spa-core/store/nav-store";
import { setFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";

interface FeatureEntry {
  name: string;
  label: string;
  description: string;
  group: string;
  enabled: boolean;
}

interface FeaturesData {
  features: FeatureEntry[];
}

// Feature keys whose toggled state is also surfaced in /spa/nav.
const NAV_AFFECTING_FEATURES = new Set(["nav_channel_select"]);

async function fetchFeatures(): Promise<FeaturesData> {
  const res = await apiFetch("/spa/settings/features");
  if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
  const { data } = await res.json();
  return data as FeaturesData;
}

export default function FeaturesSection() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery(() => ({
    queryKey: ["settings", "features"] as const,
    queryFn: fetchFeatures,
  }));

  const grouped = createMemo<[string, FeatureEntry[]][]>(() => {
    const list = query.data?.features ?? [];
    const map = new Map<string, FeatureEntry[]>();
    for (const f of list) {
      const g = f.group || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(f);
    }
    return [...map.entries()];
  });

  const toggleMutation = useMutation(() => ({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
      const res = await apiFetch("/spa/settings/features", {
        method: "POST",
        body: JSON.stringify({ feature: name, enabled: enabled ? 0 : 1 }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
    },
    onSuccess: (_data, { name, enabled }) => {
      // Patch the cache in place — cheaper than invalidating and refetching
      queryClient.setQueryData<FeaturesData>(["settings", "features"], (prev) =>
        prev
          ? {
              features: prev.features.map((f) =>
                f.name === name ? { ...f, enabled: !enabled } : f,
              ),
            }
          : prev,
      );
      // Keep the app-wide auth/features state (isFeatureEnabled()) in sync too,
      // otherwise gated UI elsewhere doesn't update until a hard reload.
      setFeatureEnabled(name, !enabled);
      // Some feature toggles are also reflected in /spa/nav (e.g. the nav
      // "channels" entry gates on nav_channel_select) — refetch it so the
      // change shows up immediately instead of waiting on the next reload.
      if (NAV_AFFECTING_FEATURES.has(name)) refetchNavData();
    },
    onError: () => {
      toast.error(t("settings.feat_toggle_failed"));
    },
  }));

  const toggle = (name: string, currentlyEnabled: boolean) =>
    toggleMutation.mutate({ name, enabled: currentlyEnabled });

  return (
    <SubPageContent title={t("settings.title_features")} description={t("settings.desc_features")}>
      <Show when={query.isError}>
        <p class="text-sm text-muted">{t("settings.feat_load_error")}</p>
      </Show>

      <Show when={query.isPending}>
        <Skeleton />
      </Show>

      <Show when={query.data && grouped().length === 0}>
        <p class="text-sm text-muted">{t("settings.feat_no_features")}</p>
      </Show>

      <div class="space-y-8">
        <For each={grouped()}>
          {([groupName, items]) => (
            <div class="space-y-3">
              <Show when={groupName}>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
                  {groupName}
                </h3>
              </Show>
              <div class="space-y-2">
                <For each={items}>
                  {(feat) => (
                    <FeatureRow
                      feature={feat}
                      isBusy={toggleMutation.isPending && toggleMutation.variables?.name === feat.name}
                      onToggle={() => toggle(feat.name, feat.enabled)}
                    />
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </SubPageContent>
  );
}

function FeatureRow(props: {
  feature: FeatureEntry;
  isBusy: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const f = props.feature;

  return (
    <div class="flex items-start gap-4 rounded-lg border border-rim bg-surface px-4 py-3">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-txt">{f.label}</p>
        <Show when={f.description}>
          <p class="text-xs text-muted mt-0.5 leading-relaxed">{f.description}</p>
        </Show>
      </div>
      <button
        type="button"
        disabled={props.isBusy}
        onClick={props.onToggle}
        aria-pressed={f.enabled}
        class={[
          "shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          f.enabled ? "bg-accent" : "bg-elevated border border-rim",
        ].join(" ")}
      >
        <span class="sr-only">
          {f.enabled ? t("settings.feat_toggle_off") : t("settings.feat_toggle_on")}
        </span>
        <span
          class={[
            "inline-block h-4 w-4 rounded-full transition-transform",
            f.enabled ? "translate-x-6 bg-accent-fg" : "translate-x-1 bg-muted",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function Skeleton() {
  return (
    <div class="space-y-2 animate-pulse">
      {[...Array(4)].map(() => (
        <div class="flex items-center gap-4 rounded-lg border border-rim px-4 py-3">
          <div class="flex-1 space-y-1.5">
            <div class="h-4 w-40 rounded bg-elevated" />
            <div class="h-3 w-64 rounded bg-elevated" />
          </div>
          <div class="h-6 w-11 rounded-full bg-elevated" />
        </div>
      ))}
    </div>
  );
}
