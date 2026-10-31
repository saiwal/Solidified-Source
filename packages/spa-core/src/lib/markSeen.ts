import { apiFetch } from "./fetch";
import { editingWidgets } from "../store/widget-layout";
import { queryClient } from "./query-client";

// Network filters' per-forum/connection unread badges count item_unseen.
const refreshUnreadBadges = () => queryClient.invalidateQueries({ queryKey: ["network-conns"] });

/**
 * Mark a Hubzilla notification (notify table) as seen.
 * Core's Zotlabs\Module\Notify::init() expects a notify_id request
 * parameter (see view/js/main.js) and responds with an empty body.
 */
export function markNotifySeen(nid: number): Promise<void> {
  return fetch("/notify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ notify_id: String(nid) }).toString(),
    credentials: "include",
  }).then(
    () => {},
    () => {},
  );
}

/**
 * Mark whole notification buckets seen, in one request.
 * POST /spa/notifications/markread mirrors core's /notifications?markRead=
 * switch — network, home, dm, all_events, notify, pubs and forum_<abook_id>;
 * anything else is ignored — but without core's lock-heavy range UPDATE.
 */
export async function markAllSeen(keys: string | string[]): Promise<void> {
  const res = await apiFetch("/spa/notifications/markread", {
    method: "POST",
    body: JSON.stringify({ keys: ([] as string[]).concat(keys) }),
  });
  if (!res.ok) throw new Error("Failed to mark read");
  void refreshUnreadBadges();
}

// Accumulate UUIDs and flush as one batched request after a 1s idle.
const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  if (pending.size === 0) return;
  const uuids = [...pending].join(",");
  pending.clear();
  fetch("/sse_bs", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ sse_rmids: uuids }).toString(),
    credentials: "include",
  }).then(refreshUnreadBadges, () => {});
}

/**
 * Mark a stream item as seen via the sse_bs endpoint.
 * Calls are coalesced: UUIDs accumulate for 1 s then sent as one request.
 */
export function markItemSeen(uuid: string): void {
  // Scrolling past a post while arranging widgets isn't reading it — the user
  // is on their way to the footer slot, and marking the feed read on the way
  // there isn't something they can undo. Guarded here rather than at each
  // observer, since every caller funnels through this.
  if (editingWidgets()) return;
  pending.add(uuid);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 1000);
}
