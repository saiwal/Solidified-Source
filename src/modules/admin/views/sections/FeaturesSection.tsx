import { createSignal, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { toast } from "@utsukta/spa-core/store/toast";
import SubPageContent from "@/shared/views/SubPageContent";
import { SaveBar } from "@/modules/settings/store/FormHelpers";
import { fetchAdminFeatures, saveAdminFeatures } from "../../api";
import type { FeatureItem } from "../../types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Switch } from "@ui/Toggle";

export default function FeaturesSection() {
  const { t } = useI18n();
  const [features, { refetch }] = createQueryResource("admin-features", fetchAdminFeatures);
  const [saving, setSaving] = createSignal(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const raw = new FormData(form);
    const payload: Record<string, boolean> = {};

    features()?.sections.forEach((s) =>
      s.items.forEach((item) => {
        payload[item.id] = raw.has(item.id);
      })
    );

    setSaving(true);
    try {
      await saveAdminFeatures(payload);
      toast.success("Saved");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SubPageContent
      title={t("admin.features_title")}
      description={t("admin.features_desc")}
    >
      <Show when={features()} fallback={<Skeleton />}>
        {(f) => (
          <form id="features-form" onSubmit={handleSubmit} class="space-y-6">
            <For each={f().sections}>
              {(section) => (
                <div class="space-y-3">
                  <h3 class="text-sm font-semibold text-txt">{section.label}</h3>
                  <div class="space-y-2">
                    <For each={section.items}>{(item) => <FeatureRow item={item} />}</For>
                  </div>
                </div>
              )}
            </For>

            <SaveBar saving={saving()} label={t("admin.save")} savingLabel={t("admin.saving")} />
          </form>
        )}
      </Show>
    </SubPageContent>
  );
}

function FeatureRow(props: { item: FeatureItem }) {
  const { t } = useI18n();
  return (
    <label class={`flex items-center justify-between gap-4 p-3 rounded-lg border border-rim hover:bg-elevated/50 transition-colors ${props.item.locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
      <div class="min-w-0 space-y-0.5">
        <p class="text-sm font-medium text-txt">{props.item.label}</p>
        <p class="text-xs text-muted">{props.item.desc}</p>
        <Show when={props.item.locked}>
          <p class="text-xs text-accent">{t("admin.locked_by_admin")}</p>
        </Show>
      </div>
      <Switch name={props.item.id} checked={props.item.enabled} disabled={props.item.locked} />
    </label>
  );
}

function Skeleton() {
  return (
    <div class="space-y-3 animate-pulse">
      {Array.from({ length: 5 }, () => (
        <div class="h-14 rounded-lg border border-rim bg-elevated/30" />
      ))}
    </div>
  );
}
