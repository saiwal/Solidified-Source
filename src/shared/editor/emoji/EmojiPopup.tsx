/**
 * EmojiPopup.tsx
 * Floating emoji suggestion list — mirrors MentionPopup.
 */

import { For, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import type { EmojiEntry } from "./useEmoji";

export interface EmojiPopupProps {
  entries:    EmojiEntry[];
  anchorRect: DOMRect;
  activeIdx:  number;
  onSelect:   (entry: EmojiEntry) => void;
}

const EmojiPopup: Component<EmojiPopupProps> = (props) => {
  const style = () => {
    const r = props.anchorRect;
    const popupH = Math.min(props.entries.length * 40 + 8, 200);
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= popupH + 8 ? r.bottom + 4 : r.top - popupH - 4;
    const left = Math.min(r.left, window.innerWidth - 220);
    return `position:fixed;top:${top}px;left:${left}px;width:212px;z-index:9999`;
  };

  return (
    <Portal mount={topLayer()}>
      <div
        style={style()}
        role="listbox"
        aria-label="Emoji suggestions"
        class="bg-surface border border-rim rounded-xl shadow-2xl overflow-hidden py-1"
      >
        <For each={props.entries}>
          {(entry, i) => {
            const slug = entry.shortname.replace(/:/g, "");
            return (
              <button
                type="button"
                role="option"
                aria-selected={i() === props.activeIdx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  props.onSelect(entry);
                }}
                class={
                  "w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors " +
                  (i() === props.activeIdx
                    ? "bg-accent-muted text-txt"
                    : "hover:bg-elevated text-muted hover:text-txt")
                }
              >
                <img
                  src={`/${entry.filepath}`}
                  alt={entry.shortname}
                  class="w-6 h-6 shrink-0 object-contain"
                />
                <span class="text-xs text-txt truncate">{slug}</span>
              </button>
            );
          }}
        </For>
      </div>
    </Portal>
  );
};

export default EmojiPopup;
