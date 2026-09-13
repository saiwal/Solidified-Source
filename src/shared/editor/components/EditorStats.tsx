/**
 * EditorStats.tsx
 * The right-aligned "N words · M characters" row that five composers each
 * carried as a byte-identical copy, plus the zen-mode toggle that sits beside
 * it on the page-hosted composers (the modal ones toggle zen from
 * ComposerModal's header instead).
 */

import { Show, type Component, type Accessor } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { zenMode, setZenMode } from "@utsukta/spa-core/store/zen";
import { MdFillSelf_improvement, MdOutlineSelf_improvement } from "solid-icons/md";
import { IconButton } from "./buttons";

/** Zen enter/exit toggle — shared by this row and ComposerModal's header. */
export const ZenToggleButton: Component = () => {
  const { t } = useI18n();
  return (
    <IconButton
      title={t("editor.zen_mode")}
      onClick={() => setZenMode(!zenMode())}
    >
      <Show when={zenMode()} fallback={<MdFillSelf_improvement class="w-4 h-4" />}>
        <MdOutlineSelf_improvement class="w-4 h-4" />
      </Show>
    </IconButton>
  );
};

export interface EditorStatsProps {
  words: Accessor<number>;
  chars: Accessor<number>;
}

const EditorStats: Component<EditorStatsProps> = (props) => {
  const { t } = useI18n();
  return (
    <div class="flex items-center justify-end gap-2">
      <span class="text-xs text-muted">{t("editor.words_count", { count: props.words() })}</span>
      <span class="text-xs text-muted">·</span>
      <span class="text-xs text-muted">{t("editor.chars_count", { count: props.chars() })}</span>
    </div>
  );
};

export default EditorStats;
