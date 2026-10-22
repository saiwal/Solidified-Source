// "Move to folder" dropdown for an inbox row and for the bulk bar.
//
// Deliberately not PostCard's FolderPicker: that one is a chip grid that fetches
// the item's own folders on open (apiFetchItemFolders) and renders inline under
// a post. The inbox already knows a row's folders - HqMessages sends them - and
// needs a popover, so this is the smaller thing rather than a generalisation of
// the bigger one.
import { For, Show, createSignal, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { TRASH } from "./actions";
import { Button } from "@ui/Button";
import { Menu, MenuItem, useMenu } from "@ui/Menu";
import { Input } from "@ui/Field";

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
  const [draft, setDraft] = createSignal("");

  // Trash is reachable through the trash button; listing it here too invites
  // "moved to Trash" toasts from a menu that is about filing.
  const listed = () => props.folders.filter((f) => f !== TRASH);

  return (
    <Menu
      label={props.title}
      class="w-56 max-h-72 overflow-y-auto"
      onOpenChange={(o) => { if (!o) setDraft(""); }}
      trigger={(p) => (
        <button type="button" title={props.title} aria-label={props.title} class={props.class} {...p}>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d={FOLDER_ICON} />
          </svg>
        </button>
      )}
    >
      <For each={listed()}>
        {(name) => (
          <MenuItem
            icon={
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d={FOLDER_ICON} />
              </svg>
            }
            onClick={() => props.onPick(name)}
          >
            <span class="truncate flex-1">{name}</span>
            <Show when={props.current?.includes(name)}>
              <span class="text-accent-txt">✓</span>
            </Show>
          </MenuItem>
        )}
      </For>

      <Show when={listed().length === 0}>
        <p class="px-3 py-1.5 text-xs text-muted">{t("post.no_folders_yet")}</p>
      </Show>

      <NewFolderForm draft={draft()} setDraft={setDraft} onPick={props.onPick} />
    </Menu>
  );
};

// Inside the menu so it can close it on submit — a form isn't a MenuItem.
function NewFolderForm(props: { draft: string; setDraft: (v: string) => void; onPick: (name: string) => void }) {
  const { t } = useI18n();
  const menu = useMenu();
  return (
    <form
      class="flex gap-1 mt-1 pt-1.5 border-t border-rim"
      onSubmit={(e) => {
        e.preventDefault();
        const name = props.draft.trim();
        if (!name) return;
        menu.close();
        props.setDraft("");
        props.onPick(name);
      }}
    >
      <Input
        size="sm"
        class="flex-1 min-w-0"
        value={props.draft}
        onInput={(e) => props.setDraft(e.currentTarget.value)}
        placeholder={t("hq.new_folder")}
      />
      <Button size="sm" type="submit" disabled={!props.draft.trim()}>
        {t("hq.add")}
      </Button>
    </form>
  );
}

export default FolderMenu;
