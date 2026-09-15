// Is a mailbox entry unread?
//
// Its own module (type-only import, so nothing pulls in idb-keyval) because it
// is what drives the "new activity" badge on a message row, and it has a trap:
// `unseen` is the *thread top's* item_unseen, while `unseen_count` counts
// unseen replies underneath it. A thread whose root you have read but whose
// replies you haven't is unread, so `unseen === false` must not be able to
// short-circuit the reply count — doing exactly that is what silently removed
// the reply badge from HQ's Messages widget.
import type { MessageEntry } from "./message-store";

export function isEntryUnseen(e: MessageEntry): boolean {
  // Any one of these being true makes the thread unread; only all three being
  // false makes it read.
  if (e.unseen === true) return true;
  if (e.unseen_class === "primary") return true;
  const n = Number(e.unseen_count);
  return Number.isFinite(n) && n > 0;
}
