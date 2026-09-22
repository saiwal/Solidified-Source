/**
 * MentionPopup.tsx
 * Floating @-mention suggestion list.
 *
 * - Positions itself fixed relative to the caret rect
 * - Flips above the caret when there is not enough space below
 * - onMouseDown with preventDefault so focus stays in the editor
 * - Uses design tokens: bg-surface, border-rim, bg-accent-muted, text-txt, text-muted
 */

import { For, Show, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import type { MentionEntry } from "./useMention";

export interface MentionPopupProps {
  query: string;
  entries: MentionEntry[];
  anchorRect: DOMRect;
  activeIdx: number;
  onSelect: (entry: MentionEntry) => void;
}

const MentionPopup: Component<MentionPopupProps> = (props) => {
  const style = () => {
    const r = props.anchorRect;
    const popupH = Math.min(props.entries.length * 44 + 8, 220);
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= popupH + 8 ? r.bottom + 4 : r.top - popupH - 4;
    const left = Math.min(r.left, window.innerWidth - 248);
    return `position:fixed;top:${top}px;left:${left}px;width:240px;z-index:9999`;
  };

  return (
    <Portal mount={topLayer()}>
      <div
        style={style()}
        role="listbox"
        aria-label="Mention suggestions"
        class="bg-surface border border-rim rounded-xl shadow-2xl overflow-hidden py-1"
      >
        <For each={props.entries}>
          {(entry, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i() === props.activeIdx}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus in editor
                props.onSelect(entry);
              }}
              class={
                "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors " +
                (i() === props.activeIdx
                  ? "bg-accent-muted text-txt"
                  : "hover:bg-elevated text-muted hover:text-txt")
              }
            >
              <Show
                when={entry.photo}
                fallback={
                  <span class="w-7 h-7 rounded-full shrink-0 bg-elevated flex items-center justify-center text-xs font-semibold text-muted">
                    {entry.name[0]?.toUpperCase() ?? "@"}
                  </span>
                }
              >
                <img
                  src={entry.photo}
                  alt=""
                  class="w-7 h-7 rounded-full shrink-0 object-cover bg-elevated"
                />
              </Show>
              <span class="flex flex-col min-w-0">
                <span class="text-xs font-medium truncate text-txt leading-tight">
                  {entry.name}
                </span>
                <span class="text-[0.625rem] text-muted truncate leading-tight">
                  @{entry.addr}
                </span>
              </span>
            </button>
          )}
        </For>
      </div>
    </Portal>
  );
};

export default MentionPopup;
