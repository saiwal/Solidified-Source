/**
 * RecipientField.tsx
 * Always-visible "To:" field for the DM composer — a bordered row of
 * removable recipient chips + an inline search input, with a results
 * dropdown appearing below as the user types. Contacts only (no groups,
 * no allow/deny) — unlike AclPicker, since a privacy group in the payload
 * would set group_allow and break the server's DM auto-classification.
 */

import { createEffect, createSignal, For, Show, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { AclEntry } from "@/modules/network/api";
import { entryKey } from "./AclPicker";
import { useConnectionSearch } from "./useConnectionSearch";
import { useFloating } from "@utsukta/spa-core/lib/useFloating";

export interface RecipientFieldProps {
  /** Currently-selected recipients (resolved — full name/photo, not just a key). */
  entries: () => AclEntry[];
  onAdd: (entry: AclEntry) => void;
  onRemove: (entry: AclEntry) => void;
  placeholder?: string;
}

const RecipientField: Component<RecipientFieldProps> = (props) => {
  const { t } = useI18n();
  const [focused, setFocused] = createSignal(false);

  // "m" = Hubzilla's post_mail-filtered ACL list — only contacts who've
  // granted the local channel permission to send them a direct message.
  // "c" (used by AclPicker) would list *every* connection, including ones
  // whose DMs are guaranteed to be silently dropped by the recipient's hub.
  const search = useConnectionSearch("m", { initialCount: 8, searchCount: 20 });

  const results = () => {
    const selected = new Set(props.entries().map(entryKey));
    return search.list().filter((c) => !selected.has(entryKey(c)));
  };

  const open = () => focused() && results().length > 0;

  let rowRef: HTMLDivElement | undefined;
  let listRef: HTMLUListElement | undefined;
  const { x, y, mount, unmount } = useFloating({ placement: "bottom-start", offset: 4 });

  createEffect(() => {
    if (open() && rowRef && listRef) mount(rowRef, listRef);
    else unmount();
  });

  function select(entry: AclEntry) {
    props.onAdd(entry);
    search.setQuery("");
  }

  return (
    <div class="relative" data-tour="composer.recipient">
      <div
        ref={rowRef}
        class="flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded border border-rim bg-surface
               hover:border-rim-strong focus-within:border-rim-strong transition-colors"
      >
        <span class="text-xs text-muted shrink-0">{t("editor.to_label")}</span>
        <For each={props.entries()}>
          {(entry) => (
            <span class="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-elevated text-txt">
              <Show
                when={entry.photo}
                fallback={
                  <span class="w-4 h-4 rounded-full shrink-0 bg-accent-muted text-accent flex items-center justify-center text-[0.5625rem] font-semibold">
                    {entry.name[0]?.toUpperCase() ?? "?"}
                  </span>
                }
              >
                <img src={entry.photo} alt="" class="w-4 h-4 rounded-full shrink-0 object-cover" />
              </Show>
              {entry.name}
              <button
                type="button"
                onClick={() => props.onRemove(entry)}
                class="text-muted hover:text-txt leading-none"
              >
                ×
              </button>
            </span>
          )}
        </For>
        <input
          type="text"
          value={search.query()}
          placeholder={props.entries().length ? "" : (props.placeholder ?? t("editor.to_search_placeholder"))}
          onInput={(e) => search.setQuery(e.currentTarget.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          class="flex-1 min-w-24 bg-transparent text-sm text-txt outline-none placeholder:text-muted"
        />
      </div>

      <Portal>
      <Show when={open()}>
        <ul
          ref={listRef}
          style={{ position: "fixed", top: `${y()}px`, left: `${x()}px`, width: `${rowRef?.offsetWidth ?? 0}px` }}
          class="z-[60] max-h-56 overflow-y-auto rounded-lg border border-rim bg-surface shadow-xl py-1"
        >
          <For each={results()}>
            {(c) => (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); select(c); }}
                  class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-elevated transition-colors"
                >
                  <Show
                    when={c.photo}
                    fallback={
                      <span class="w-6 h-6 rounded-full shrink-0 bg-elevated flex items-center justify-center text-muted text-xs font-semibold">
                        {c.name[0]?.toUpperCase() ?? "?"}
                      </span>
                    }
                  >
                    <img src={c.photo} alt="" class="w-6 h-6 rounded-full shrink-0 object-cover bg-elevated" />
                  </Show>
                  <span class="flex flex-col min-w-0 flex-1">
                    <span class="truncate text-xs font-medium text-txt">{c.name}</span>
                    <Show when={c.link}>
                      <span class="truncate text-[0.625rem] text-muted">{c.link}</span>
                    </Show>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      </Portal>
    </div>
  );
};

export default RecipientField;
