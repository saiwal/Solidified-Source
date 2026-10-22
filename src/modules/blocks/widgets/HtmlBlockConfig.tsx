// Settings form for HtmlBlockWidget instances: either free-typed HTML (the
// original behavior, config.html) or a saved Hubzilla block picked from a
// dropdown (config.blockName) — the block's own body/mimetype/ACL then drive
// rendering, see HtmlBlockWidget.tsx. Only one of html/blockName is persisted
// at a time; existing instances with just { title, html } keep working as-is.

import { createSignal, createMemo, For, Show } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchBlocks } from "@/modules/webpages/api";
import { Button } from "@ui/Button";
import { Input, Select, Textarea } from "@ui/Field";

const MAX_HTML = 1800;

type Source = "custom" | "block";

export default function HtmlBlockConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const nick = usePageNick();

  const [title, setTitle] = createSignal(String(props.config.title ?? ""));
  const [html, setHtml] = createSignal(String(props.config.html ?? ""));
  const [blockName, setBlockName] = createSignal(String(props.config.blockName ?? ""));
  const [source, setSource] = createSignal<Source>(blockName() ? "block" : "custom");

  const [blocks] = createQueryResource("blocks-list", () => nick() || null, fetchBlocks);
  const blockOptions = createMemo(() => blocks() ?? []);

  const save = () => {
    const config: Record<string, unknown> = {};
    if (title().trim()) config.title = title().trim();
    if (source() === "block") {
      config.blockName = blockName();
    } else {
      config.html = html();
    }
    props.onSave(config);
  };

  const canSave = () => (source() === "block" ? !!blockName() : !!html().trim());

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_title")}
        <Input
          size="sm"
          class="mt-1 w-full"
          type="text"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
          maxLength={100}
        />
      </label>

      <div class="text-xs text-muted">
        {t("widgets.cfg_block_source")}
        <div class="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => setSource("custom")}
            class={`flex-1 px-2 py-1.5 rounded-lg text-xs border transition-colors ${
              source() === "custom"
                ? "border-accent bg-accent/10 text-txt"
                : "border-rim text-muted hover:text-txt"
            }`}
          >
            {t("widgets.cfg_source_custom")}
          </button>
          <button
            type="button"
            onClick={() => setSource("block")}
            class={`flex-1 px-2 py-1.5 rounded-lg text-xs border transition-colors ${
              source() === "block"
                ? "border-accent bg-accent/10 text-txt"
                : "border-rim text-muted hover:text-txt"
            }`}
          >
            {t("widgets.cfg_source_block")}
          </button>
        </div>
      </div>

      <Show
        when={source() === "block"}
        fallback={
          <label class="text-xs text-muted">
            {t("widgets.cfg_html")}
            <Textarea
              size="sm"
              class="mt-1 w-full font-mono resize-y"
              value={html()}
              onInput={(e) => setHtml(e.currentTarget.value)}
              maxLength={MAX_HTML}
              rows={6}
            />
          </label>
        }
      >
        <label class="text-xs text-muted">
          {t("widgets.cfg_select_block")}
          <Show
            when={blockOptions().length > 0}
            fallback={<p class="mt-1 text-[0.6875rem] text-muted">{t("widgets.cfg_no_blocks")}</p>}
          >
            <Select
              size="sm"
              class="mt-1 w-full"
              value={blockName()}
              onChange={(e) => setBlockName(e.currentTarget.value)}
            >
              <option value="">—</option>
              <For each={blockOptions()}>
                {(b) => <option value={b.name}>{b.title || b.name}</option>}
              </For>
            </Select>
          </Show>
        </label>
      </Show>

      <div class="flex items-center justify-between gap-2">
        <Show when={source() === "custom"} fallback={<span />}>
          <span class="text-[0.625rem] text-muted">
            {t("widgets.cfg_html_hint")} ({html().length}/{MAX_HTML})
          </span>
        </Show>
        <Button size="sm" onClick={save} disabled={!canSave()}>
          {t("widgets.cfg_save")}
        </Button>
      </div>
    </div>
  );
}
