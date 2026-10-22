// Settings form for LinkListWidget instances: optional title + up to 8
// label/url rows. Save is blocked when the config would exceed the server's
// 2 KB per-instance cap.

import { createSignal, Index, Show } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillAdd, MdFillClose } from "solid-icons/md";
import { Button, IconButton } from "@ui/Button";
import { Input } from "@ui/Field";

interface Row {
  label: string;
  url: string;
}

const MAX_LINKS = 20;
const MAX_CONFIG_CHARS = 1900;

export default function LinkListConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const initial = Array.isArray(props.config.links)
    ? (props.config.links as Row[]).map((l) => ({ label: String(l?.label ?? ""), url: String(l?.url ?? "") }))
    : [];
  const [title, setTitle] = createSignal(String(props.config.title ?? ""));
  const [rows, setRows] = createSignal<Row[]>(initial.length ? initial : [{ label: "", url: "" }]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const addRow = () => setRows((prev) => [...prev, { label: "", url: "" }]);

  const cleanConfig = (): Record<string, unknown> => {
    const links = rows()
      .map((r) => ({ label: r.label.trim(), url: r.url.trim() }))
      .filter((r) => /^https?:\/\//i.test(r.url));
    const config: Record<string, unknown> = { links };
    if (title().trim()) config.title = title().trim();
    return config;
  };

  const size = () => JSON.stringify(cleanConfig()).length;
  const linkCount = () => (cleanConfig().links as Row[]).length;
  const valid = () => linkCount() > 0 && size() <= MAX_CONFIG_CHARS;

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_title")}
        <Input
          size="sm"
          class="mt-1 w-full"
          type="text"
          value={title()}
          maxLength={60}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
      </label>

      <span class="text-xs text-muted">{t("widgets.cfg_links")}</span>
      {/* Index (not For): rows are recreated objects on every keystroke, and
          For would rebuild the DOM row — dropping focus from the input */}
      <Index each={rows()}>
        {(row, i) => (
          <div class="flex items-center gap-1">
            <Input
              size="sm"
              class="w-full"
              type="text"
              placeholder={t("widgets.cfg_link_label")}
              value={row().label}
              maxLength={60}
              onInput={(e) => setRow(i, { label: e.currentTarget.value })}
              style={{ "max-width": "35%" }}
            />
            <Input
              size="sm"
              class="w-full"
              type="url"
              placeholder="https://…"
              value={row().url}
              maxLength={200}
              onInput={(e) => setRow(i, { url: e.currentTarget.value })}
            />
            <IconButton
              label={t("widgets.remove_widget")}
              size="sm"
              class="shrink-0"
              onClick={() => removeRow(i)}
            >
              <MdFillClose size={14} />
            </IconButton>
          </div>
        )}
      </Index>

      <Show when={rows().length < MAX_LINKS}>
        <Button variant="ghost" size="sm" class="self-start" onClick={addRow}>
          <MdFillAdd size={12} />
          {t("widgets.cfg_add_link")}
        </Button>
      </Show>

      <div class="flex items-center justify-between gap-2">
        <Show when={size() > MAX_CONFIG_CHARS}>
          <span class="text-[0.625rem] text-muted">{t("widgets.cfg_too_large")}</span>
        </Show>
        <Button size="sm" class="ml-auto" onClick={() => props.onSave(cleanConfig())} disabled={!valid()}>
          {t("widgets.cfg_save")}
        </Button>
      </div>
    </div>
  );
}
