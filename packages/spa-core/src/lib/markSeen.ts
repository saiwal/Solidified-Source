import { editingWidgets } from "../store/widget-layout";

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
  }).catch(() => {});
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
