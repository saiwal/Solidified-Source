/**
 * The "/" insert menu's list. EditorToolbar owns everything else — when it
 * opens, what the query is, the keys, and what each item does (its own
 * button actions) — so this is only the listbox at the caret.
 */

import { Portal } from "solid-js/web";
import { For, createEffect, type JSX } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";

export interface SlashItem {
  id: string;
  label: string;
  /** Extra search words, in English — the label is matched in the UI language. */
  aliases: string;
  icon: JSX.Element;
  run: () => void;
}

/** Items whose label or aliases contain every word of the query. */
export function filterSlash<T extends { label: string; aliases: string }>(items: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((it) => {
    const hay = `${it.label} ${it.aliases}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export default function SlashMenu(props: {
  rect: DOMRect;
  items: SlashItem[];
  active: number;
  onPick: (it: SlashItem) => void;
  onHover: (i: number) => void;
}) {
  const { t } = useI18n();
  let list: HTMLDivElement | undefined;

  // Below the caret, or above it when the list would run off the bottom.
  const style = () => {
    const r = props.rect;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - 248);
    return r.bottom + 300 > window.innerHeight && r.top > 300
      ? { left: `${left}px`, top: `${r.top - 4}px`, transform: "translateY(-100%)" }
      : { left: `${left}px`, top: `${r.bottom + 4}px` };
  };

  createEffect(() => {
    list?.querySelector(`[data-i="${props.active}"]`)?.scrollIntoView({ block: "nearest" });
  });

  return (
    <Portal mount={topLayer()}>
      <div
        ref={list}
        data-editor-popup
        role="listbox"
        aria-label={t("editor.slash_menu")}
        class="fixed z-[70] w-60 max-h-72 overflow-y-auto py-1 rounded-lg border border-rim bg-surface shadow-xl"
        style={style()}
      >
        <For each={props.items}>
          {(it, i) => (
            <div
              role="option"
              data-i={i()}
              aria-selected={i() === props.active}
              onMouseDown={(e) => { e.preventDefault(); props.onPick(it); }}
              onMouseEnter={() => props.onHover(i())}
              class={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${i() === props.active ? "bg-elevated text-txt" : "text-muted"}`}
            >
              <span class="w-4 h-4 shrink-0 flex items-center justify-center">{it.icon}</span>
              <span class="truncate">{it.label}</span>
            </div>
          )}
        </For>
      </div>
    </Portal>
  );
}
