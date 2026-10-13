// Watch / listen together, on Jellyfin's SyncPlay.
//
// Everyone in a group plays the same item from the same Jellyfin server; the
// server owns the group's queue and play state. A client never acts on its own
// controls: it *requests* (Pause, Unpause, Seek, NextItem…) and acts only on
// what the server broadcasts back — so this browser stays in step with
// Jellyfin's own apps in the same group.
//
// Protocol, as verified against 10.10 (see the node scripts in the commit):
//  - PlayQueue update → load that item *paused* at StartPositionTicks, then
//    POST Ready with its PlaylistItemId. The server waits for everyone.
//  - Unpause carries `When`, about a second in the future, in server time:
//    start then, so all clients start on the same frame. Hence the clock
//    offset (GET /GetUtcTime, best of a few samples).
//  - Seek puts the group in "Waiting" until every client reports Ready again.
//  - Pause carries the position to stop at.
// While playing, drift is corrected gently (±5% speed) and, past a second,
// by seeking.
import { createSignal } from "solid-js";
import {
  syncPlay, clockSample, parseServerDate, getItems, ticksToSeconds,
  type JellyfinSession, type JfItem,
} from "./api";
import {
  sessionFor, setPartyHooks, partySetQueue, partyLoad, partyMedia, partyLeft,
  type RepeatMode,
} from "./store";
import { onSocketMessage } from "./remote";

const TICKS = 10_000_000;
const ZERO_ID = "00000000000000000000000000000000";
const SAVED_KEY = "hz-jellyfin-party";

export interface Party {
  /** JellyfinSession.id of the server the group lives on. */
  srv: string;
  id: string;
  name: string;
  participants: string[];
  /** Idle | Waiting | Paused | Playing */
  state: string;
}

interface PartyQueue {
  items: { ItemId: string; PlaylistItemId: string }[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

const [party, setParty] = createSignal<Party | null>(null);
const [queue, setQueue] = createSignal<PartyQueue | null>(null);
/** What the group is playing right now: music (the audio player) or a video. */
const [kind, setKind] = createSignal<"audio" | "video" | null>(null);
/** DM thread (uuid) the party chats in, if known. */
const [thread, setThreadSignal] = createSignal<string | null>(null);
export { party, kind as partyKind, thread as partyThread };

export const partyItem = () => { const q = queue(); return q ? q.items[q.index] ?? null : null; };

// ── Notices, for the UI to turn into translated toasts ────────────────────────

export type Notice =
  | { type: "joined" | "left"; name: string }
  | { type: "ended" | "not-found" | "denied" | "failed" };
const [notice, setNotice] = createSignal<Notice | null>(null, { equals: false });
export { notice as partyNotice };

// ── Clock ─────────────────────────────────────────────────────────────────────

let offset = 0; // server − local, ms
let lastRtt = 0;
const serverNow = () => Date.now() + offset;

async function syncClock(s: JellyfinSession): Promise<void> {
  const samples: { offset: number; rtt: number }[] = [];
  for (let i = 0; i < 5; i++) {
    try { samples.push(await clockSample(s)); } catch { /* keep the ones we got */ }
  }
  if (!samples.length) return;
  const best = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
  offset = best.offset;
  lastRtt = Math.max(0, Math.round(best.rtt));
}

// ── The element being synced ──────────────────────────────────────────────────

/** The video player registers itself while it shows the party's item. */
export interface VideoAdapter {
  itemId: string;
  el(): HTMLVideoElement;
  /** Load the stream paused at `startSec`; resolves once it can play. */
  load(startSec: number): Promise<void>;
}
let video: VideoAdapter | null = null;
/** A video item the group moved to before the player was on screen. */
let pendingVideo: { itemId: string; pid: string; startSec: number } | null = null;
let loadedPid: string | null = null;

const media = (): HTMLMediaElement | null => (kind() === "audio" ? partyMedia() : video?.el() ?? null);

// Our own play/pause/seek fire the same media events a user's click does; the
// video player's native-controls interception checks this to tell them apart.
let quietUntil = 0;
export const partyIsActing = () => Date.now() < quietUntil;
const quiet = () => { quietUntil = Date.now() + 700; };

function mPlay() {
  const m = media();
  if (!m) return;
  quiet();
  m.playbackRate = 1;
  m.play().catch(() => undefined);
}
function mPause() {
  const m = media();
  if (!m) return;
  quiet();
  m.pause();
}
function mSeek(sec: number) {
  const m = media();
  if (!m) return;
  quiet();
  m.currentTime = Math.max(0, sec);
}

/** Resolve once the element can play from where it is. */
function whenReady(m: HTMLMediaElement): Promise<void> {
  if (m.readyState >= 3 && !m.seeking) return Promise.resolve();
  return new Promise((res) => {
    const done = () => { m.removeEventListener("canplay", done); m.removeEventListener("seeked", done); res(); };
    m.addEventListener("canplay", done);
    m.addEventListener("seeked", done);
    setTimeout(done, 15_000); // never leave the group waiting forever
  });
}

// ── Requests to the group ─────────────────────────────────────────────────────

function req(action: string, body?: unknown): void {
  const p = party();
  const s = p && sessionFor(p.srv);
  if (!s) return;
  syncPlay(s, action, body).catch(() => setNotice({ type: "failed" }));
}

function report(type: "Ready" | "Buffering") {
  const it = partyItem();
  const m = media();
  if (!it || !m) return;
  req(type, {
    When: new Date(serverNow()).toISOString(),
    PositionTicks: Math.round(m.currentTime * TICKS),
    IsPlaying: !m.paused,
    PlaylistItemId: it.PlaylistItemId,
  });
}

const playing = () => party()?.state === "Playing";

export const partyRequest = {
  toggle: () => req(playing() ? "Pause" : "Unpause"),
  pause: () => req("Pause"),
  unpause: () => req("Unpause"),
  seek: (sec: number) => req("Seek", { PositionTicks: Math.round(Math.max(0, sec) * TICKS) }),
  next: () => { const it = partyItem(); if (it) req("NextItem", { PlaylistItemId: it.PlaylistItemId }); },
  prev: () => { const it = partyItem(); if (it) req("PreviousItem", { PlaylistItemId: it.PlaylistItemId }); },
  setItem: (pid: string) => req("SetPlaylistItem", { PlaylistItemId: pid }),
  newQueue: (ids: string[], index: number, startSec: number) =>
    req("SetNewQueue", { PlayingQueue: ids, PlayingItemPosition: index, StartPositionTicks: Math.round(startSec * TICKS) }),
};

/** Drag-reorder hands over the whole new order; SyncPlay wants the one move. */
function reorder(qids: string[]) {
  const old = queue()?.items.map((i) => i.PlaylistItemId) ?? [];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const moved = qids.find((pid) => same(old.filter((x) => x !== pid), qids.filter((x) => x !== pid)) && old.indexOf(pid) !== qids.indexOf(pid));
  if (moved) req("MovePlaylistItem", { PlaylistItemId: moved, NewIndex: qids.indexOf(moved) });
}

const REPEAT: Record<RepeatMode, string> = { off: "RepeatNone", all: "RepeatAll", one: "RepeatOne" };

// The music player's controls, while the group plays music
setPartyHooks({
  active: () => !!party() && kind() === "audio",
  toggle: partyRequest.toggle,
  seek: partyRequest.seek,
  next: partyRequest.next,
  prev: partyRequest.prev,
  playAt: (i) => { const it = queue()?.items[i]; if (it) partyRequest.setItem(it.PlaylistItemId); },
  playList: (_s, items, start, startAt) => partyRequest.newQueue(items.map((i) => i.Id), start, startAt),
  enqueue: (_s, items, next) => req("Queue", { ItemIds: items.map((i) => i.Id), Mode: next ? "QueueNext" : "Queue" }),
  remove: (qid) => req("RemoveFromPlaylist", { PlaylistItemIds: [qid] }),
  reorder,
  shuffle: () => req("SetShuffleMode", { Mode: queue()?.shuffle ? "Sorted" : "Shuffle" }),
  repeat: () => {
    const cur = queue()?.repeat ?? "off";
    req("SetRepeatMode", { Mode: REPEAT[cur === "off" ? "all" : cur === "all" ? "one" : "off"] });
  },
  ended: partyRequest.next,
});

// ── Incoming ──────────────────────────────────────────────────────────────────

const metaCache = new Map<string, JfItem>();
async function metas(s: JellyfinSession, ids: string[]): Promise<Map<string, JfItem>> {
  const missing = [...new Set(ids)].filter((id) => !metaCache.has(id));
  if (missing.length) (await getItems(s, missing).catch(() => [] as JfItem[])).forEach((i) => metaCache.set(i.Id, i));
  return metaCache;
}

const isVideo = (i?: JfItem) => !!i && (i.MediaType === "Video" || ["Movie", "Episode", "Video", "MusicVideo"].includes(i.Type));

/** Opens the video player; set by an always-mounted component (it needs the router). */
let navigateTo: ((path: string) => void) | null = null;
export function setPartyNavigator(fn: ((path: string) => void) | null): void { navigateTo = fn; }

interface QueueData {
  Playlist: { ItemId: string; PlaylistItemId: string }[];
  PlayingItemIndex: number;
  StartPositionTicks: number;
  ShuffleMode: string;
  RepeatMode: string;
}

let lastSync: { when: number; pos: number } | null = null;
let startTimer: ReturnType<typeof setTimeout> | undefined;

async function applyQueue(s: JellyfinSession, d: QueueData) {
  const repeat: RepeatMode = d.RepeatMode === "RepeatAll" ? "all" : d.RepeatMode === "RepeatOne" ? "one" : "off";
  setQueue({ items: d.Playlist, index: d.PlayingItemIndex, shuffle: d.ShuffleMode === "Shuffle", repeat });
  const cur = d.Playlist[d.PlayingItemIndex];
  if (!cur) return;
  const m = await metas(s, d.Playlist.map((p) => p.ItemId));
  const startSec = ticksToSeconds(d.StartPositionTicks);

  if (!isVideo(m.get(cur.ItemId))) {
    const items = d.Playlist
      .map((p) => { const meta = m.get(p.ItemId); return meta ? { ...meta, srv: s.id, qid: p.PlaylistItemId } : null; })
      .filter((x): x is NonNullable<typeof x> => !!x);
    const index = items.findIndex((i) => i.qid === cur.PlaylistItemId);
    setKind("audio");
    partySetQueue(items, index, { shuffle: d.ShuffleMode === "Shuffle", repeat });
    if (cur.PlaylistItemId === loadedPid) return; // same track, just a queue edit
    loadedPid = cur.PlaylistItemId;
    lastSync = null;
    await partyLoad(index, startSec);
    report("Ready");
    return;
  }

  partyMedia().pause(); // the music player steps aside for the film
  setKind("video");
  if (cur.PlaylistItemId === loadedPid && video) return;
  pendingVideo = { itemId: cur.ItemId, pid: cur.PlaylistItemId, startSec };
  lastSync = null;
  if (video?.itemId === cur.ItemId) void loadPendingVideo();
  else navigateTo?.(`/jellyfin?watch=${encodeURIComponent(cur.ItemId)}`);
}

async function loadPendingVideo() {
  const p = pendingVideo;
  if (!p || !video || video.itemId !== p.itemId) return;
  pendingVideo = null;
  loadedPid = p.pid;
  await video.load(p.startSec);
  report("Ready");
}

async function onCommand(c: { GroupId: string; PlaylistItemId: string; When: string; PositionTicks: number; Command: string }) {
  if (!party() || c.GroupId !== party()!.id) return;
  if (c.PlaylistItemId === ZERO_ID) { mPause(); return; } // the "nothing loaded" Stop on join
  const pos = ticksToSeconds(c.PositionTicks);
  const when = parseServerDate(c.When);
  clearTimeout(startTimer);
  switch (c.Command) {
    case "Unpause": {
      lastSync = { when, pos };
      const delay = when - serverNow();
      if (delay > 0) {
        mSeek(pos);
        startTimer = setTimeout(mPlay, delay);
      } else {
        mSeek(pos - delay / 1000); // late: join at where the others are by now
        mPlay();
      }
      return;
    }
    case "Pause":
      lastSync = null;
      mPause();
      mSeek(pos);
      return;
    case "Seek": {
      lastSync = null;
      mPause();
      mSeek(pos);
      const m = media();
      if (m) await whenReady(m);
      report("Ready");
      return;
    }
    case "Stop":
      lastSync = null;
      mPause();
  }
}

function onUpdate(s: JellyfinSession, u: { GroupId: string; Type: string; Data: any }) {
  switch (u.Type) {
    case "GroupJoined":
      setParty({ srv: s.id, id: u.Data.GroupId, name: u.Data.GroupName, participants: u.Data.Participants ?? [], state: u.Data.State });
      setThreadSignal(savedThread(u.Data.GroupId));
      save({ srv: s.id, id: u.Data.GroupId });
      void syncClock(s);
      startTimers();
      return;
    case "UserJoined":
      setParty((p) => (p ? { ...p, participants: [...p.participants, u.Data] } : p));
      setNotice({ type: "joined", name: String(u.Data) });
      return;
    case "UserLeft": {
      const name = String(u.Data);
      setParty((p) => {
        if (!p) return p;
        const i = p.participants.indexOf(name);
        return { ...p, participants: p.participants.filter((_, n) => n !== i) };
      });
      setNotice({ type: "left", name });
      return;
    }
    case "StateUpdate":
      setParty((p) => (p ? { ...p, state: u.Data?.State ?? p.state } : p));
      return;
    case "PlayQueue":
      void applyQueue(s, u.Data);
      return;
    case "GroupLeft":
    case "NotInGroup":
      if (party()) setNotice({ type: "ended" });
      leaveLocal();
      return;
    case "GroupDoesNotExist":
      setNotice({ type: "not-found" });
      leaveLocal();
      return;
    case "LibraryAccessDenied":
      setNotice({ type: "denied" });
      return;
  }
}

onSocketMessage((s, type, data) => {
  if (type === "__open") return rejoin(s);
  if (type === "SyncPlayGroupUpdate") return onUpdate(s, data as never);
  if (type === "SyncPlayCommand") return void onCommand(data as never);
});

// ── Keeping in step ───────────────────────────────────────────────────────────

let driftTimer: ReturnType<typeof setInterval> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let buffering = false;

function startTimers() {
  stopTimers();
  driftTimer = setInterval(() => {
    const m = media();
    if (!m || !lastSync || !playing() || m.paused) return;
    const expected = lastSync.pos + (serverNow() - lastSync.when) / 1000;
    const drift = m.currentTime - expected;
    if (Math.abs(drift) > 1) mSeek(expected);
    else if (Math.abs(drift) > 0.12) m.playbackRate = drift > 0 ? 0.95 : 1.05;
    else m.playbackRate = 1;
  }, 1000);
  pingTimer = setInterval(() => {
    const p = party();
    const s = p && sessionFor(p.srv);
    if (!s) return;
    req("Ping", { Ping: lastRtt });
    void syncClock(s);
  }, 30_000);
}

function stopTimers() {
  clearInterval(driftTimer);
  clearInterval(pingTimer);
  clearTimeout(startTimer);
}

/** Tell the group when we stall mid-play, and when we've caught up. */
function watchBuffering(m: HTMLMediaElement) {
  if ((m as HTMLMediaElement & { __partyWatched?: boolean }).__partyWatched) return;
  (m as HTMLMediaElement & { __partyWatched?: boolean }).__partyWatched = true;
  m.addEventListener("waiting", () => {
    if (!party() || !playing() || partyIsActing() || media() !== m) return;
    buffering = true;
    report("Buffering");
  });
  m.addEventListener("playing", () => {
    if (!buffering || media() !== m) return;
    buffering = false;
    report("Ready");
  });
}
watchBuffering(partyMedia());

// ── Joining, leaving, rejoining ───────────────────────────────────────────────

function save(v: { srv: string; id: string } | null) {
  try {
    if (v) sessionStorage.setItem(SAVED_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(SAVED_KEY);
  } catch { /* the party just won't survive a reload */ }
}

/** A reload drops the socket; rejoin the group this tab was in. */
function rejoin(s: JellyfinSession) {
  if (party()) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(SAVED_KEY) ?? "null");
    if (saved?.srv === s.id && saved.id) syncPlay(s, "Join", { GroupId: saved.id }).catch(() => save(null));
  } catch { /* nothing saved */ }
}

function leaveLocal() {
  stopTimers();
  const m = media();
  if (m) m.playbackRate = 1;
  setParty(null);
  setQueue(null);
  setKind(null);
  partyLeft();
  loadedPid = null;
  pendingVideo = null;
  lastSync = null;
  save(null);
}

/**
 * Start a party around what's playing: `ids` from `index`, `startSec` in.
 * The server answers with GroupJoined, then the queue, then everyone loads.
 */
export async function startParty(s: JellyfinSession, name: string, ids: string[], index: number, startSec: number): Promise<void> {
  await syncPlay(s, "New", { GroupName: name });
  // GroupJoined has already been pushed by the time New answers
  await syncPlay(s, "SetNewQueue", { PlayingQueue: ids, PlayingItemPosition: index, StartPositionTicks: Math.round(startSec * TICKS) });
}

export const joinParty = (s: JellyfinSession, groupId: string) => syncPlay(s, "Join", { GroupId: groupId });

export function leaveParty(): void {
  req("Leave");
  leaveLocal();
}

// ── The video player's side ───────────────────────────────────────────────────

/** Is this video the one the group is watching? (Then the player defers to the party.) */
export const partyWants = (itemId: string) => kind() === "video" && (pendingVideo?.itemId === itemId || (!!video && video.itemId === itemId));

export function attachVideo(a: VideoAdapter): () => void {
  video = a;
  watchBuffering(a.el());
  void loadPendingVideo();
  return () => { if (video === a) { video = null; if (kind() === "video") loadedPid = null; } };
}

/** The video's own quality/subtitle reload: stall the group, then resume it. */
export function videoReloading(): void { if (kind() === "video") report("Buffering"); }
export function videoReloaded(): void { if (kind() === "video") report("Ready"); }

// ── Invite thread ─────────────────────────────────────────────────────────────

const THREADS_KEY = "hz-jellyfin-party-threads";
function savedThread(gid: string): string | null {
  try { return JSON.parse(localStorage.getItem(THREADS_KEY) ?? "{}")[gid] ?? null; } catch { return null; }
}
export function setPartyThread(uuid: string): void {
  const p = party();
  setThreadSignal(uuid);
  if (!p) return;
  try {
    const all = JSON.parse(localStorage.getItem(THREADS_KEY) ?? "{}");
    all[p.id] = uuid;
    localStorage.setItem(THREADS_KEY, JSON.stringify(all));
  } catch { /* chat just won't be remembered */ }
}

/** Short code in the invite's subject; how an invitee's browser finds the thread. */
export const partyCode = (groupId: string) => groupId.replace(/-/g, "").slice(0, 8);
