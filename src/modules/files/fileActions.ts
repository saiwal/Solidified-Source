// The one list of file actions, rendered by the toolbar — on the selection, or
// the open folder when nothing is selected. Kept free of UI imports so the
// rules stay testable in plain node.
//
// Two separate questions per action:
//   shown   — may this viewer ever use it? (write grant, ownership, local login)
//             Hidden when not.
//   enabled — can it act on *this* target? (count, the open folder, file type)
// The toolbar shows only actions passing both.
import type { FileMeta, WopiConfig } from "./api";
import { wopiEditable } from "./api";

export type FileAction =
  | "share" | "bookmark" | "permissions" | "wopiEdit" | "rename"
  | "moveCopy" | "categories" | "download" | "delete";

interface Rule {
  id: FileAction;
  /** Works on several items at once. */
  multi?: boolean;
  /** Works on the open folder when nothing is selected. */
  folder?: boolean;
  /** …even at the cloud root, which has no attach row of its own. */
  root?: boolean;
  need?: "write" | "owner" | "local";
  danger?: boolean;
}

/** Menu / toolbar order. */
export const FILE_ACTIONS: readonly Rule[] = [
  { id: "share",       folder: true },
  { id: "bookmark",    folder: true, need: "local", root: true },
  { id: "permissions", folder: true, need: "owner", multi: true },
  { id: "wopiEdit",                  need: "write" },
  { id: "rename",      folder: true, need: "write" },
  { id: "moveCopy",    folder: true, need: "write", multi: true },
  { id: "categories",  folder: true, need: "write" },
  { id: "download",    folder: true,                multi: true },
  // Never the open folder: a stray toolbar click must not delete where you stand.
  { id: "delete",                    need: "write", multi: true, danger: true },
];

export interface Viewer { canWrite: boolean; isOwner: boolean; isLocal: boolean }

export function actionShown(a: Rule, v: Viewer): boolean {
  return a.need === "write" ? v.canWrite
    : a.need === "owner" ? v.isOwner
    : a.need === "local" ? v.isLocal
    : true;
}

/** `isFolder`: the target is the open folder rather than a selection. */
export function actionEnabled(a: Rule, items: FileMeta[], isFolder: boolean, wopi: WopiConfig | null): boolean {
  if (!items.length) return false;
  if (isFolder && !a.folder) return false;
  if (isFolder && items[0].hash === "" && !a.root) return false;
  if (items.length > 1 && !a.multi) return false;
  if (a.id === "wopiEdit") return wopiEditable(wopi, items[0]);
  return true;
}
