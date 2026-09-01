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
   *  and surface — compute with canUseWysiwyg(mimetype, caps.markdownWysiwyg).
   *  RichEditor forces the source tab when it isn't, so the toggle hides
   *  rather than sitting there doing nothing. Omitted = shown. */
  canWysiwyg?: boolean;
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
        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors shrink-0 " +
        (isSource()
          ? "bg-accent/10 text-accent border-accent/30"
          : "text-muted hover:text-txt hover:bg-elevated border-rim")
      }
    >
      <MdOutlineCode class="w-3.5 h-3.5" />
      {isSource() ? t("editor.write_tab") : t("editor.source_tab")}
    </button>
    </Show>
  );
};

export default SourceToggleButton;
