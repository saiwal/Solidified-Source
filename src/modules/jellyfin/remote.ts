// What the user's *other* Jellyfin sessions (phone app, TV, desktop) are
// playing, across every signed-in server, plus remote control in both
// directions.
//
// Two channels per server, both alive only while something on screen wants
// them (useRemotePolling refcounts: the global mini-player and the /jellyfin
// section):
//
//  - Polling GET /Sessions every 10s while the tab is visible. Always the
//    source of truth for ordinary users: Jellyfin pushes session updates over
//    the WebSocket to administrators only (verified against 10.10).
//  - A WebSocket (/socket). It's what makes this browser a controllable
//    session — other clients can pause/skip it and "play on" it — and for an
//    admin it carries live session updates, which switch that server's
//    polling off. For everyone, a UserDataChanged event (a play started
//    somewhere) triggers an early poll.
import { createSignal, onCleanup } from "solid-js";
import {
  listSessions, sendCommand, sendSeek, playOnSession, getItems, ticksToSeconds, socketUrl, reportCapabilities,
  type JellyfinSession, type JfItem, type JfSession, type RemoteCommand,
} from "./api";
import {
  servers, deviceId, sessionFor, playList, playNext, enqueue, current,
  toggle, pause, resume, next, prev, seek, stop, setVolume, muted, setMuted,
} from "./store";

const POLL_MS = 10_000;

export interface RemoteSession {
  /** JellyfinSession.id of the server it lives on. */
  srv: string;
  serverName: string;
  id: string;
  client: string;
  device: string;
  item: JfItem | null;
  /** Ids of that session's play queue, for "Transfer to this browser". */
  queueIds: string[];
  /** Position at `at` (ms epoch); see remotePosition() for "now". */
  position: number;
  at: number;
  paused: boolean;
  /** Takes play/pause/next/prev/seek. */
  controllable: boolean;
  /** Can be told to start playing something (play on device). */
  canPlayAudio: boolean;
}

const [remotes, setRemotes] = createSignal<RemoteSession[]>([]);
export { remotes };

/** Sessions currently playing something, playing ones before paused ones. */
export const remotePlaying = () =>
  remotes().filter((r) => r.item).sort((a, b) => Number(a.paused) - Number(b.paused));

/** Play-on-device targets on one server. */
export const playTargets = (srv: string) => remotes().filter((r) => r.srv === srv && r.canPlayAudio);

// A 1s clock so positions advance smoothly between updates — only ticks while
// something remote is actually playing.
const [now, setNow] = createSignal(Date.now());
export function remotePosition(r: RemoteSession): number {
  const sec = r.paused ? r.position : r.position + (now() - r.at) / 1000;
  const dur = ticksToSeconds(r.item?.RunTimeTicks);
  return dur ? Math.min(sec, dur) : sec;
}

const sameUser = (a: string, b: string) => a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();

function toRemotes(s: JellyfinSession, list: JfSession[]): RemoteSession[] {
  const at = Date.now();
  return list
    // Own sessions only (admins see everyone's), never this browser itself
    .filter((j) => sameUser(j.UserId, s.userId) && j.DeviceId !== deviceId())
    .filter((j) => j.NowPlayingItem || j.SupportsMediaControl || j.SupportsRemoteControl)
    .map((j) => ({
      srv: s.id,
      serverName: s.name,
      id: j.Id,
      client: j.Client,
      device: j.DeviceName,
      item: j.NowPlayingItem ?? null,
      queueIds: (j.NowPlayingQueue ?? []).map((q) => q.Id),
      position: ticksToSeconds(j.PlayState?.PositionTicks),
      at,
      paused: !!j.PlayState?.IsPaused,
      controllable: j.SupportsMediaControl,
      canPlayAudio: j.SupportsRemoteControl && !!j.PlayableMediaTypes?.includes("Audio"),
    }));
}

/** Replace one server's rows; drop rows of servers no longer signed in. */
function setServerRemotes(srv: string, rows: RemoteSession[]) {
  const live = new Set(servers().map((s) => s.id));
  setRemotes([...remotes().filter((r) => r.srv !== srv && live.has(r.srv)), ...rows]);
}

async function pollServer(s: JellyfinSession): Promise<void> {
  try {
    setServerRemotes(s.id, toRemotes(s, await listSessions(s)));
  } catch {
    /* unreachable: keep its last rows rather than blanking them */
  }
}

/** Poll every server without a live socket feed (or all, with `force`). */
async function poll(force = false): Promise<void> {
  await Promise.all(servers().filter((s) => force || !sockets.get(s.id)?.live).map(pollServer));
}

// ── WebSocket per server ──────────────────────────────────────────────────────

interface Sock {
  ws: WebSocket | null;
  /** Session pushes are arriving (admin) — polling for this server is off. */
  live: boolean;
  keepAlive?: ReturnType<typeof setInterval>;
  retry?: ReturnType<typeof setTimeout>;
  backoff: number;
  closed: boolean;
}

const sockets = new Map<string, Sock>();

/**
 * Other modules' interest in socket traffic (SyncPlay). `type` is the
 * message type, or "__open" when a server's socket (re)connects.
 */
export type SocketListener = (s: JellyfinSession, type: string, data: unknown) => void;
const listeners = new Set<SocketListener>();
export function onSocketMessage(fn: SocketListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = (s: JellyfinSession, type: string, data: unknown) => {
  for (const fn of listeners) {
    try { fn(s, type, data); } catch { /* one listener must not break the socket */ }
  }
};

function send(ws: WebSocket | null, type: string, data?: unknown) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data === undefined ? { MessageType: type } : { MessageType: type, Data: data }));
}

let earlyPoll: ReturnType<typeof setTimeout> | undefined;
const pollSoon = () => {
  clearTimeout(earlyPoll);
  earlyPoll = setTimeout(() => void poll(), 1000);
};

function connect(s: JellyfinSession, sock: Sock) {
  let ws: WebSocket;
  try {
    ws = new WebSocket(socketUrl(s));
  } catch {
    return scheduleRetry(s, sock);
  }
  sock.ws = ws;
  ws.onopen = () => {
    sock.backoff = 0;
    // Capabilities first: a SyncPlay rejoin from "__open" needs this session
    // to already count as playable
    void reportCapabilities(s).then(() => notify(s, "__open", null));
    // Session pushes — only ever delivered to admins; harmless to ask for
    send(ws, "SessionsStart", "0,1500");
  };
  ws.onmessage = (e) => {
    let m: { MessageType?: string; Data?: unknown };
    try { m = JSON.parse(String(e.data)); } catch { return; }
    onMessage(s, sock, m.MessageType ?? "", m.Data);
  };
  ws.onclose = () => {
    clearInterval(sock.keepAlive);
    sock.ws = null;
    sock.live = false;
    if (!sock.closed) scheduleRetry(s, sock);
  };
}

function scheduleRetry(s: JellyfinSession, sock: Sock) {
  sock.backoff = Math.min(sock.backoff ? sock.backoff * 2 : 5_000, 60_000);
  sock.retry = setTimeout(() => {
    const fresh = sessionFor(s.id);
    if (!sock.closed && fresh) connect(fresh, sock);
  }, sock.backoff);
}

function onMessage(s: JellyfinSession, sock: Sock, type: string, data: unknown) {
  if (type.startsWith("SyncPlay")) return notify(s, type, data);
  switch (type) {
    case "ForceKeepAlive": {
      // Server drops the socket unless pinged within this many seconds
      const secs = Number(data) || 60;
      clearInterval(sock.keepAlive);
      sock.keepAlive = setInterval(() => send(sock.ws, "KeepAlive"), (secs * 1000) / 2);
      return;
    }
    case "Sessions":
      sock.live = true;
      setServerRemotes(s.id, toRemotes(s, data as JfSession[]));
      return;
    case "UserDataChanged":
      if (!sock.live) pollSoon();
      return;
    case "Playstate":
      return onPlaystate(data as { Command?: string; SeekPositionTicks?: number });
    case "Play":
      return void onPlay(s, data as { ItemIds?: string[]; PlayCommand?: string; StartIndex?: number; StartPositionTicks?: number });
    case "GeneralCommand":
      return onGeneral(data as { Name?: string; Arguments?: Record<string, string> });
  }
}

// ── Commands *to* this browser, from other Jellyfin clients ───────────────────

function onPlaystate(d: { Command?: string; SeekPositionTicks?: number }) {
  switch (d.Command) {
    case "PlayPause": return toggle();
    case "Pause": return pause();
    case "Unpause": return resume();
    case "Stop": return stop();
    case "NextTrack": return next();
    case "PreviousTrack": return prev();
    case "Seek": return seek(ticksToSeconds(d.SeekPositionTicks));
  }
}

async function onPlay(s: JellyfinSession, d: { ItemIds?: string[]; PlayCommand?: string; StartIndex?: number; StartPositionTicks?: number }) {
  const items = await getItems(s, d.ItemIds ?? []).catch(() => [] as JfItem[]);
  if (!items.length) return;
  if (d.PlayCommand === "PlayNext") playNext(s, items);
  else if (d.PlayCommand === "PlayLast") enqueue(s, items);
  else playList(s, items, d.StartIndex ?? 0, ticksToSeconds(d.StartPositionTicks));
}

function onGeneral(d: { Name?: string; Arguments?: Record<string, string> }) {
  switch (d.Name) {
    case "SetVolume": return setVolume(Number(d.Arguments?.Volume ?? 100) / 100);
    case "ToggleMute": return setMuted(!muted());
    case "Mute": return setMuted(true);
    case "Unmute": return setMuted(false);
  }
}

/** Open sockets for newly signed-in servers, close those signed out of. */
function reconcileSockets() {
  const want = new Map(servers().map((s) => [s.id, s]));
  for (const [id, sock] of sockets) {
    if (!want.has(id)) closeSock(sock), sockets.delete(id);
  }
  for (const [id, s] of want) {
    if (sockets.has(id)) continue;
    const sock: Sock = { ws: null, live: false, backoff: 0, closed: false };
    sockets.set(id, sock);
    connect(s, sock);
  }
}

function closeSock(sock: Sock) {
  sock.closed = true;
  clearInterval(sock.keepAlive);
  clearTimeout(sock.retry);
  sock.ws?.close();
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let clock: ReturnType<typeof setInterval> | undefined;

function tick() {
  reconcileSockets();
  if (!servers().length) setRemotes([]);
  else if (document.visibilityState === "visible") void poll();
}

function onVisible() {
  if (document.visibilityState === "visible") tick();
}

function start() {
  tick();
  timer = setInterval(tick, POLL_MS);
  clock = setInterval(() => {
    if (remotes().some((r) => r.item && !r.paused)) setNow(Date.now());
  }, 1000);
  document.addEventListener("visibilitychange", onVisible);
}

function stopAll() {
  clearInterval(timer);
  clearInterval(clock);
  clearTimeout(earlyPoll);
  document.removeEventListener("visibilitychange", onVisible);
  for (const sock of sockets.values()) closeSock(sock);
  sockets.clear();
  setRemotes([]);
}

/** Keep the remote list (and this browser's socket) alive while mounted. */
export function useRemotePolling(): void {
  if (users++ === 0) start();
  onCleanup(() => {
    if (--users === 0) stopAll();
  });
}

// ── Commands *from* this browser ──────────────────────────────────────────────

/** Re-poll shortly after a command so the list reflects it. */
const settle = () => setTimeout(() => void poll(true), 800);

function patch(id: string, fn: (r: RemoteSession) => RemoteSession) {
  setRemotes(remotes().map((r) => (r.id === id ? fn(r) : r)));
}

export async function remoteCommand(r: RemoteSession, cmd: RemoteCommand): Promise<void> {
  const s = sessionFor(r.srv);
  if (!s) return;
  // Optimistic: flip pause now, so the button doesn't lag a poll behind
  if (cmd === "PlayPause") patch(r.id, (x) => ({ ...x, paused: !x.paused, position: remotePosition(x), at: Date.now() }));
  await sendCommand(s, r.id, cmd).catch(() => undefined);
  settle();
}

export async function remoteSeek(r: RemoteSession, seconds: number): Promise<void> {
  const s = sessionFor(r.srv);
  if (!s) return;
  patch(r.id, (x) => ({ ...x, position: seconds, at: Date.now() }));
  await sendSeek(s, r.id, seconds).catch(() => undefined);
  settle();
}

/** Play tracks on another device. Throws so the caller can report failure. */
export async function playOn(r: RemoteSession, tracks: JfItem[], start = 0): Promise<void> {
  const s = sessionFor(r.srv);
  if (!s || !tracks.length) return;
  await playOnSession(s, r.id, tracks.map((t) => t.Id), start);
  settle();
}

/**
 * Take over another device's playback here: its track, the rest of its queue
 * and its position (a video opens the video player via `watch`). The other
 * device is told to stop once this one starts.
 */
export async function transferHere(r: RemoteSession, watch: (id: string, at: number) => void): Promise<void> {
  const s = sessionFor(r.srv);
  if (!s || !r.item) return;
  if (r.item.Type !== "Audio") {
    // Video goes to the video player, at the same spot
    watch(r.item.Id, Math.floor(remotePosition(r)));
    await sendCommand(s, r.id, "Stop").catch(() => undefined);
    settle();
    return;
  }
  const ids = r.queueIds.length ? r.queueIds : [r.item.Id];
  const items = await getItems(s, ids);
  const start = Math.max(0, items.findIndex((i) => i.Id === r.item!.Id));
  playList(s, items.length ? items : [r.item], start, remotePosition(r));
  if (current()) await sendCommand(s, r.id, "Stop").catch(() => undefined);
  settle();
}
