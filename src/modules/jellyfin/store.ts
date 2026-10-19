// Session + player state. Module-level on purpose: the <audio> element is
// created here, outside any component, so playback survives every route change
// and widget remount. The NowPlaying widget is only a view onto it.
import { createSignal } from "solid-js";
import { vaultList, vaultPut, vaultDelete, vaultStatus, vaultSlots } from "@utsukta/spa-core/lib/vault";
import {
  loadStore, saveStore, logout, streamUrl, imageUrl, ticksToSeconds, quickConnectNewDevice, JellyfinError,
  reportStart, reportProgress, reportStopped,
  type JellyfinStore, type JellyfinSession, type JfItem,
} from "./api";

// ── Servers ───────────────────────────────────────────────────────────────────

const [store, setStoreSignal] = createSignal<JellyfinStore>(loadStore());

function setStore(st: JellyfinStore): void {
  saveStore(st);
  setStoreSignal(st);
}

export const servers = () => store().servers;

/**
 * Refresh each server's display name from its public info. A session migrated
 * from the single-server format was named after its address (it never stored
 * a ServerName), and a server can be renamed; either way the header should
 * show the name. Unauthenticated endpoint; failures keep the old name.
 */
async function refreshServerNames(): Promise<void> {
  const updates = await Promise.all(store().servers.map(async (s) => {
    try {
      const info = await (await fetch(`${s.server}/System/Info/Public`)).json();
      const name = typeof info?.ServerName === "string" ? info.ServerName.trim() : "";
      return name && name !== s.name ? { id: s.id, name } : null;
    } catch {
      return null;
    }
  }));
  const changed = updates.filter((u): u is { id: string; name: string } => !!u);
  if (!changed.length) return;
  const st = store();
  setStore({ ...st, servers: st.servers.map((s) => ({ ...s, name: changed.find((c) => c.id === s.id)?.name ?? s.name })) });
}
if (typeof window !== "undefined") void refreshServerNames();
export const deviceId = () => store().deviceId;
export const sessionFor = (id: string | undefined): JellyfinSession | null =>
  store().servers.find((s) => s.id === id) ?? null;
/** The server the library browser shows. Playback is per-track — see QItem. */
export const session = () => sessionFor(store().active ?? undefined);
export const isConnected = () => !!session();

/** Sign-in form open on top of a connected library ("Add server"). */
const [adding, setAdding] = createSignal(false);
export { adding, setAdding };
/** URL to pre-fill the sign-in form with (after an expired session). */
const [prefillUrl, setPrefillUrl] = createSignal("");
export { prefillUrl };

/** Open the sign-in form for another server, pre-filled (a party invite to a server we're not on). */
export function startAddServer(url: string): void {
  setPrefillUrl(url);
  setAdding(true);
}

export function setActive(id: string): void {
  setStore({ ...store(), active: id });
}

/**
 * Add a server and switch to it. Replaces an existing entry with the same
 * ServerId, or the same URL — a session migrated from the single-server format
 * is keyed by URL, having never stored a ServerId.
 */
export function addServer(s: JellyfinSession, activate = true): void {
  const st = store();
  const replaced = st.servers.filter((x) => x.id !== s.id && x.server === s.server).map((x) => x.id);
  const others = st.servers.filter((x) => x.id !== s.id && x.server !== s.server);
  setStore({
    ...st,
    active: activate || !st.active ? s.id : st.active,
    servers: [...others, s],
    hubSkip: (st.hubSkip ?? []).filter((id) => id !== s.id), // signing in again undoes a device-only sign-out
  });
  // Queued tracks from a replaced entry follow it to the new id
  if (replaced.length) setQueue(queue().map((q) => (replaced.includes(q.srv) ? { ...q, srv: s.id } : q)));
  setAdding(false);
  setPrefillUrl("");
}

/**
 * Sign out of one server: revoke its token, forget it, and drop its tracks
 * from the queue — they can't stream without the token. With `reconnect` the
 * sign-in form comes up pre-filled (used when the token has expired).
 */
export async function signOut(id: string, reconnect = false): Promise<void> {
  const st = store();
  const s = sessionFor(id);
  if (!s) return;
  dropServerFromQueue(id);
  const rest = st.servers.filter((x) => x.id !== id);
  setStore({
    ...st,
    servers: rest,
    active: st.active === id ? (rest[0]?.id ?? null) : st.active,
    // Signed out here only: the hub sync mustn't quietly sign this browser back in
    hubSkip: hubStored().has(id) ? [...new Set([...(st.hubSkip ?? []), id])] : st.hubSkip,
  });
  if (reconnect) {
    setPrefillUrl(s.server);
    setAdding(true);
  }
  await logout(s);
}

// ── Hub vault: sign-ins stored on the hub, for other browsers and clones ──────
//
// Opt-in ("Remember on my hub" at sign-in). What the hub keeps — end-to-end
// encrypted with the user's vault passphrase (spa-core/lib/vault.ts), so the
// hub and its admin can't read it — is an *anchor*: a separate Jellyfin
// session, labelled "Hubzilla (stored)", never used for playback. A browser
// without a session for a stored server uses the anchor to approve a token of
// its own through Quick Connect — every browser stays its own Jellyfin session,
// which remote control and SyncPlay rely on.

const VAULT = "jellyfin";

interface HubEntry {
  /** The Jellyfin ServerId — inside the encrypted entry, not in its slot name. */
  id: string;
  server: string;
  name: string;
  userId: string;
  userName: string;
  anchor: string;
  anchorDevice: string;
}

/** Server ids (ServerId) stored on the hub, as last read. */
const [hubStored, setHubStored] = createSignal<Set<string>>(new Set());
/** The hub has a vault this browser hasn't unlocked yet (the page offers to). */
const [vaultLocked, setVaultLocked] = createSignal(false);
/**
 * Why a hub-stored server couldn't sign this browser in: "revoked" (the
 * anchor was rejected), "off" (Quick Connect disabled on the server) or
 * "failed" (anything else; `detail` names the step). Shown on /jellyfin.
 */
export interface HubSyncError {
  server: string;
  name: string;
  /** "empty": unlocked, nothing saved; "unreadable": saved entries that don't decrypt */
  kind: "revoked" | "off" | "failed" | "empty" | "unreadable";
  detail: string;
}
const [hubSyncError, setHubSyncError] = createSignal<HubSyncError | null>(null);
export { hubStored, vaultLocked, hubSyncError };

/**
 * The vault slot for a server: a hash, so the hub doesn't even learn which
 * Jellyfin server (its ServerId) an entry is for.
 */
async function slot(id: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`jellyfin:${id}`));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

const anchorSession = (id: string, e: HubEntry): JellyfinSession => ({
  id, name: e.name, server: e.server, userId: e.userId, userName: e.userName, token: e.anchor, deviceId: e.anchorDevice,
});

/**
 * Store a server on the hub: this browser's own session approves a new
 * "Hubzilla (stored)" session through Quick Connect, and that one becomes the
 * anchor. No second password sign-in — a reverse proxy rate-limiting logins
 * answered that one without CORS headers ("NetworkError") — so the password
 * is used exactly once, and an already signed-in server can be stored too.
 */
export async function rememberOnHub(s: JellyfinSession): Promise<void> {
  const anchorDevice = `hub-${crypto.randomUUID()}`;
  // Each step labelled, so a failure says which one
  const anchor = await quickConnectNewDevice(s, anchorDevice, "Hubzilla (stored)")
    .catch((e) => { throw new Error(`creating the stored sign-in: ${e instanceof Error ? e.message : e}`); });
  await vaultPut<HubEntry>(VAULT, await slot(s.id), {
    id: s.id,
    server: s.server, name: s.name, userId: s.userId, userName: s.userName, anchor: anchor.token, anchorDevice,
  }).catch((e) => { throw new Error(`saving to the hub: ${e instanceof Error ? e.message : e}`); });
  setHubStored(new Set([...hubStored(), s.id]));
}

/** Remove a server from the hub (and revoke its anchor). Browsers already signed in keep their own tokens. */
export async function forgetOnHub(id: string): Promise<void> {
  const key = await slot(id);
  // Revoking the anchor needs it decrypted; locked, the entry is still deleted
  const e = (await vaultList<HubEntry>(VAULT).catch(() => ({} as Record<string, HubEntry>)))[key];
  if (e) await logout(anchorSession(id, e));
  await vaultDelete(VAULT, key);
  const next = new Set(hubStored());
  next.delete(id);
  setHubStored(next);
}

let hubSync: Promise<void> | null = null;
/**
 * Once per page load: sign this browser in to every hub-stored server it
 * doesn't have yet. A revoked anchor or Quick Connect switched off just skips
 * that server; with nothing signed in at all, the sign-in form is pre-filled.
 */
export function syncFromHub(): Promise<void> {
  hubSync ??= (async () => {
    let entries: Record<string, HubEntry>;
    try {
      const status = await vaultStatus();
      setVaultLocked(status === "locked");
      if (status !== "unlocked") return;
      entries = await vaultList<HubEntry>(VAULT);
      // Say so when there's nothing usable — otherwise unlocking looks like it did nothing
      const total = await vaultSlots(VAULT);
      const opened = Object.keys(entries).length;
      if (!store().servers.length && opened === 0) {
        setHubSyncError(total
          ? { server: "", name: "", kind: "unreadable", detail: String(total) }
          : { server: "", name: "", kind: "empty", detail: "" });
      }
    } catch (err) {
      console.warn("[jellyfin] reading the hub vault failed", err);
      return;
    }
    setHubStored(new Set(Object.values(entries).map((e) => e.id)));
    const skip = new Set(store().hubSkip ?? []);
    let first: HubEntry | null = null;
    for (const e of Object.values(entries)) {
      const id = e.id;
      if (skip.has(id) || store().servers.some((x) => x.id === id || x.server === e.server)) continue;
      try {
        addServer(await quickConnectNewDevice(anchorSession(id, e), deviceId()), false);
      } catch (err) {
        console.warn("[jellyfin] hub sign-in failed for", e.server, err);
        const status = err instanceof JellyfinError ? err.status : 0;
        const detail = err instanceof Error ? err.message : String(err);
        setHubSyncError({
          server: e.server, name: e.name,
          kind: status === 401 && detail.startsWith("authorize") ? "revoked" : status === 403 ? "off" : "failed",
          detail,
        });
        first ??= e;
      }
    }
    if (first && !store().servers.length) startAddServer(first.server);
  })();
  return hubSync;
}

/** After the user unlocks the vault: sync again, now that it can be read. */
export function resyncFromHub(): Promise<void> {
  hubSync = null;
  setHubSyncError(null);
  return syncFromHub();
}

// ── Player ────────────────────────────────────────────────────────────────────

/**
 * A queued track plus the server it streams from (`srv` = JellyfinSession.id)
 * and its own queue-entry id — the same track can be queued twice, and
 * reorder/remove must address one entry, not every copy.
 */
export type QItem = JfItem & { srv: string; qid: string };
export type RepeatMode = "off" | "all" | "one";

const PLAYER_KEY = "hz-jellyfin-player";
const PERSIST_MAX = 500;

interface PlayerState {
  queue: QItem[];
  /** Queue order before shuffle was turned on, to restore when it's turned off. */
  unshuffled: QItem[] | null;
  index: number;
  position: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
}

function loadPlayer(): Partial<PlayerState> {
  try {
    return JSON.parse(localStorage.getItem(PLAYER_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

const saved = loadPlayer();
// Tracks from a server signed out since can't stream — drop them on restore
const savedQueue = Array.isArray(saved.queue) ? saved.queue.filter((q) => q?.Id && q.qid && sessionFor(q.srv)) : [];

const [queue, setQueue] = createSignal<QItem[]>(savedQueue);
const [unshuffled, setUnshuffled] = createSignal<QItem[] | null>(
  savedQueue.length && Array.isArray(saved.unshuffled) ? saved.unshuffled.filter((q) => sessionFor(q?.srv)) : null,
);
const [index, setIndex] = createSignal(savedQueue.length ? Math.min(Math.max(saved.index ?? 0, 0), savedQueue.length - 1) : -1);
const [playing, setPlaying] = createSignal(false);
const [position, setPosition] = createSignal(savedQueue.length ? (saved.position ?? 0) : 0);
const [duration, setDuration] = createSignal(0);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);
const [volume, setVolumeSignal] = createSignal(typeof saved.volume === "number" ? saved.volume : 1);
const [muted, setMutedSignal] = createSignal(!!saved.muted);
const [repeat, setRepeatSignal] = createSignal<RepeatMode>(saved.repeat ?? "off");

export { queue, index, playing, position, duration, loading, error, volume, muted, repeat };
export const shuffled = () => partyShuffle() ?? unshuffled() !== null;
export const current = () => queue()[index()] ?? null;
/** Session for the playing track — not necessarily the one being browsed. */
export const currentSession = () => sessionFor(current()?.srv);
/** Whether Next has somewhere to go (wraps under repeat-all). */
export const hasNext = () => index() < queue().length - 1 || (repeat() === "all" && queue().length > 0);
/** Duration for display: the element's once loaded, else the track's metadata (a resumed queue). */
export const displayDuration = () => duration() || ticksToSeconds(current()?.RunTimeTicks);

function persist(): void {
  try {
    const state: PlayerState = {
      queue: queue().slice(0, PERSIST_MAX),
      unshuffled: unshuffled()?.slice(0, PERSIST_MAX) ?? null,
      index: index(),
      position: audio?.currentTime ?? position(),
      volume: volume(),
      muted: muted(),
      repeat: repeat(),
    };
    localStorage.setItem(PLAYER_KEY, JSON.stringify(state));
  } catch { /* quota / private mode — resume just won't work */ }
}

let audio: HTMLAudioElement | null = null;
let lastReport = 0;
let lastPersist = 0;
/**
 * A queue restored from storage hasn't been loaded into <audio> yet — nothing
 * streams until the user presses play, which then resumes at this position.
 */
let resumeAt: number | null = savedQueue.length ? (saved.position ?? 0) : null;

window.addEventListener("pagehide", persist);

function el(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  // CORS mode, so the visualizer's analyser may read the samples — without it a
  // cross-origin stream routed through Web Audio plays as silence
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  audio.volume = volume();
  audio.muted = muted();
  audio.addEventListener("play", () => void ctx?.resume());
  audio.addEventListener("playing", () => { setPlaying(true); setLoading(false); setError(null); });
  audio.addEventListener("pause", () => {
    setPlaying(false);
    progress(true);
    persist();
  });
  audio.addEventListener("waiting", () => setLoading(true));
  audio.addEventListener("loadedmetadata", () => setDuration(audio!.duration || 0));
  audio.addEventListener("timeupdate", () => {
    setPosition(audio!.currentTime);
    if (Date.now() - lastReport > 10_000) progress(false);
    if (Date.now() - lastPersist > 5_000) { lastPersist = Date.now(); persist(); }
    syncPositionState();
  });
  audio.addEventListener("ended", () => {
    stoppedReport();
    if (inParty()) return party!.ended();
    if (repeat() === "one") playAt(index());
    else if (index() < queue().length - 1) playAt(index() + 1);
    else if (repeat() === "all" && queue().length) playAt(0);
    else { setPlaying(false); persist(); }
  });
  audio.addEventListener("error", () => {
    setLoading(false);
    setPlaying(false);
    setError("playback");
  });
  return audio;
}

function progress(paused: boolean) {
  const s = currentSession(), t = current();
  if (!s?.token || !t || resumeAt !== null) return;
  lastReport = Date.now();
  reportProgress(s, t.Id, el().currentTime, paused);
}

function stoppedReport() {
  const s = currentSession(), t = current();
  if (s?.token && t && resumeAt === null) reportStopped(s, t.Id, el().currentTime);
}

/** Jump to queue position `i` (the now-playing queue list). */
export function playAt(i: number, startAt = 0) {
  if (inParty()) return party!.playAt(i);
  const t = queue()[i];
  const s = sessionFor(t?.srv);
  if (!s?.token || !t) return;
  if (index() !== i && current()) stoppedReport();
  resumeAt = null;
  setIndex(i);
  setPosition(startAt);
  setDuration(0);
  setLoading(true);
  setError(null);
  const a = el();
  a.src = streamUrl(s, t.Id);
  if (startAt) a.addEventListener("loadedmetadata", () => { a.currentTime = startAt; }, { once: true });
  a.play().catch(() => setLoading(false)); // autoplay refusal — user hits play
  reportStart(s, t.Id, startAt);
  lastReport = Date.now();
  updateMediaSession();
  persist();
}

let qidSeq = 0;
const newQid = () => `${Date.now().toString(36)}-${(qidSeq++).toString(36)}`;
const tag = (s: JellyfinSession, items: JfItem[]): QItem[] => items.map((i) => ({ ...i, srv: s.id, qid: newQid() }));

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Replace the queue with tracks from server `s` and start at `start` (`startAt` seconds in). */
export function playList(s: JellyfinSession, items: JfItem[], start = 0, startAt = 0): void {
  if (inParty()) return party!.playList(s, items, start, startAt);
  const tagged = tag(s, items);
  if (shuffled()) {
    // Keep shuffle on: the chosen track first, the rest in random order
    const first = tagged[start];
    setUnshuffled(tagged);
    setQueue([first, ...shuffleArray(tagged.filter((q) => q !== first))]);
    playAt(0, startAt);
  } else {
    setQueue(tagged);
    playAt(start, startAt);
  }
}

/** Append to the queue; starts playing if nothing was loaded. */
export function enqueue(s: JellyfinSession, items: JfItem[]): void {
  if (inParty()) return party!.enqueue(s, items, false);
  const wasEmpty = !current();
  const tagged = tag(s, items);
  setQueue([...queue(), ...tagged]);
  if (unshuffled()) setUnshuffled([...unshuffled()!, ...tagged]);
  if (wasEmpty) playAt(queue().length - tagged.length);
  else persist();
}

/** Insert right after the current track. */
export function playNext(s: JellyfinSession, items: JfItem[]): void {
  if (inParty()) return party!.enqueue(s, items, true);
  if (!current()) return enqueue(s, items);
  const tagged = tag(s, items);
  const q = [...queue()];
  q.splice(index() + 1, 0, ...tagged);
  setQueue(q);
  if (unshuffled()) {
    const u = [...unshuffled()!];
    u.splice(u.indexOf(current()!) + 1, 0, ...tagged);
    setUnshuffled(u);
  }
  persist();
}

/** Remove one queue entry. Removing the playing one moves on to the next. */
export function removeFromQueue(qid: string): void {
  if (inParty()) return party!.remove(qid);
  const i = queue().findIndex((q) => q.qid === qid);
  if (i < 0) return;
  if (unshuffled()) setUnshuffled(unshuffled()!.filter((q) => q.qid !== qid));
  if (i === index()) {
    const q = queue().filter((x) => x.qid !== qid);
    if (!q.length) return stop();
    stoppedReport();
    setQueue(q);
    setIndex(-1); // so playAt doesn't report a stop for the wrong track
    playAt(Math.min(i, q.length - 1));
    return;
  }
  setQueue(queue().filter((x) => x.qid !== qid));
  if (i < index()) setIndex(index() - 1);
  persist();
}

/** Apply a drag-reordered list of qids; the playing entry keeps playing. */
export function reorderQueue(qids: string[]): void {
  if (inParty()) return party!.reorder(qids);
  const byId = new Map(queue().map((q) => [q.qid, q]));
  const playingQid = current()?.qid;
  const next = qids.map((id) => byId.get(id)).filter((q): q is QItem => !!q);
  if (next.length !== queue().length) return;
  setQueue(next);
  setIndex(next.findIndex((q) => q.qid === playingQid));
  persist();
}

export function toggle(): void {
  if (inParty()) return party!.toggle();
  if (!current()) return;
  // First play of a queue restored from storage: load it now, at the saved spot
  if (resumeAt !== null) return playAt(index(), resumeAt);
  const a = el();
  if (a.paused) a.play().catch(() => undefined);
  else a.pause();
}

/** Explicit pause/resume, for commands from other Jellyfin clients. */
export function pause(): void {
  if (inParty()) { if (playing()) party!.toggle(); return; }
  if (audio && !audio.paused) audio.pause();
}

export function resume(): void {
  if (inParty()) { if (!playing()) party!.toggle(); return; }
  if (current() && (resumeAt !== null || !audio || audio.paused)) toggle();
}

/**
 * Pause for a video starting here. Not in a listening party, though: that
 * would pause the music for the whole group.
 */
export function pauseForVideo(): void {
  if (!inParty() && audio && !audio.paused) audio.pause();
}

export function next(): void {
  if (inParty()) return party!.next();
  if (index() < queue().length - 1) playAt(index() + 1);
  else if (repeat() === "all" && queue().length) playAt(0);
}

export function prev(): void {
  if (inParty()) return party!.prev();
  // Same behaviour as every music player: restart unless near the start.
  if (position() > 3 || (index() === 0 && repeat() !== "all")) seek(0);
  else playAt(index() === 0 ? queue().length - 1 : index() - 1);
}

export function seek(sec: number): void {
  if (inParty()) return party!.seek(sec);
  if (resumeAt !== null) {
    // Not loaded yet: just move the resume point
    resumeAt = Math.max(0, sec);
    setPosition(resumeAt);
    persist();
    return;
  }
  const a = el();
  a.currentTime = Math.max(0, Math.min(sec, a.duration || sec));
  progress(a.paused);
}

export function setVolume(v: number): void {
  const vol = Math.max(0, Math.min(1, v));
  setVolumeSignal(vol);
  if (audio) audio.volume = vol;
  if (vol > 0 && muted()) setMuted(false);
  persist();
}

export function setMuted(m: boolean): void {
  setMutedSignal(m);
  if (audio) audio.muted = m;
  persist();
}

export function cycleRepeat(): void {
  if (inParty()) return party!.repeat();
  setRepeatSignal(repeat() === "off" ? "all" : repeat() === "all" ? "one" : "off");
  persist();
}

/**
 * Shuffle on: the current track stays put at the top, everything else is
 * randomised. Shuffle off: back to the original order, still on the same track.
 */
export function toggleShuffle(): void {
  if (inParty()) return party!.shuffle();
  const cur = current();
  if (unshuffled()) {
    const original = unshuffled()!;
    setUnshuffled(null);
    setQueue(original);
    setIndex(cur ? original.indexOf(cur) : -1);
  } else {
    const q = queue();
    setUnshuffled(q);
    const rest = shuffleArray(q.filter((x) => x !== cur));
    setQueue(cur ? [cur, ...rest] : rest);
    setIndex(cur ? 0 : -1);
  }
  persist();
}

export function stop(): void {
  if (audio) {
    stoppedReport();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  resumeAt = null;
  setQueue([]);
  setUnshuffled(null);
  setIndex(-1);
  setPlaying(false);
  setPosition(0);
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
  persist();
}

function dropServerFromQueue(id: string): void {
  const q = queue();
  if (!q.some((t) => t.srv === id)) return;
  if (current()?.srv === id) {
    stop();
    return;
  }
  const playingQid = current()?.qid;
  const kept = q.filter((t) => t.srv !== id);
  setQueue(kept);
  if (unshuffled()) setUnshuffled(unshuffled()!.filter((t) => t.srv !== id));
  setIndex(kept.findIndex((t) => t.qid === playingQid));
  persist();
}

// ── SyncPlay (listen together) ─────────────────────────────────────────────────

/**
 * While a party is on, the player's own controls become *requests* to the
 * group (syncplay.ts) — the server echoes the decision back to everyone,
 * this browser included, which then acts through the party* functions below.
 */
export interface PartyHooks {
  active(): boolean;
  toggle(): void;
  seek(sec: number): void;
  next(): void;
  prev(): void;
  playAt(i: number): void;
  playList(s: JellyfinSession, items: JfItem[], start: number, startAt: number): void;
  enqueue(s: JellyfinSession, items: JfItem[], next: boolean): void;
  remove(qid: string): void;
  reorder(qids: string[]): void;
  shuffle(): void;
  repeat(): void;
  ended(): void;
}

let party: PartyHooks | null = null;
export function setPartyHooks(h: PartyHooks | null): void { party = h; }
const inParty = () => !!party?.active();

/** The group's shuffle mode while in a party (null = not in one). */
const [partyShuffle, setPartyShuffle] = createSignal<boolean | null>(null);

/** Party: mirror the server's queue (qid = PlaylistItemId) without touching playback. */
export function partySetQueue(items: QItem[], i: number, modes: { shuffle: boolean; repeat: RepeatMode }): void {
  setUnshuffled(null);
  setQueue(items);
  setIndex(i);
  setPartyShuffle(modes.shuffle);
  setRepeatSignal(modes.repeat);
}

export function partyLeft(): void {
  setPartyShuffle(null);
}

/** Party: load queue[i] paused at `startAt`; resolves once it can play. */
export function partyLoad(i: number, startAt: number): Promise<void> {
  const t = queue()[i];
  const s = sessionFor(t?.srv);
  if (!s?.token || !t) return Promise.resolve();
  if (index() !== i && current()) stoppedReport();
  resumeAt = null;
  setIndex(i);
  setPosition(startAt);
  setDuration(0);
  setLoading(true);
  setError(null);
  const a = el();
  a.pause();
  return new Promise((resolve) => {
    const done = () => { setLoading(false); resolve(); };
    a.addEventListener("loadedmetadata", () => {
      a.currentTime = startAt;
      a.addEventListener("canplay", done, { once: true });
    }, { once: true });
    a.addEventListener("error", done, { once: true });
    a.src = streamUrl(s, t.Id);
    a.load();
    reportStart(s, t.Id, startAt);
    lastReport = Date.now();
    updateMediaSession();
  });
}

/** Party: the <audio> element, for the sync engine to drive directly. */
export const partyMedia = (): HTMLMediaElement => el();

// ── Visualizer ────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;

/**
 * Routes <audio> through Web Audio, on first call only. That can't be undone
 * for the page's life, and a suspended context plays silence (iOS suspends it
 * in the background), so nothing calls this until the visualizer is turned on;
 * the "play" listener in el() resumes a suspended context.
 */
export function analyser(): AnalyserNode {
  if (analyserNode) return analyserNode;
  ctx = new AudioContext();
  analyserNode = ctx.createAnalyser();
  analyserNode.fftSize = 128;
  ctx.createMediaElementSource(el()).connect(analyserNode).connect(ctx.destination);
  return analyserNode;
}

// ── Media Session — lock-screen / headset / notification controls ─────────────

let handlersInstalled = false;

function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const s = currentSession(), t = current();
  if (!s || !t) return;
  const art = imageUrl(s, t, 512);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.Name,
    artist: t.Artists?.join(", ") || t.AlbumArtist || "",
    album: t.Album ?? "",
    artwork: art ? [{ src: art, sizes: "512x512" }] : [],
  });
  if (handlersInstalled) return;
  handlersInstalled = true;
  const ms = navigator.mediaSession;
  const set = (action: MediaSessionAction, fn: MediaSessionActionHandler) => {
    try { ms.setActionHandler(action, fn); } catch { /* unsupported action */ }
  };
  set("play", () => toggle());
  set("pause", () => toggle());
  set("previoustrack", () => prev());
  set("nexttrack", () => next());
  set("seekto", (d) => { if (d.seekTime != null) seek(d.seekTime); });
  set("seekbackward", (d) => seek(el().currentTime - (d.seekOffset ?? 10)));
  set("seekforward", (d) => seek(el().currentTime + (d.seekOffset ?? 10)));
}

function syncPositionState() {
  if (!("mediaSession" in navigator) || !audio || !audio.duration || !isFinite(audio.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      position: Math.min(audio.currentTime, audio.duration),
      playbackRate: audio.playbackRate,
    });
  } catch { /* position briefly > duration while a transcode settles */ }
}
