// "Move to folder" dropdown for an inbox row and for the bulk bar.
//
// Deliberately not PostCard's FolderPicker: that one is a chip grid that fetches
// the item's own folders on open (apiFetchItemFolders) and renders inline under
// a post. The inbox already knows a row's folders - HqMessages sends them - and
// needs a popover, so this is the smaller thing rather than a generalisation of
// the bigger one.
import { For, Show, createSignal, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createPopover } from "@/shared/stream/filters/createPopover";
import { TRASH } from "./actions";

const FOLDER_ICON =
  "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z";

export const FolderMenu: Component<{
  folders: string[];
  /** Folders the target(s) are already in - shown ticked. */
  current?: string[];
  onPick: (name: string) => void;
  title: string;
  class?: string;
  children?: never;
}> = (props) => {
  const { t } = useI18n();
  const pop = createPopover({ placement: "bottom-end" });
  const [draft, setDraft] = createSignal("");

  const pick = (name: string) => {
    pop.setOpen(false);
    setDraft("");
    props.onPick(name);
  };

  // Trash is reachable through the trash button; listing it here too invites
  // "moved to Trash" toasts from a menu that is about filing.
  const listed = () => props.folders.filter((f) => f !== TRASH);

  return (
    <>
      <span ref={pop.ref}>
        <button
          type="button"
          title={props.title}
          aria-label={props.title}
          onClick={(e) => { e.stopPropagation(); pop.setOpen(!pop.open()); }}
          class={props.class}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d={FOLDER_ICON} />
          </svg>
        </button>
      </span>

      <Show when={pop.open()}>
        <Portal mount={topLayer()}>
          <div
            ref={pop.floating}
            style={pop.style()}
            class="z-50 w-56 max-h-72 overflow-y-auto rounded-xl border border-rim
                   bg-surface shadow-xl p-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <For each={listed()}>
              {(name) => (
                <button
                  type="button"
                  onClick={() => pick(name)}
                  class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2
                         hover:bg-overlay text-txt"
                >
                  <svg class="w-3.5 h-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d={FOLDER_ICON} />
                  </svg>
                  <span class="truncate flex-1">{name}</span>
                  <Show when={props.current?.includes(name)}>
                    <span class="text-accent">✓</span>
                  </Show>
                </button>
              )}
            </For>

            <Show when={listed().length === 0}>
              <p class="px-2.5 py-1.5 text-xs text-muted">{t("post.no_folders_yet")}</p>
            </Show>

            <form
              class="flex gap-1 mt-1 pt-1.5 border-t border-rim"
              onSubmit={(e) => {
                e.preventDefault();
                const name = draft().trim();
                if (name) pick(name);
              }}
            >
              <input
                value={draft()}
                onInput={(e) => setDraft(e.currentTarget.value)}
                placeholder={t("hq.new_folder")}
                class="flex-1 min-w-0 text-xs bg-overlay border-0 rounded-lg px-2 py-1.5
                       text-txt placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={!draft().trim()}
                class="px-2 rounded-lg text-xs bg-accent text-accent-fg disabled:opacity-40"
              >
                {t("hq.add")}
              </button>
            </form>
          </div>
        </Portal>
      </Show>
    </>
  );
};

export default FolderMenu;
