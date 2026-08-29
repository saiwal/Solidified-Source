// Local message store — the mail-client half of offline support.
//
// offline-fallback.ts caches whole HTTP responses per URL; that keeps the app
// from erroring offline but it is a snapshot cache, not a mailbox. This is the
// mailbox: message headers accumulate in IndexedDB, folders are indexes into
// them, and the UI reads from disk whether or not there's a network.
//
//   entries: b64mid       -> MessageEntry  (list headers, one per message)
//   lists:   listKey      -> b64mid[]      (ordered index per feed/folder)
//   posts:   uuid | mid   -> raw item      (full bodies, for reading offline)
//
// The inbox builds all three up front when opened; HQ and the network/channel
// feeds only ever add what they already fetched.
//
// idb-keyval gives one object store per database, hence three databases rather
// than three stores in one.

import { createStore, get, set, getMany, setMany, delMany, keys } from "idb-keyval";
import { apiFetch, apiError } from "./fetch";

const entryDb = createStore("hz-inbox-entries", "entries");
const listDb = createStore("hz-inbox-lists", "lists");
// Full items, as opposed to the list headers above. Filled incrementally by
// whatever the app already fetched — stream pages carry complete post bodies,
// so nothing here costs an extra request.
const postDb = createStore("hz-inbox-posts", "posts");

// Starred and filed messages are what the user deliberately kept, so their
// indexes are never trimmed. Everything else keeps a recent window.
const LIST_CAP = 500;
// Message bodies pre-fetched per sync so messages are readable, not just
// listed, offline. Sequential and capped — this runs in the background at boot.
const BODY_WARM_CAP = 200;
// Smaller budget for the "you just opened this list" pass, which fires on every
// list load including MessageList's 30s poll.
const PAGE_WARM_CAP = 30;

export type MessageType = "" | "direct" | "starred" | "notification";
export type FeedType = MessageType | "folder";

export interface MessageEntry {
  b64mid: string;
  created: string;
  /** Subject line (item title) — a DM's subject, usually. Absent on entries
   *  cached before this field existed, hence optional. */
  title?: string;
  summary: string;
  info: string;
  author_name: string;
  author_addr: string;
  href: string;
  icon: string;
  // The backend sends a real count when there are unseen replies, but falls
  // back to a non-numeric placeholder ("&#8192;") when the top-level item
  // itself is unseen and has no replies yet (see Messages.php::get_messages_page) —
  // so this isn't always a number.
  unseen_count: number | string;
  unseen_class: string;
  author_img: string;
}

export interface MessagesPage {
  offset: number;
  entries: MessageEntry[];
}

export interface FetchMessagesParams {
  offset: number;
  type: MessageType | "filed";
  file: string;
  search: string;
  /** Restrict to threads involving this xchan hash (ChanView's DM history). */
  xchan?: string;
  signal?: AbortSignal;
}

const listKey = (type: string, file: string) => `${type}|${file}`;
const isPinned = (key: string) => key.startsWith("starred|") || key.startsWith("filed|");

// ── store ────────────────────────────────────────────────────────────────

async function saveList(key: string, entries: MessageEntry[]): Promise<void> {
  const kept = isPinned(key) ? entries : entries.slice(0, LIST_CAP);
  await setMany(kept.map((e) => [e.b64mid, e] as [string, MessageEntry]), entryDb);
  await set(key, kept.map((e) => e.b64mid), listDb);
}

async function readList(key: string): Promise<MessageEntry[]> {
  const ids = (await get<string[]>(key, listDb)) ?? [];
  if (!ids.length) return [];
  const rows = await getMany<MessageEntry | undefined>(ids, entryDb);
  return rows.filter((e): e is MessageEntry => !!e);
}

// Drops entries no list points at any more — the only way stored messages are
// ever deleted, so a message stays as long as some folder still lists it.
export async function pruneInbox(): Promise<void> {
  const listKeys = (await keys(listDb)) as string[];
  const live = new Set<string>();
  for (const k of listKeys) {
    for (const id of (await get<string[]>(k, listDb)) ?? []) live.add(id);
  }
  const stored = (await keys(entryDb)) as string[];
  const dead = stored.filter((id) => !live.has(id));
  if (dead.length) await delMany(dead, entryDb);
}

// ── post bodies ──────────────────────────────────────────────────────────
//
// Written by the stream fetchers and by fetchDisplayItem as posts go past, so
// HQ and the network/channel feeds build their offline copy incrementally
// rather than importing anything up front. Read back when opening a post with
// no connection.

const POST_CAP = 1000;
let savesSincePrune = 0;

interface StoredPost {
  item: any;
  t: number;
}

export async function savePosts(items: any[]): Promise<void> {
  const t = Date.now();
  const rows: [string, StoredPost][] = [];
  for (const item of items) {
    if (!item) continue;
    // Callers open posts by uuid (streams) or by mid (permalinks), and
    // /spa/display accepts either, so index both.
    for (const id of [item.uuid, item.mid]) {
      if (id) rows.push([String(id), { item, t }]);
    }
  }
  if (!rows.length) return;
  await setMany(rows, postDb);
  if (++savesSincePrune >= 20) {
    savesSincePrune = 0;
    void prunePosts();
  }
}

export async function getStoredPost(id: string): Promise<any | undefined> {
  return (await get<StoredPost>(id, postDb))?.item;
}

// Oldest-written first. Two keys per post, so the cap is roughly half as many
// posts as entries — deliberately loose, this only exists to stop unbounded
// growth on a heavy scroller.
async function prunePosts(): Promise<void> {
  const ks = (await keys(postDb)) as string[];
  if (ks.length <= POST_CAP) return;
  const rows = await getMany<StoredPost | undefined>(ks, postDb);
  const oldestFirst = ks
    .map((k, i) => [k, rows[i]?.t ?? 0] as [string, number])
    .sort((a, b) => a[1] - b[1])
    .slice(0, ks.length - POST_CAP)
    .map(([k]) => k);
  await delMany(oldestFirst, postDb);
}

// ── read-through fetch ───────────────────────────────────────────────────

// Drop-in for the old MessageList-local fetcher. Online it fetches and records;
// offline it answers from the store. A search or a paged request has nothing
// stored to fall back on, so those end the list rather than raising — an
// "end of messages" reads better offline than a retry button that can't work.
export async function fetchMessages(params: FetchMessagesParams): Promise<MessagesPage> {
  const qs = new URLSearchParams({
    offset: String(params.offset),
    type: params.type,
    file: params.file,
    search: params.search,
    ...(params.xchan ? { xchan: params.xchan } : {}),
  });
  // A filtered slice must never be written under the unfiltered list key.
  const cacheable = params.offset === 0 && !params.search.trim() && !params.xchan;
  const key = listKey(params.type, params.file);

  try {
    const res = await apiFetch(`/spa/hq-messages?${qs}`, { signal: params.signal });
    if (!res.ok) throw await apiError(res);
    const { data, meta } = await res.json();
    const page: MessagesPage = { entries: data ?? [], offset: meta?.offset ?? -1 };
    if (cacheable) {
      // Saving headers is one write and keeps every message list readable
      // offline, so it always happens. Fetching bodies is the expensive part
      // and only runs while the inbox is open.
      await saveList(key, page.entries);
      if (inboxActive) void warmBodies(page.entries.map((e) => e.b64mid), PAGE_WARM_CAP);
    }
    return page;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    if (!cacheable) return { entries: [], offset: -1 };
    const entries = await readList(key);
    if (!entries.length) throw err;
    return { entries, offset: -1 };
  }
}

// ── sync ─────────────────────────────────────────────────────────────────

async function folderNames(): Promise<string[]> {
  try {
    const { data } = await apiFetch("/spa/folders").then((r) => r.json());
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// Pulls message bodies into offline-fallback's cache. A synced list only gives
// headers — without this, opening a message offline still hits the network for
// /spa/display and fails. Comments aren't warmed; PostDetailModal renders the
// root without them when they can't be loaded.
//
// Sequential and budgeted: this runs in the background behind a live UI, and
// already-stored bodies are skipped, so only a first sync does real work.
// Passes are chained rather than dropped when one is already running: the
// per-list warm fires on every poll, and dropping would let it starve the
// larger sync pass (or the reverse) depending on which happened to win.
let warmChain: Promise<void> = Promise.resolve();

async function runWarm(ids: string[], budget: number): Promise<void> {
  for (const id of ids) {
    // Re-checked every iteration so navigating away from the inbox stops an
    // in-flight pass instead of letting it run on in the background.
    if (budget <= 0 || !navigator.onLine || !inboxActive) return;
    if (await getStoredPost(id)) continue;
    budget--;
    // Same store the stream fetchers write to, so a post is only ever fetched
    // for one of them.
    await fetch(`/spa/display/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const post = (json?.data ?? json)?.post;
        if (post) return savePosts([post]);
      })
      .catch(() => {});
  }
}

function warmBodies(ids: string[], budget: number): Promise<void> {
  warmChain = warmChain.then(() => runWarm(ids, budget)).catch(() => {});
  return warmChain;
}

// Kept messages first — those are the ones the user asked to have around —
// then the rest of what's been synced.
async function warmAllLists(): Promise<void> {
  const listKeys = (await keys(listDb)) as string[];
  const ordered = [...listKeys.filter(isPinned), ...listKeys.filter((k) => !isPinned(k))];
  const ids: string[] = [];
  for (const k of ordered) ids.push(...((await get<string[]>(k, listDb)) ?? []));
  await warmBodies([...new Set(ids)], BODY_WARM_CAP);
}

let syncing = false;
let lastSync = 0;
// Opening the inbox, or moving between its sections, remounts the view — that
// shouldn't re-walk every feed and folder each time.
const SYNC_INTERVAL = 5 * 60_000;

// Set by the inbox view while it's mounted. Body warming is minutes of
// background requests on a large mailbox, so it's confined to the module the
// user actually opened rather than running on every page load.
let inboxActive = false;

export function setInboxActive(active: boolean): void {
  inboxActive = active;
}

// Refreshes every feed and folder index, then message bodies. Skipped while
// offline, already running, or recently synced — pass force for the refresh
// button.
export async function syncInbox(force = false): Promise<void> {
  if (syncing || !navigator.onLine) return;
  if (!force && Date.now() - lastSync < SYNC_INTERVAL) return;
  syncing = true;
  try {
    const feeds: Array<[MessageType | "filed", string]> = [
      ["", ""],
      ["direct", ""],
      ["starred", ""],
      ["notification", ""],
      ...(await folderNames()).map((f) => ["filed", f] as [ "filed", string ]),
    ];
    for (const [type, file] of feeds) {
      await fetchMessages({ offset: 0, type, file, search: "" }).catch(() => {});
    }
    await warmAllLists();
    await pruneInbox();
    lastSync = Date.now();
  } finally {
    syncing = false;
  }
}
