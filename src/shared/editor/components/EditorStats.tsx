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
import { IconButton } from "./buttons";

/** Expand/contract arrows — shared by this row and ComposerModal's header. */
export const ZenToggleButton: Component = () => {
  const { t } = useI18n();
  return (
    <IconButton
      title={zenMode() ? t("editor.fullscreen_exit") : t("editor.fullscreen_enter")}
      onClick={() => setZenMode(!zenMode())}
    >
      <Show
        when={zenMode()}
        fallback={
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        }
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </Show>
    </IconButton>
  );
};

export interface EditorStatsProps {
  words: Accessor<number>;
  chars: Accessor<number>;
  /** Page-hosted composers: render the zen toggle beside the counts. */
  zenToggle?: boolean;
}

const EditorStats: Component<EditorStatsProps> = (props) => {
  const { t } = useI18n();
  return (
    <div class="flex items-center justify-end gap-2">
      <span class="text-xs text-muted">{t("editor.words_count", { count: props.words() })}</span>
      <span class="text-xs text-muted">·</span>
      <span class="text-xs text-muted">{t("editor.chars_count", { count: props.chars() })}</span>
      <Show when={props.zenToggle}>
        <ZenToggleButton />
      </Show>
    </div>
  );
};

export default EditorStats;
