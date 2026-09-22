/**
 * TagPopup.tsx
 * Floating hashtag suggestion list — mirrors EmojiPopup/MentionPopup.
 */

import { For, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import type { TagItem } from "./useTag";

export interface TagPopupProps {
  entries:    TagItem[];
  anchorRect: DOMRect;
  activeIdx:  number;
  onSelect:   (entry: TagItem) => void;
}

const TagPopup: Component<TagPopupProps> = (props) => {
  const style = () => {
    const r = props.anchorRect;
    const popupH = Math.min(props.entries.length * 32 + 8, 200);
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
        aria-label="Tag suggestions"
        class="bg-surface border border-rim rounded-xl shadow-2xl overflow-hidden py-1"
      >
        <For each={props.entries}>
          {(entry, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i() === props.activeIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                props.onSelect(entry);
              }}
              class={
                "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors " +
                (i() === props.activeIdx
                  ? "bg-accent-muted text-txt"
                  : "hover:bg-elevated text-muted hover:text-txt")
              }
            >
              <span class="truncate">#{entry.name}</span>
              <span class="text-muted shrink-0">{entry.count}</span>
            </button>
          )}
        </For>
      </div>
    </Portal>
  );
};

export default TagPopup;
