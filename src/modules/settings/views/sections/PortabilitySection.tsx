import { Show, For, createSignal, createEffect } from "solid-js";
import { A } from "@solidjs/router";
import { useQuery } from "@utsukta/spa-core/lib/query";
import { toast } from "@utsukta/spa-core/store/toast";
import SubPageContent from "@/shared/views/SubPageContent";
import PageActions from "@/shared/views/layout/PageActions";
import { MdOutlineDownload } from "solid-icons/md";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Card } from "@ui/Card";

interface PortabilityMeta {
  export_enabled: boolean;
  sections: string[];
  default_sections: string[];
  years: number[];
}

const SECTION_OPTIONS = [
  { value: "channel",     labelKey: "settings.portability_section_channel" },
  { value: "connections", labelKey: "settings.portability_section_connections" },
  { value: "config",      labelKey: "settings.portability_section_config" },
  { value: "apps",        labelKey: "settings.portability_section_apps" },
  { value: "chatrooms",   labelKey: "settings.portability_section_chatrooms" },
  { value: "events",      labelKey: "settings.portability_section_events" },
  { value: "webpages",    labelKey: "settings.portability_section_webpages" },
  { value: "wikis",       labelKey: "settings.portability_section_wikis" },
] as const;

export default function PortabilitySection() {
  const { t } = useI18n();
  const query = useQuery(() => ({
    queryKey: ["settings", "portability"] as const,
    queryFn: async (): Promise<PortabilityMeta> => {
      const res = await apiFetch("/spa/portability");
      const { data } = await res.json();
      return data;
    },
  }));
  const meta = () => query.data;

  const [selected, setSelected] = createSignal<Set<string>>(new Set());

  // Seed the checkbox set from the server's default sections once metadata arrives.
  createEffect(() => {
    const m = meta();
    if (m && selected().size === 0) {
      setSelected(new Set(m.default_sections));
    }
  });

  function toggleSection(name: string) {
    const next = new Set(selected());
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  }

  function handleDownload() {
    if (selected().size === 0) {
      toast.error(t("settings.portability_no_sections"));
      return;
    }
    const params = new URLSearchParams({ sections: Array.from(selected()).join(",") });
    const a = document.createElement("a");
    a.href = `/spa/portability/export?${params.toString()}`;
    a.click();
  }

  return (
    <SubPageContent title={t("settings.title_portability")} description={t("settings.desc_portability")}>
      <Show when={meta()} fallback={<div class="text-sm text-muted">{t("settings.load_error")}</div>}>
        {(m) => (
          <Show
            when={m().export_enabled}
            fallback={<div class="text-sm text-muted">{t("settings.portability_not_installed")}</div>}
          >
            <Card class="p-5 space-y-4">
              <div>
                <h3 class="text-sm font-semibold text-txt">{t("settings.portability_export_title")}</h3>
                <p class="text-xs text-muted mt-1">{t("settings.portability_export_desc")}</p>
              </div>

              <div class="space-y-2">
                <label class="block text-xs font-medium text-muted">
                  {t("settings.portability_sections")}
                </label>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <For each={SECTION_OPTIONS.filter((opt) => m().sections.includes(opt.value))}>
                    {(section) => (
                      <label class="flex items-center gap-2 text-sm text-txt cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected().has(section.value)}
                          onChange={() => toggleSection(section.value)}
                          class="rounded border-rim"
                        />
                        {t(section.labelKey)}
                      </label>
                    )}
                  </For>
                </div>
              </div>

              <PageActions mobileOnly actions={[
                { label: t("settings.portability_download_btn"), icon: MdOutlineDownload, onClick: handleDownload, primary: true },
              ]} />
              <Button onClick={handleDownload}>
                {t("settings.portability_download_btn")}
              </Button>
            </Card>
          </Show>
        )}
      </Show>

      <Card class="p-5 space-y-2">
        <h3 class="text-sm font-semibold text-txt">{t("settings.portability_import_title")}</h3>
        <p class="text-xs text-muted">{t("settings.portability_import_desc")}</p>
        <A
          href="/import"
          class="inline-block px-4 py-2 text-sm font-medium rounded-lg border border-rim text-txt
                 hover:bg-elevated transition-colors"
        >
          {t("settings.portability_import_btn")}
        </A>
      </Card>
    </SubPageContent>
  );
}
