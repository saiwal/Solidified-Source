// Mail actions for the inbox list - star, read/unread, move to folder, trash.
//
// Every one follows the same shape: patch the row locally (and in the offline
// store, so reloading offline doesn't show the pre-action state again), call
// the API, revert + toast on failure. Deleting is a move to the TRASH folder
// tag, so it stays reversible and federates nothing - HqMessages.php hides
// tagged items from every feed but the Trash folder view.
import { apiDeleteItem, apiSaveToFolder, apiSetSeen, apiSetStar } from "@utsukta/spa-core/lib/item-api";
import { fetchMessages, patchEntry, type MessageEntry } from "@utsukta/spa-core/lib/message-store";
import { toast } from "@utsukta/spa-core/store/toast";
import type { useI18n } from "@utsukta/spa-core/i18n";

/** Must match HqMessages::TRASH. */
export const TRASH = "Trash";

type T = ReturnType<typeof useI18n>["t"];
/** Applies a partial to the row in the list's own signal. */
export type PatchFn = (b64mid: string, partial: Partial<MessageEntry>) => void;

export function createInboxActions(t: T, patch: PatchFn) {
  // Local signal + IndexedDB in one call: the two must never disagree.
  function apply(b64mid: string, partial: Partial<MessageEntry>) {
    patch(b64mid, partial);
    void patchEntry(b64mid, partial);
  }

  async function run(b64mid: string, optimistic: Partial<MessageEntry>,
                     revert: Partial<MessageEntry>, call: () => Promise<unknown>): Promise<boolean> {
    apply(b64mid, optimistic);
    try {
      await call();
      return true;
    } catch (err) {
      apply(b64mid, revert);
      toast.error(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  const star = (e: MessageEntry, on = !e.starred) =>
    run(e.b64mid, { starred: on }, { starred: !on }, () => apiSetStar(e.b64mid, on));

  const setRead = (e: MessageEntry, read: boolean) =>
    run(e.b64mid,
        { unseen: !read, unseen_count: read ? "" : e.unseen_count },
        { unseen: !!e.unseen, unseen_count: e.unseen_count },
        () => apiSetSeen(e.b64mid, read));

  // The one folder primitive. Undo is literally the inverse call, which is why
  // add/remove are lists rather than a single "move" argument.
  async function changeFolders(
    e: MessageEntry, add: string[], remove: string[], undoLabel?: string,
  ): Promise<boolean> {
    const before = e.folders ?? [];
    const after = [
      ...before.filter((f) => !remove.includes(f)),
      ...add.filter((f) => !before.includes(f)),
    ];
    const ok = await run(e.b64mid, { folders: after }, { folders: before }, async () => {
      for (const f of add) await apiSaveToFolder(e.b64mid, f);
      for (const f of remove) await apiSaveToFolder(e.b64mid, f, true);
    });
    if (ok && undoLabel) {
      toast.success(undoLabel, 6000, () => {
        void changeFolders({ ...e, folders: after }, remove, add);
      });
    }
    return ok;
  }

  /** Drop into a folder. `from` is the folder the row is currently shown in, so
   *  a drag out of one folder into another moves rather than copies. */
  const moveToFolder = (e: MessageEntry, name: string, from?: string) =>
    changeFolders(e, [name], from && from !== name ? [from] : [],
                  t("hq.moved_to", { folder: name }));

  const trash = (e: MessageEntry) =>
    changeFolders(e, [TRASH], [], t("hq.moved_to_trash"));

  const untrash = (e: MessageEntry) => changeFolders(e, [], [TRASH]);

  /** ponytail: one request per row. A page is 30, so a bulk action is at most
   *  30 POSTs; add a batch verb only if that actually drags. */
  const bulk = (entries: MessageEntry[], fn: (e: MessageEntry) => Promise<unknown>) =>
    Promise.allSettled(entries.map(fn));

  return { star, setRead, moveToFolder, trash, untrash, changeFolders, bulk };
}

export type InboxActions = ReturnType<typeof createInboxActions>;

/**
 * Permanently delete every message in a folder — "empty Trash".
 *
 * Deliberately the per-item endpoint rather than a bulk one: deleting a post
 * has real rules (your own copy vs a federated delete of something you
 * authored, see Item.php::deleteItem) and a second implementation of those on
 * the server would be free to drift from the single-message delete.
 *
 * ponytail: one request per message, a page at a time. Trash is normally small
 * and emptying it is rare; add a server-side bulk verb if someone turns up with
 * thousands. Returns how many were actually deleted.
 */
export async function emptyFolder(name: string): Promise<number> {
  let deleted = 0;
  for (;;) {
    // Always offset 0: the rows just deleted have left the folder, so the
    // first page is always the remaining work.
    const page = await fetchMessages({ offset: 0, type: "filed", file: name, search: "" });
    if (!page.entries.length) break;

    const results = await Promise.allSettled(
      page.entries.map((e) => apiDeleteItem(e.b64mid)),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    deleted += ok;
    // Nothing on this page could be deleted (someone else's copy we lack
    // permission for) — stop rather than re-fetching the same page forever.
    if (ok === 0) break;
  }
  return deleted;
}
