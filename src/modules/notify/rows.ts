// Pure row/bucket logic for the notifications panel, split out of
// NotificationsAside.tsx so its invariants are testable without a DOM.
// Check: node --experimental-strip-types src/modules/notify/rows.test.ts

export interface HzNotification {
  notify_id?: number;
  notify_link?: string;
  b64mid?: string;
  name?: string;
  url?: string;
  photo?: string;
  when?: string;
  message?: string;
  hclass?: string;
  addr?: string;
  thread_top?: boolean;
  // Stable identity stamped by normalise(). Rows have no single server-side id
  // — stream rows carry b64mid, notify rows carry notify_id, intros carry
  // neither — so reconcile() needs one synthesised key to diff against.
  _k?: string;
}

export interface StreamBucket {
  count: number;
  notifications: HzNotification[];
  offset?: number;
}

export type SseResponse = Record<
  string,
  StreamBucket | { notifications: HzNotification[] }
>;

export interface NormalisedPayload {
  buckets: Record<string, StreamBucket>;
  forumKeys: string[];
  // The bucket keys this payload actually carried. A /sse push is a delta —
  // core's own client walks Object.keys(obj) for exactly this reason — so a
  // bucket the push omitted must be left alone, not zeroed.
  present: string[];
}

// Core's Sse_bs::$limit. Every bs_* method pages at 30 except bs_notify(),
// which has no LIMIT at all and ships the whole unseen notify table on every
// poll — so we cap every bucket here rather than trusting the payload.
export const PAGE = 30;

// The fixed buckets, in panel order. Forums are not one of them: core emits one
// forum_<abook_id> bucket per forum and only fills the selected one, so they are
// spliced in at render time by displayKeys().
export const DISPLAY_ORDER = [
  "network",
  "dm",
  "home",
  "notify",
  "intros",
  "pubs",
  "files",
  "all_events",
  "register",
];

// Where the per-forum sections sit in the panel — after intros, matching the
// order Zotlabs\Widget\Notifications builds its accordion in.
const FORUMS_AFTER = "intros";

export function displayKeys(forumKeys: string[]): string[] {
  const out: string[] = [];
  for (const k of DISPLAY_ORDER) {
    out.push(k);
    if (k === FORUMS_AFTER) out.push(...forumKeys);
  }
  return out;
}

// Buckets core's Zotlabs\Module\Notifications switch has a markRead branch
// for. Everything else (intros, files, register) falls through its default and
// clears nothing, so those have to go through sse_rmids instead.
const MARKREAD_KEYS = new Set([
  "network", "dm", "home", "notify", "all_events", "pubs",
]);

export function supportsMarkRead(key: string): boolean {
  return MARKREAD_KEYS.has(key) || key.startsWith("forum_");
}

// Buckets core serves rows for via GET /sse_bs/<key>, and the only ones its
// widget offers the name / conversation-starters filters on.
const FETCHABLE = new Set(["network", "dm", "home", "pubs"]);

export function isFetchable(key: string): boolean {
  return FETCHABLE.has(key) || key.startsWith("forum_");
}

// A row's stable identity across snapshots. Without it every poll hands <For>
// brand-new object references and it tears down and rebuilds the whole list.
export function rowKey(n: HzNotification): string {
  if (n.b64mid) return n.b64mid;
  if (n.notify_id != null) return `n${n.notify_id}`;
  return `${n.notify_link ?? ""}|${n.when ?? ""}`;
}

export function stampRows(rows: HzNotification[]): HzNotification[] {
  return rows.map((n) => (n._k ? n : { ...n, _k: rowKey(n) }));
}

// Dedupe on the synthesised key, not b64mid alone: intros and many notify rows
// have no b64mid, and treating those as always-fresh re-prepended them (and
// fired a desktop alert for each) on every SSE push and every reconnect.
export function prependDeduped(
  existing: HzNotification[],
  incoming: HzNotification[],
): HzNotification[] {
  const seen = new Set(existing.map((n) => n._k));
  const fresh = incoming.filter((n) => !seen.has(n._k));
  return [...fresh, ...existing].slice(0, PAGE);
}

export function normalise(raw: SseResponse): NormalisedPayload {
  const buckets: Record<string, StreamBucket> = Object.fromEntries(
    DISPLAY_ORDER.map((k) => [k, { count: 0, notifications: [], offset: -1 }]),
  );
  const forumKeys: string[] = [];
  const present: string[] = [];

  for (const [key, val] of Object.entries(raw)) {
    if (key === "notice" || key === "info") continue;
    const bucket = val as StreamBucket;
    // core's bs_forums() emits a bare `forum` key for the empty case — the
    // underscore is what distinguishes a real forum_<abook_id> bucket.
    const isForum = key.startsWith("forum_");
    if (isForum) forumKeys.push(key);
    if (!isForum && !(key in buckets)) continue;
    present.push(key);
    buckets[key] = {
      // The badge keeps the server's real total; the list is capped so an
      // unbounded bucket can't render thousands of rows.
      count: bucket.count ?? 0,
      notifications: stampRows(bucket.notifications ?? []).slice(0, PAGE),
      offset: bucket.offset ?? -1,
    };
  }
  return { buckets, forumKeys, present };
}

// Paging appends rather than prepends, and must not re-add a row a previous
// page already delivered — core's offsets are stable only for as long as
// $_SESSION['sse_loadtime'] holds, and a mark-seen in between can shift them.
export function appendDeduped(
  existing: HzNotification[],
  incoming: HzNotification[],
): HzNotification[] {
  const seen = new Set(existing.map((n) => n._k));
  return [...existing, ...incoming.filter((n) => !seen.has(n._k))];
}

// The two client-side filters core applies by CSS class over already-fetched
// rows. Rows with no thread_top at all (notify, intros) are kept, matching
// core's `[data-thread_top="false"]` selector.
export function applyFilters(
  rows: HzNotification[],
  text: string,
  startersOnly: boolean,
): HzNotification[] {
  const q = text.trim().toLowerCase();
  if (!q && !startersOnly) return rows;
  return rows.filter((n) => {
    if (startersOnly && n.thread_top === false) return false;
    if (!q) return true;
    return (
      (n.name ?? "").toLowerCase().includes(q) ||
      (n.addr ?? "").toLowerCase().includes(q)
    );
  });
}

// Core caps every count query at pconfig system/notifications_count_limit and
// renders the saturated value as "<limit - 1>+", so the badge has to use the
// same number or it claims a precision the query never had.
export function formatCount(count: number, limit: number): string {
  return limit > 0 && count >= limit ? `${limit - 1}+` : String(count);
}
