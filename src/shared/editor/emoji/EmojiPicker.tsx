/**
 * EmojiPicker.tsx
 * Standalone emoji picker with search — no external dropdown dependencies.
 */

import { createSignal, createMemo, For, Show } from "solid-js";
import { MdOutlineEmoji_emotions } from "solid-icons/md";
import { getEmojiMap, type EmojiEntry } from "@utsukta/spa-core/store/emoji-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";
import { Input } from "@ui/Field";
import { iconButtonClass } from "@ui/Button";

export interface EmojiPickerProps {
  onSelect: (entry: EmojiEntry) => void;
  /** Override the trigger button's icon/label (defaults to a solid-icons smiley). */
  triggerIcon?: any;
  /** Override the trigger button's classes (defaults to the EditorToolbar Btn style). */
  triggerClass?: string;
}

export default function EmojiPicker(props: EmojiPickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = createSignal("");

  // Prefers opening above the trigger — the toolbar sits at the bottom of the
  // editor, so downward pushes the panel past the modal/page edge. flip()
  // drops it below only when there is genuinely no room above.
  const { open, setOpen, toggle, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "top-start", offset: 4 });

  const entries = createMemo(() => Object.values(getEmojiMap()));

  const filtered = createMemo<EmojiEntry[]>(() => {
    const q = query().trim().toLowerCase();
    if (!q) return entries();
    return entries().filter((e) => e.shortname.toLowerCase().includes(q));
  });

  const triggerClass = () =>
    props.triggerClass ??
    `${iconButtonClass("default", "sm")} ${open() ? "bg-elevated text-txt" : ""}`;

  return (
    <>
      <button
        ref={setTriggerRef}
        type="button"
        title={t("editor.emoji_picker_title")}
        onClick={toggle}
        class={triggerClass()}
      >
        {props.triggerIcon ?? <MdOutlineEmoji_emotions class="w-4 h-4" />}
      </button>

      <Show when={open()}>
        <div
          ref={setPanelRef}
          class="z-50 w-64 bg-surface border border-rim rounded-xl shadow-xl overflow-hidden flex flex-col"
          style={floatStyle()}
        >
          {/* Search input */}
          <div class="p-2 border-b border-rim">
            <Input
              size="sm"
              class="w-full"
              autofocus
              type="text"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              placeholder={t("editor.emoji_search_placeholder")}
            />
          </div>

          {/* Emoji grid */}
          <div class="p-2 grid grid-cols-8 gap-1 max-h-56 overflow-y-auto">
            <For each={filtered()}>
              {(entry) => (
                <button
                  type="button"
                  title={entry.shortname}
                  onClick={() => {
                    props.onSelect(entry);
                    setOpen(false);
                    setQuery("");
                  }}
                  class="w-7 h-7 flex items-center justify-center rounded hover:bg-elevated transition-colors"
                >
                  <img
                    src={`/${entry.filepath}`}
                    alt={entry.shortname}
                    class="w-5 h-5 object-contain"
                  />
                </button>
              )}
            </For>
            <Show when={filtered().length === 0}>
              <span class="col-span-8 text-xs text-muted text-center py-2">
                {t("editor.emoji_no_results")}
              </span>
            </Show>
          </div>
        </div>
      </Show>
    </>
  );
}
