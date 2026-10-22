// Settings form for EmbedWidget instances: URL, optional title, height.

import { createSignal, Show } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function EmbedConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const [url, setUrl] = createSignal(String(props.config.url ?? ""));
  const [title, setTitle] = createSignal(String(props.config.title ?? ""));
  const [height, setHeight] = createSignal(Number(props.config.height ?? 300));

  const valid = () => isValidUrl(url().trim());

  const save = () => {
    const config: Record<string, unknown> = { url: url().trim(), height: height() };
    if (title().trim()) config.title = title().trim();
    props.onSave(config);
  };

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_embed_url")}
        <Input
          size="sm"
          class="mt-1 w-full"
          type="url"
          value={url()}
          onInput={(e) => setUrl(e.currentTarget.value)}
          placeholder="https://www.youtube.com/embed/..."
        />
      </label>
      <Show when={url() && !valid()}>
        <p class="text-[0.6875rem] text-danger-txt">{t("widgets.cfg_invalid_url")}</p>
      </Show>
      <label class="text-xs text-muted">
        {t("widgets.cfg_title")}
        <Input
          size="sm"
          class="mt-1 w-full"
          type="text"
          value={title()}
          maxLength={100}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
      </label>
      <label class="text-xs text-muted">
        {t("widgets.cfg_embed_height")}
        <Input
          size="sm"
          class="mt-1 w-full"
          type="number"
          min={100}
          max={800}
          step={10}
          value={height()}
          onInput={(e) => setHeight(Number(e.currentTarget.value))}
        />
      </label>
      <Button size="sm" class="self-end" onClick={save} disabled={!valid()}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
