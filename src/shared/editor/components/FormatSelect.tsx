/**
 * FormatSelect.tsx
 * Content-format (item.mimetype) picker for the composers.
 *
 * Hubzilla stores a body raw in the format it was authored in and records that
 * format in item.mimetype. Core exposes this dropdown via mimetype_select()
 * (include/text.php:2252) on webpages and blocks.
 *
 * Not used on posts or comments: those federate, and only bbcode survives
 * that. Rather than offer a choice there, the "Markdown" feature
 * toggle switches the whole composer to Markdown and the server converts it
 * to bbcode on save (ContentTypes::toBbcode).
 *
 * Switching format does not convert the body, matching core, which simply
 * re-renders the same source under the new format. Since that can turn a
 * written body into visible garbage, a non-empty body gets one confirm.
 */

import { Show, For, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { CONTENT_TYPES, type MimeType } from "@utsukta/spa-core/lib/mimetypes";
import { underlineFieldClass } from "../lib/fieldStyles";

const LABEL_KEY = {
  "text/bbcode": "editor.format_bbcode",
  "text/html": "editor.format_html",
  "text/markdown": "editor.format_markdown",
  "text/plain": "editor.format_plain",
} as const satisfies Record<MimeType, string>;

export interface FormatSelectProps {
  value: () => MimeType;
  onChange: (v: MimeType) => void;
  /** Current body — non-empty means switching format needs a confirm. */
  body?: () => string;
  /** Restrict the offered formats (posts and the wiki offer narrower sets). */
  choices?: readonly MimeType[];
  hideLabel?: boolean;
}

const FormatSelect: Component<FormatSelectProps> = (props) => {
  const { t } = useI18n();
  const choices = () => props.choices ?? CONTENT_TYPES;

  function change(next: MimeType) {
    if (next === props.value()) return;
    if ((props.body?.() ?? "").trim() && !confirm(t("editor.format_switch_confirm"))) return;
    props.onChange(next);
  }

  return (
    <div class="flex-1 min-w-0">
      <Show when={!props.hideLabel}>
        <label class="block text-xs text-muted mb-1">{t("editor.format")}</label>
      </Show>
      <select
        value={props.value()}
        onChange={(e) => change(e.currentTarget.value as MimeType)}
        class={`w-full bg-transparent px-0 py-1.5 text-sm text-txt ${underlineFieldClass}`}
      >
        <For each={choices()}>
          {(mime) => <option value={mime}>{t(LABEL_KEY[mime])}</option>}
        </For>
      </select>
    </div>
  );
};

export default FormatSelect;
