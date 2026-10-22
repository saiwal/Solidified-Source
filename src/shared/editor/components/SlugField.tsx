/**
 * SlugField.tsx
 * Label + font-mono slug input + ↻ autofill-from-title button, shared by
 * Article and Webpage composers (Webpage previously had this button,
 * Article didn't — both now render the same component).
 */

import { Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { slugify } from "../lib/slugify";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";

export interface SlugFieldProps {
  value: () => string;
  onInput: (v: string) => void;
  /** Source text the ↻ button derives the slug from (the composer's title signal). */
  title: () => string;
  /** Hide the "Slug" label above the input — the placeholder already names the field. */
  hideLabel?: boolean;
  /** Override the default "Slug" label (e.g. for a differently-named identifier field). */
  label?: string;
  /** Override the default "url-slug" placeholder. */
  placeholder?: string;
}

const SlugField: Component<SlugFieldProps> = (props) => {
  const { t } = useI18n();
  return (
    <div class="flex-1 min-w-0">
      <Show when={!props.hideLabel}>
        <label class="block text-xs text-muted mb-1">{props.label ?? t("editor.slug_label")}</label>
      </Show>
      <div class="flex items-center gap-1.5">
        <Input
          class="flex-1 font-mono"
          type="text"
          placeholder={props.placeholder ?? t("editor.slug_placeholder")}
          value={props.value()}
          onInput={(e) => props.onInput(e.currentTarget.value)}
        />
        <Button
          variant="ghost"
          size="sm"
          title={t("editor.generate_slug")}
          onClick={() => props.onInput(slugify(props.title()))}
        >
          ↻
        </Button>
      </div>
    </div>
  );
};

export default SlugField;
