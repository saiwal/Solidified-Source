import { Show, For, createSignal, createEffect } from "solid-js";
import { useQuery } from "@utsukta/spa-core/lib/query";
import { toast } from "@utsukta/spa-core/store/toast";
import SubPageContent from "@/shared/views/SubPageContent";
import PageActions from "@/shared/views/layout/PageActions";
import { MdOutlineDownload } from "solid-icons/md";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button, buttonClass } from "@ui/Button";
import { Card } from "@ui/Card";
import { Field, Select } from "@ui/Field";
import { getCsrfToken } from "@utsukta/spa-core/lib/csrf";

interface DavLink {
  name: string;
  url: string;
}

interface PortabilityMeta {
  export_enabled: boolean;
  sections: string[];
  default_sections: string[];
  years: number[];
  files_url: string;
  calendars: DavLink[];
  addressbooks: DavLink[];
}

const FILE_INPUT =
  "block w-full text-sm text-txt file:mr-3 file:px-3 file:py-1.5 file:rounded-lg " +
  "file:border-0 file:bg-elevated file:text-txt file:text-sm file:cursor-pointer cursor-pointer";

const SECTION_OPTIONS = [
  { value: "channel", labelKey: "settings.portability_section_channel" },
  {
    value: "connections",
    labelKey: "settings.portability_section_connections",
  },
  { value: "config", labelKey: "settings.portability_section_config" },
  { value: "apps", labelKey: "settings.portability_section_apps" },
  { value: "chatrooms", labelKey: "settings.portability_section_chatrooms" },
  { value: "events", labelKey: "settings.portability_section_events" },
  { value: "webpages", labelKey: "settings.portability_section_webpages" },
  { value: "wikis", labelKey: "settings.portability_section_wikis" },
  { value: "extras", labelKey: "settings.portability_section_extras" },
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
  createEffect(() => [meta()?.default_sections, selected().size] as const, ([defaults, size]) => {
    if (defaults && size === 0) {
      setSelected(new Set(defaults));
    }
  });

  function toggleSection(name: string) {
    const next = new Set(selected());
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  }

  const [year, setYear] = createSignal("");
  const [contentFile, setContentFile] = createSignal<File | null>(null);
  const [importing, setImporting] = createSignal(false);

  async function handleContentImport() {
    const file = contentFile();
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await fetch("/spa/portability/import/items", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": await getCsrfToken().catch(() => "") },
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message);
      toast.success(
        t("settings.portability_content_import_done", {
          count: String(json?.data?.items ?? 0),
        }),
      );
    } catch (e) {
      toast.error(
        (e instanceof Error && e.message) ||
          t("settings.portability_import_failed"),
      );
    } finally {
      setImporting(false);
    }
  }

  function handleDownload() {
    if (selected().size === 0) {
      toast.error(t("settings.portability_no_sections"));
      return;
    }
    const params = new URLSearchParams({
      sections: Array.from(selected()).join(","),
    });
    const a = document.createElement("a");
    a.href = `/spa/portability/export?${params.toString()}`;
    a.click();
  }

  return (
    <SubPageContent
      panel={true}
      title={t("settings.title_portability")}
      description={t("settings.desc_portability")}
    >
      <Card class="p-5 space-y-4">
        <Show
          when={meta()}
          fallback={
            <div class="text-sm text-muted">{t("settings.load_error")}</div>
          }
        >
          {(m) => (
            <Show
              when={m().export_enabled}
              fallback={
                <div class="text-sm text-muted">
                  {t("settings.portability_not_installed")}
                </div>
              }
            >
              <div>
                <h3 class="text-sm font-semibold text-txt">
                  {t("settings.portability_export_title")}
                </h3>
                <p class="text-xs text-muted mt-1">
                  {t("settings.portability_export_desc")}
                </p>
              </div>

              <div class="space-y-2">
                <label class="block text-xs font-medium text-muted">
                  {t("settings.portability_sections")}
                </label>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <For
                    each={SECTION_OPTIONS.filter((opt) =>
                      m().sections.includes(opt.value),
                    )}
                  >
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

              <PageActions
                mobileOnly
                actions={[
                  {
                    label: t("settings.portability_download_btn"),
                    icon: MdOutlineDownload,
                    onClick: handleDownload,
                    primary: true,
                  },
                ]}
              />
              <Button onClick={handleDownload}>
                {t("settings.portability_download_btn")}
              </Button>
            </Show>
          )}
        </Show>
      </Card>

      <Show when={meta()?.export_enabled && meta()}>
        {(m) => (
          <Card class="p-5 space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-txt">
                {t("settings.portability_content_title")}
              </h3>
              <p class="text-xs text-muted mt-1">
                {t("settings.portability_content_desc")}
              </p>
            </div>
            <div class="flex flex-wrap items-end gap-3">
              <Field label={t("settings.portability_year")} size="sm">
                <Select
                  size="sm"
                  class="w-28"
                  value={year() || String(m().years[0] ?? "")}
                  onChange={(e) => setYear(e.currentTarget.value)}
                >
                  <For each={m().years}>
                    {(y) => <option value={y}>{y}</option>}
                  </For>
                </Select>
              </Field>
              <a
                class={buttonClass("ghost")}
                href={`/spa/portability/export/items?year=${year() || m().years[0]}`}
                download=""
              >
                <MdOutlineDownload />
                {t("settings.portability_content_btn")}
              </a>
            </div>
          </Card>
        )}
      </Show>

      <Show when={meta()}>
        {(m) => (
          <>
            <Card class="p-5 space-y-4">
              <div>
                <h3 class="text-sm font-semibold text-txt">
                  {t("settings.portability_files_title")}
                </h3>
                <p class="text-xs text-muted mt-1">
                  {t("settings.portability_files_desc")}
                </p>
              </div>
              <a class={buttonClass("ghost")} href={m().files_url} download="">
                <MdOutlineDownload />
                {t("settings.portability_files_btn")}
              </a>
            </Card>

            <Show when={m().calendars.length + m().addressbooks.length > 0}>
              <Card class="p-5 space-y-4">
                <div>
                  <h3 class="text-sm font-semibold text-txt">
                    {t("settings.portability_dav_title")}
                  </h3>
                  <p class="text-xs text-muted mt-1">
                    {t("settings.portability_dav_desc")}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <For each={[...m().calendars, ...m().addressbooks]}>
                    {(link) => (
                      <a
                        class={buttonClass("ghost", "sm")}
                        href={link.url}
                        download=""
                      >
                        <MdOutlineDownload />
                        {link.name}
                      </a>
                    )}
                  </For>
                </div>
              </Card>
            </Show>
          </>
        )}
      </Show>

      <Card class="p-5 space-y-4">
        <div>
          <h3 class="text-sm font-semibold text-txt">
            {t("settings.portability_content_import_title")}
          </h3>
          <p class="text-xs text-muted mt-1">
            {t("settings.portability_content_import_desc")}
          </p>
        </div>
        <input
          type="file"
          accept=".json,.zip,application/json,application/zip"
          aria-label={t("settings.portability_content_import_title")}
          disabled={importing()}
          onChange={(e) => setContentFile(e.currentTarget.files?.[0] ?? null)}
          class={FILE_INPUT}
        />
        <Button
          disabled={!contentFile() || importing()}
          onClick={handleContentImport}
        >
          {importing()
            ? t("settings.portability_importing")
            : t("settings.portability_content_import_btn")}
        </Button>
      </Card>

      <Card class="p-5 space-y-4">
        <h3 class="text-sm font-semibold text-txt">
          {t("settings.portability_import_title")}
        </h3>
        <p class="text-xs text-muted">
          {t("settings.portability_import_desc")}
        </p>
        <a
          href="/import"
          class="inline-block px-4 py-2 text-sm font-medium rounded-lg border border-rim text-txt
                 hover:bg-elevated transition-colors"
        >
          {t("settings.portability_import_btn")}
        </a>
      </Card>
    </SubPageContent>
  );
}
