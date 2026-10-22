/**
 * LanguageField.tsx
 * Required language <select> for ArticleComposer — manual only, no
 * auto-detect fallback (item.lang would otherwise get silently overwritten
 * by the server's language auto-detection on every save).
 */

import { Show, For, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { LANGUAGE_CODES, languageLabel } from "@utsukta/spa-core/lib/languages";
import { Select } from "@ui/Field";

export interface LanguageFieldProps {
  value: () => string;
  onInput: (v: string) => void;
  /** Language codes to omit — used when adding a translation to exclude languages already in the group. */
  exclude?: string[];
  hideLabel?: boolean;
}

const LanguageField: Component<LanguageFieldProps> = (props) => {
  const { t, locale } = useI18n();
  const codes = () => LANGUAGE_CODES.filter((c) => !props.exclude?.includes(c));

  return (
    <div class="flex-1 min-w-0">
      <Show when={!props.hideLabel}>
        <label class="block text-xs text-muted mb-1">{t("editor.language_label")}</label>
      </Show>
      <Select class="w-full" value={props.value()} onChange={(e) => props.onInput(e.currentTarget.value)}>
        <option value="" disabled>{t("editor.language_placeholder")}</option>
        <For each={codes()}>
          {(code) => <option value={code}>{languageLabel(code, locale())}</option>}
        </For>
      </Select>
    </div>
  );
};

export default LanguageField;
