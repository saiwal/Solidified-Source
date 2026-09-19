/**
 * SourceToggleButton.tsx
 * Replaces the old Write/Source tab bar — a single button that flips
 * RichEditor between its WYSIWYG surface and raw bbcode/markdown/html
 * source. Lives in AttachmentBar's action row for composers that have one;
 * rendered standalone (bottom-right, near the editor) for composers that
 * don't (Wiki, the profile bio field, notes, inline post/comment edits).
 */

import { Show, type Component } from "solid-js";
import { MdOutlineCode } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { EditorTab } from "../types/editor.types";

export interface SourceToggleButtonProps {
  tab: EditorTab;
  onToggle: () => void;
  /** Whether the WYSIWYG surface is available at all for the current format
   *  and surface — compute with canUseWysiwyg(mimetype, caps.nonBbcodeWysiwyg).
   *  RichEditor forces the source tab when it isn't, so the toggle hides
   *  rather than sitting there doing nothing. Omitted = shown. */
  canWysiwyg?: boolean;
  /** Drops the border/background chrome — for the word-count row, where it is
   *  one more piece of quiet metadata rather than a button in a control row. */
  borderless?: boolean;
}

const SourceToggleButton: Component<SourceToggleButtonProps> = (props) => {
  const { t } = useI18n();
  const isSource = () => props.tab === "source";
  return (
    <Show when={props.canWysiwyg ?? true}>
    <button
      type="button"
      onClick={props.onToggle}
      title={isSource() ? t("editor.write_tab") : t("editor.source_tab")}
      class={
        "flex items-center gap-1.5 rounded-md text-xs transition-colors shrink-0 " +
        (props.borderless
          ? "px-1 py-0.5 " + (isSource() ? "text-accent" : "text-muted hover:text-txt")
          : "px-2 sm:px-2.5 py-1 border " +
            (isSource()
              ? "bg-accent/10 text-accent border-accent/30"
              : "text-muted hover:text-txt hover:bg-elevated border-rim"))
      }
    >
      <MdOutlineCode class="w-3.5 h-3.5" />
      <span class="hidden sm:inline">{isSource() ? t("editor.write_tab") : t("editor.source_tab")}</span>
    </button>
    </Show>
  );
};

export default SourceToggleButton;
