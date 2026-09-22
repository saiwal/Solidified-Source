/**
 * SuggestPopup.tsx
 * Generic floating suggestion list for a plain <input> field (category tags,
 * series name) — same visual/positioning pattern as EmojiPopup/MentionPopup,
 * but anchored to the input's own rect instead of a text-caret rect.
 */

import { For, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";

export interface SuggestPopupProps {
  items: string[];
  anchorRect: DOMRect;
  activeIdx: number;
  onSelect: (item: string) => void;
}

const SuggestPopup: Component<SuggestPopupProps> = (props) => {
  const style = () => {
    const r = props.anchorRect;
    const width = Math.max(r.width, 160);
    const popupH = Math.min(props.items.length * 32 + 8, 200);
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= popupH + 8 ? r.bottom + 4 : r.top - popupH - 4;
    const left = Math.min(r.left, window.innerWidth - width - 8);
    return `position:fixed;top:${top}px;left:${left}px;width:${width}px;z-index:9999`;
  };

  return (
    <Portal mount={topLayer()}>
      <div
        style={style()}
        role="listbox"
        aria-label="Suggestions"
        class="bg-surface border border-rim rounded-xl shadow-2xl overflow-hidden py-1"
      >
        <For each={props.items}>
          {(item, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i() === props.activeIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                props.onSelect(item);
              }}
              class={
                "w-full px-3 py-1.5 text-left text-xs truncate transition-colors " +
                (i() === props.activeIdx
                  ? "bg-accent-muted text-txt"
                  : "hover:bg-elevated text-muted hover:text-txt")
              }
            >
              {item}
            </button>
          )}
        </For>
      </div>
    </Portal>
  );
};

export default SuggestPopup;
