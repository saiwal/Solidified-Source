// Jellyfin REST client. The browser talks to the user's Jellyfin server
// directly — there is deliberately no /spa proxy: a hub-side fetch of a
// user-typed URL would need ValidatesRemoteHost's private-range block, which
// would rule out exactly the home-LAN servers most people run. Jellyfin sends
// CORS headers, and core's default CSP leaves connect-src/media-src open.
//
// Sessions (one per server: url, token) live in localStorage, per device —
// that is how Jellyfin's own clients work (each device gets its own
// token/session), and it keeps tokens off the hub entirely. One DeviceId per
// browser, shared by every server.

const STORAGE_KEY = "hz-jellyfin";
const CLIENT = "Hubzilla SPA";
const VERSION = "1.0.0";

export interface JellyfinSession {
  /** Jellyfin's ServerId — stable across URL changes, so re-adding a server replaces it. */
  id: string;
  /** The server's own display name (System/Info/Public ServerName). */
  name: string;
  server: string;   // normalised, no trailing slash
  token: string;
  userId: string;
  userName: string;
  deviceId: string;
  /** Admins get live session pushes over the WebSocket; everyone else polls. */
  isAdmin?: boolean;
}

/** Raw BaseItemDto — only the fields we read. */
export interface JfItem {
  Id: string;
  Name: string;
  Type: string;
  Album?: string;
  AlbumId?: string;
  AlbumArtist?: string;
  Artists?: string[];
  ProductionYear?: number;
  RunTimeTicks?: number;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  ImageTags?: { Primary?: string; Thumb?: string };
  BackdropImageTags?: string[];
  ParentThumbItemId?: string;
  ParentThumbImageTag?: string;
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  AlbumPrimaryImageTag?: string;
  UserData?: { IsFavorite?: boolean; PlayCount?: number; PlaybackPositionTicks?: number; Played?: boolean; LastPlayedDate?: string };
  HasLyrics?: boolean;
  ChildCount?: number;
  MediaType?: string;
  // Video
  Overview?: string;
  SeriesName?: string;
  SeriesId?: string;
  SeasonId?: string;
  SeasonName?: string;
  SeriesPrimaryImageTag?: string;
  OfficialRating?: string;
  CommunityRating?: number;
}

export interface JfPage {
  Items: JfItem[];
  TotalRecordCount: number;
}

export interface JellyfinStore {
  deviceId: string;
  active: string | null;
  servers: JellyfinSession[];
}

export function loadStore(): JellyfinStore {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch { /* unreadable or blocked — start fresh */ }
  const r = raw as Partial<JellyfinStore & JellyfinSession> | null;
  if (r && Array.isArray(r.servers) && r.deviceId) {
    return { deviceId: r.deviceId, active: r.active ?? null, servers: r.servers };
  }
  // Pre-multi-server shape: a bare session object. Keep it signed in.
  if (r && typeof r.server === "string" && r.deviceId) {
    const servers = r.token
      ? [{ id: r.server, name: r.server.replace(/^https?:\/\//, ""), server: r.server,
           token: r.token, userId: r.userId ?? "", userName: r.userName ?? "", deviceId: r.deviceId }]
      : [];
    return { deviceId: r.deviceId, active: servers[0]?.id ?? null, servers };
  }
  return { deviceId: crypto.randomUUID(), active: null, servers: [] };
}

export function saveStore(st: JellyfinStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
  } catch {
    /* private mode — sessions just won't survive a reload */
  }
}

export function normaliseServer(url: string): string {
  let s = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

function authHeader(deviceId: string, token?: string): string {
  const parts = [
    `Client="${CLIENT}"`,
    `Device="${navigator.userAgent.includes("Mobile") ? "Mobile browser" : "Browser"}"`,
    `DeviceId="${deviceId}"`,
    `Version="${VERSION}"`,
  ];
  if (token) parts.push(`Token="${token}"`);
  return `MediaBrowser ${parts.join(", ")}`;
}

export class JellyfinError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function jf<T>(s: JellyfinSession, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${s.server}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(s.deviceId, s.token),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) throw new JellyfinError(`Jellyfin ${res.status}`, res.status);
  // 204s from the session-reporting endpoints have no body
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Sign in with username/password; the password is used once and never stored. */
export async function authenticate(server: string, username: string, password: string, deviceId: string): Promise<JellyfinSession> {
  const res = await fetch(`${server}/Users/AuthenticateByName`, {
    method: "POST",
    headers: { Authorization: authHeader(deviceId), "Content-Type": "application/json" },
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  if (!res.ok) throw new JellyfinError(`Jellyfin ${res.status}`, res.status);
  const data = await res.json();
  // Name is cosmetic (the switcher label) — fall back to the host on failure
  const info = await fetch(`${server}/System/Info/Public`).then((r) => r.json()).catch(() => null);
  return {
    id: data.ServerId ?? info?.Id ?? server,
    name: info?.ServerName || server.replace(/^https?:\/\//, ""),
    server,
    token: data.AccessToken,
    userId: data.User.Id,
    userName: data.User.Name,
    deviceId,
    isAdmin: !!data.User.Policy?.IsAdministrator,
  };
}

/** Revoke the token server-side. Best effort — the local session is dropped regardless. */
export function logout(s: JellyfinSession): Promise<void> {
  return jf<void>(s, "/Sessions/Logout", { method: "POST" }).catch(() => undefined);
}

const PAGE_SIZE = 60;

function itemsQuery(s: JellyfinSession, params: Record<string, string | number | undefined>): Promise<JfPage> {
  const q = new URLSearchParams({ userId: s.userId, Recursive: "true" });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  return jf<JfPage>(s, `/Items?${q}`);
}

/** A list's order: Jellyfin SortBy fields (comma-separated) and direction. */
export interface Sort { by: string; desc: boolean }
const sortParams = (sort?: Sort): Record<string, string> =>
  sort ? { SortBy: sort.by, SortOrder: sort.desc ? "Descending" : "Ascending" } : {};

export const listAlbums = (s: JellyfinSession, start = 0, artistId?: string, sort?: Sort) =>
  itemsQuery(s, {
    IncludeItemTypes: "MusicAlbum",
    SortBy: artistId ? "ProductionYear,SortName" : "SortName",
    ...sortParams(sort),
    StartIndex: start,
    Limit: PAGE_SIZE,
    AlbumArtistIds: artistId,
  });

export function listArtists(s: JellyfinSession, start = 0, sort?: Sort): Promise<JfPage> {
  const q = new URLSearchParams({ userId: s.userId, SortBy: "SortName", ...sortParams(sort), StartIndex: String(start), Limit: String(PAGE_SIZE) });
  return jf<JfPage>(s, `/Artists/AlbumArtists?${q}`);
}

export const listAlbumTracks = (s: JellyfinSession, albumId: string) =>
  itemsQuery(s, { ParentId: albumId, IncludeItemTypes: "Audio", SortBy: "ParentIndexNumber,IndexNumber,SortName" });

/** Several items by id, in the order asked for (Jellyfin returns them unordered). */
export async function getItems(s: JellyfinSession, ids: string[]): Promise<JfItem[]> {
  if (!ids.length) return [];
  const page = await jf<JfPage>(s, `/Items?userId=${s.userId}&Ids=${ids.join(",")}`);
  const byId = new Map(page.Items.map((i) => [i.Id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is JfItem => !!i);
}

export const getItem = (s: JellyfinSession, id: string) =>
  jf<JfItem>(s, `/Items/${encodeURIComponent(id)}?userId=${s.userId}`);

/** Artists come from their own endpoint — /Items never matches a MusicArtist (10.10). */
export async function search(s: JellyfinSession, term: string): Promise<JfPage> {
  const q = new URLSearchParams({ userId: s.userId, searchTerm: term, Limit: "20" });
  const [artists, rest] = await Promise.all([
    jf<JfPage>(s, `/Artists?${q}`),
    itemsQuery(s, { SearchTerm: term, IncludeItemTypes: "MusicAlbum,Audio,Movie,Series,Episode", Limit: 50 }),
  ]);
  const Items = [...artists.Items, ...rest.Items];
  return { Items, TotalRecordCount: Items.length };
}

export { PAGE_SIZE };

// ── Home shelves ──────────────────────────────────────────────────────────────

const SHELF = 20;
export const recentlyAdded = (s: JellyfinSession) =>
  itemsQuery(s, { IncludeItemTypes: "MusicAlbum", SortBy: "DateCreated", SortOrder: "Descending", Limit: SHELF });
export const recentlyAddedVideo = (s: JellyfinSession) =>
  itemsQuery(s, { IncludeItemTypes: "Movie,Series", SortBy: "DateCreated", SortOrder: "Descending", Limit: SHELF });
export const recentlyPlayed = (s: JellyfinSession) =>
  itemsQuery(s, { IncludeItemTypes: "Audio", Filters: "IsPlayed", SortBy: "DatePlayed", SortOrder: "Descending", Limit: SHELF });
export const mostPlayed = (s: JellyfinSession) =>
  itemsQuery(s, { IncludeItemTypes: "Audio", Filters: "IsPlayed", SortBy: "PlayCount", SortOrder: "Descending", Limit: SHELF });

/**
 * Tracks last played since `since`. Jellyfin keeps only the *last* play date
 * per track, not a play log, so this is "distinct tracks played", newest first.
 */
export async function playedSince(s: JellyfinSession, since: Date): Promise<JfItem[]> {
  const page = await itemsQuery(s, { IncludeItemTypes: "Audio", Filters: "IsPlayed", SortBy: "DatePlayed", SortOrder: "Descending", Limit: 500 });
  return page.Items.filter((i) => i.UserData?.LastPlayedDate && new Date(i.UserData.LastPlayedDate) >= since);
}

// ── Favourites ────────────────────────────────────────────────────────────────

export const listFavorites = (s: JellyfinSession, video = false) =>
  itemsQuery(s, {
    Filters: "IsFavorite",
    IncludeItemTypes: video ? "Movie,Series,Episode" : "MusicArtist,MusicAlbum,Audio",
    SortBy: "SortName",
    Limit: 200,
  });

/** Set or clear a favourite; returns the new state. */
export async function setFavorite(s: JellyfinSession, itemId: string, fav: boolean): Promise<boolean> {
  const data = await jf<{ IsFavorite?: boolean }>(s, `/UserFavoriteItems/${encodeURIComponent(itemId)}?userId=${s.userId}`, {
    method: fav ? "POST" : "DELETE",
  });
  return !!data?.IsFavorite;
}

// ── Playlists ─────────────────────────────────────────────────────────────────

export const listPlaylists = (s: JellyfinSession) =>
  itemsQuery(s, { IncludeItemTypes: "Playlist", SortBy: "SortName", Limit: 200 });

export const playlistItems = (s: JellyfinSession, id: string) =>
  jf<JfPage>(s, `/Playlists/${encodeURIComponent(id)}/Items?userId=${s.userId}`);

export const addToPlaylist = (s: JellyfinSession, playlistId: string, itemIds: string[]) =>
  jf<void>(s, `/Playlists/${encodeURIComponent(playlistId)}/Items?ids=${itemIds.join(",")}&userId=${s.userId}`, { method: "POST" });

export const createPlaylist = (s: JellyfinSession, name: string, itemIds: string[]) =>
  jf<{ Id: string }>(s, "/Playlists", {
    method: "POST",
    body: JSON.stringify({ Name: name, Ids: itemIds, UserId: s.userId, MediaType: "Audio" }),
  });

// ── Instant mix / lyrics ──────────────────────────────────────────────────────

/** "Radio" seeded from any track, album, artist or playlist. */
export const instantMix = (s: JellyfinSession, itemId: string) =>
  jf<JfPage>(s, `/Items/${encodeURIComponent(itemId)}/InstantMix?userId=${s.userId}&Limit=50`);

export interface LyricLine { Text: string; Start?: number }

/** Lyrics, or null when the track has none (Jellyfin answers 404). */
export async function getLyrics(s: JellyfinSession, itemId: string): Promise<LyricLine[] | null> {
  try {
    const data = await jf<{ Lyrics?: LyricLine[] }>(s, `/Audio/${encodeURIComponent(itemId)}/Lyrics`);
    return data?.Lyrics?.length ? data.Lyrics : null;
  } catch (e) {
    if (e instanceof JellyfinError && e.status === 404) return null;
    throw e;
  }
}

/** Primary image for an item; tracks fall back to their album's art, episodes to their series poster. */
export function imageUrl(s: JellyfinSession, item: JfItem, size = 300): string | null {
  const [id, tag] = item.ImageTags?.Primary
    ? [item.Id, item.ImageTags.Primary]
    : item.AlbumId && item.AlbumPrimaryImageTag
      ? [item.AlbumId, item.AlbumPrimaryImageTag]
      : item.SeriesId && item.SeriesPrimaryImageTag
        ? [item.SeriesId, item.SeriesPrimaryImageTag]
        : [null, null];
  if (!id) return null;
  return `${s.server}/Items/${id}/Images/Primary?fillHeight=${size}&fillWidth=${size}&quality=90&tag=${tag}`;
}

/**
 * A 16:9 picture for video shelves, so a row mixing films and episodes lines
 * up: an episode's own still, else a Thumb, else a Backdrop (own, then the
 * series'), and only as a last resort the (portrait, so cropped) Primary.
 */
export function landscapeUrl(s: JellyfinSession, item: JfItem, width = 480): string | null {
  const url = (id: string, type: string, tag: string) =>
    `${s.server}/Items/${id}/Images/${type}?maxWidth=${width}&quality=85&tag=${tag}`;
  if (item.Type === "Episode" && item.ImageTags?.Primary) return url(item.Id, "Primary", item.ImageTags.Primary);
  if (item.ImageTags?.Thumb) return url(item.Id, "Thumb", item.ImageTags.Thumb);
  if (item.ParentThumbItemId && item.ParentThumbImageTag) return url(item.ParentThumbItemId, "Thumb", item.ParentThumbImageTag);
  if (item.BackdropImageTags?.[0]) return url(item.Id, "Backdrop/0", item.BackdropImageTags[0]);
  if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.[0]) {
    return url(item.ParentBackdropItemId, "Backdrop/0", item.ParentBackdropImageTags[0]);
  }
  return imageUrl(s, item, width);
}

/** The cover as a File, for re-hosting on the hub (see NowPlayingWidget's share). */
export async function fetchCover(s: JellyfinSession, item: JfItem, size = 600): Promise<File | null> {
  const url = imageUrl(s, item, size);
  if (!url) return null;
  const res = await fetch(url, { headers: { Authorization: authHeader(s.deviceId, s.token) } });
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) return null;
  const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return new File([blob], `cover.${ext}`, { type: blob.type });
}

/**
 * Progressive-HTTP stream. `universal` direct-plays anything the browser can
 * decode (the Container list) and transcodes the rest (ALAC, WMA, …) to mp3.
 * The token has to ride in the URL — an <audio> element can't send headers.
 * `ApiKey`, not the legacy `api_key`: newer servers (12.x) 401 the old name,
 * and 10.10 accepts both.
 */
export function streamUrl(s: JellyfinSession, itemId: string): string {
  const q = new URLSearchParams({
    UserId: s.userId,
    DeviceId: s.deviceId,
    ApiKey: s.token,
    Container: "opus,webm|opus,mp3,aac,m4a|aac,m4b|aac,flac,webma,webm|webma,wav,ogg",
    TranscodingContainer: "mp3",
    TranscodingProtocol: "http",
    AudioCodec: "mp3",
    MaxStreamingBitrate: "140000000",
  });
  return `${s.server}/Audio/${encodeURIComponent(itemId)}/universal?${q}`;
}

// ── Playback reporting — keeps "continue listening" / play counts in sync ────

const TICKS_PER_SECOND = 10_000_000;

function report(s: JellyfinSession, path: string, itemId: string, seconds: number, paused: boolean): void {
  jf<void>(s, path, {
    method: "POST",
    body: JSON.stringify({
      ItemId: itemId,
      PositionTicks: Math.round(seconds * TICKS_PER_SECOND),
      IsPaused: paused,
      CanSeek: true,
      PlayMethod: "DirectStream",
    }),
  }).catch(() => undefined); // telemetry only — never surface a failure
}

export const reportStart = (s: JellyfinSession, id: string, sec: number) => report(s, "/Sessions/Playing", id, sec, false);
export const reportProgress = (s: JellyfinSession, id: string, sec: number, paused: boolean) =>
  report(s, "/Sessions/Playing/Progress", id, sec, paused);
export const reportStopped = (s: JellyfinSession, id: string, sec: number) => report(s, "/Sessions/Playing/Stopped", id, sec, false);

export const ticksToSeconds = (t?: number) => (t ? t / TICKS_PER_SECOND : 0);

// ── Other sessions (remote control) ───────────────────────────────────────────

/** Raw SessionInfoDto — only the fields we read. */
export interface JfSession {
  Id: string;
  UserId: string;
  Client: string;
  DeviceName: string;
  DeviceId: string;
  /** True only while the client holds a live connection that can take commands. */
  SupportsMediaControl: boolean;
  SupportsRemoteControl: boolean;
  PlayableMediaTypes?: string[];
  NowPlayingItem?: JfItem;
  NowPlayingQueue?: { Id: string }[];
  PlayState?: { PositionTicks?: number; IsPaused?: boolean; CanSeek?: boolean };
}

/**
 * Every session this token can see. For an ordinary user that's their own;
 * an admin sees everyone's, so callers filter by UserId. (`controllableByUserId`
 * would be the obvious filter, but it returns nothing for non-admins.)
 */
export const listSessions = (s: JellyfinSession) => jf<JfSession[]>(s, "/Sessions?activeWithinSeconds=960");

export type RemoteCommand = "PlayPause" | "NextTrack" | "PreviousTrack" | "Stop";

export const sendCommand = (s: JellyfinSession, sessionId: string, cmd: RemoteCommand) =>
  jf<void>(s, `/Sessions/${encodeURIComponent(sessionId)}/Playing/${cmd}`, { method: "POST" });

export const sendSeek = (s: JellyfinSession, sessionId: string, seconds: number) =>
  jf<void>(s, `/Sessions/${encodeURIComponent(sessionId)}/Playing/Seek?seekPositionTicks=${Math.round(seconds * TICKS_PER_SECOND)}`, { method: "POST" });

/** Start `itemIds` on another session (PlayNow replaces its queue). */
export function playOnSession(s: JellyfinSession, sessionId: string, itemIds: string[], startIndex = 0): Promise<void> {
  const q = new URLSearchParams({ playCommand: "PlayNow", itemIds: itemIds.join(","), startIndex: String(startIndex) });
  return jf<void>(s, `/Sessions/${encodeURIComponent(sessionId)}/Playing?${q}`, { method: "POST" });
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

export function socketUrl(s: JellyfinSession): string {
  // ApiKey, not api_key — same reason as streamUrl()
  const q = new URLSearchParams({ ApiKey: s.token, deviceId: s.deviceId });
  return `${s.server.replace(/^http/, "ws")}/socket?${q}`;
}

/** Commands this browser accepts from other Jellyfin clients (see remote.ts). */
const SUPPORTED_COMMANDS = ["SetVolume", "ToggleMute", "Mute", "Unmute"];

/**
 * Declare this browser playable and controllable. Takes effect for the
 * session bound to the open WebSocket — without one Jellyfin can't deliver
 * commands, and reports SupportsMediaControl false.
 */
export const reportCapabilities = (s: JellyfinSession) =>
  jf<void>(s, "/Sessions/Capabilities/Full", {
    method: "POST",
    // Video too: SyncPlay only lets a session into a group whose media it can play
    body: JSON.stringify({ PlayableMediaTypes: ["Audio", "Video"], SupportedCommands: SUPPORTED_COMMANDS, SupportsMediaControl: true }),
  }).catch(() => undefined);

// ── Video ─────────────────────────────────────────────────────────────────────

export interface JfLibrary { Id: string; Name: string; CollectionType?: string }

/** The user's libraries, as the server lists them (its own order and names). */
export async function libraries(s: JellyfinSession): Promise<JfLibrary[]> {
  const page = await jf<{ Items: JfLibrary[] }>(s, `/UserViews?userId=${s.userId}`);
  return page.Items;
}

/** Library kinds that hold video. Untyped ("mixed") libraries count too. */
const VIDEO_KINDS = new Set(["movies", "tvshows", "homevideos", "musicvideos", "mixed", ""]);
export const isVideoLibrary = (l: JfLibrary) => VIDEO_KINDS.has(l.CollectionType ?? "");

/** One library's films / series / videos, A–Z, paged. */
export const listLibrary = (s: JellyfinSession, libraryId: string, start = 0, sort?: Sort) =>
  itemsQuery(s, {
    ParentId: libraryId,
    IncludeItemTypes: "Movie,Series,Video,MusicVideo",
    SortBy: "SortName",
    ...sortParams(sort),
    StartIndex: start,
    Limit: PAGE_SIZE,
  });

export const listMovies = (s: JellyfinSession, start = 0) =>
  itemsQuery(s, { IncludeItemTypes: "Movie", SortBy: "SortName", StartIndex: start, Limit: PAGE_SIZE });
export const listSeries = (s: JellyfinSession, start = 0) =>
  itemsQuery(s, { IncludeItemTypes: "Series", SortBy: "SortName", StartIndex: start, Limit: PAGE_SIZE });

export const seasons = (s: JellyfinSession, seriesId: string) =>
  jf<JfPage>(s, `/Shows/${encodeURIComponent(seriesId)}/Seasons?userId=${s.userId}`);
export const episodes = (s: JellyfinSession, seriesId: string, seasonId: string) =>
  jf<JfPage>(s, `/Shows/${encodeURIComponent(seriesId)}/Episodes?userId=${s.userId}&seasonId=${encodeURIComponent(seasonId)}&Fields=Overview`);

/** The episode after `episodeId` in its series, or null at the end. */
export async function nextEpisode(s: JellyfinSession, seriesId: string, episodeId: string): Promise<JfItem | null> {
  const page = await jf<JfPage>(s, `/Shows/${encodeURIComponent(seriesId)}/Episodes?userId=${s.userId}&StartItemId=${encodeURIComponent(episodeId)}&Limit=2`);
  return page.Items[1] ?? null;
}

/** "Continue watching" — started, not finished. */
export async function resumeVideos(s: JellyfinSession): Promise<JfPage> {
  const q = `userId=${s.userId}&MediaTypes=Video&Limit=20`;
  try {
    return await jf<JfPage>(s, `/UserItems/Resume?${q}`);
  } catch (e) {
    // Pre-10.9 servers only have the per-user path
    if (e instanceof JellyfinError && e.status === 404) return jf<JfPage>(s, `/Users/${s.userId}/Items/Resume?${q}`);
    throw e;
  }
}

export const nextUp = (s: JellyfinSession) => jf<JfPage>(s, `/Shows/NextUp?userId=${s.userId}&Limit=20`);

export interface JfMediaStream {
  Index: number;
  Type: "Video" | "Audio" | "Subtitle" | string;
  Codec?: string;
  Language?: string;
  DisplayTitle?: string;
  IsDefault?: boolean;
  IsTextSubtitleStream?: boolean;
  DeliveryMethod?: "External" | "Encode" | "Embed" | "Hls" | string;
  DeliveryUrl?: string;
}

export interface JfMediaSource {
  Id: string;
  Container?: string;
  SupportsDirectPlay: boolean;
  SupportsTranscoding: boolean;
  TranscodingUrl?: string;
  MediaStreams: JfMediaStream[];
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
}

export interface JfPlaybackInfo {
  PlaySessionId: string;
  MediaSources: JfMediaSource[];
}

/**
 * What this browser can decode, for Jellyfin to choose direct play vs
 * transcode. Probed rather than assumed: HEVC, AV1 and AC-3 vary by browser,
 * OS and hardware. Transcodes go to HLS (h264/aac) — played natively on
 * Safari, through hls.js elsewhere. Image subtitles (PGS, VobSub) can't be
 * rendered by a browser, so those are burned in by the server.
 */
export function browserDeviceProfile() {
  const ms = (type: string) => {
    try { return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(type); } catch { return false; }
  };
  const video = ["h264"];
  if (ms('video/mp4; codecs="hvc1.1.6.L93.B0"')) video.push("hevc");
  if (ms('video/mp4; codecs="av01.0.05M.08"')) video.push("av1");
  if (ms('video/webm; codecs="vp9"')) video.push("vp9");
  const audio = ["aac", "mp3", "opus", "flac"];
  if (ms('audio/mp4; codecs="ac-3"')) audio.push("ac3");
  if (ms('audio/mp4; codecs="ec-3"')) audio.push("eac3");
  return {
    MaxStreamingBitrate: 120_000_000,
    DirectPlayProfiles: [
      { Container: "mp4,m4v", Type: "Video", VideoCodec: video.join(","), AudioCodec: audio.join(",") },
      { Container: "webm", Type: "Video", VideoCodec: "vp8,vp9,av1", AudioCodec: "vorbis,opus" },
    ],
    TranscodingProfiles: [
      { Container: "ts", Type: "Video", VideoCodec: "h264", AudioCodec: "aac,mp3", Protocol: "hls", Context: "Streaming",
        MaxAudioChannels: "2", MinSegments: 1, BreakOnNonKeyFrames: true },
    ],
    SubtitleProfiles: [
      // WebVTT only: it's all <track> can read. Listing srt/ass here makes the
      // server hand those over unconverted, and the browser shows nothing.
      { Format: "vtt", Method: "External" },
      ...["pgssub", "dvdsub", "dvbsub"].map((Format) => ({ Format, Method: "Encode" })),
    ],
    CodecProfiles: [],
    ContainerProfiles: [],
  };
}

export async function playbackInfo(
  s: JellyfinSession,
  itemId: string,
  opts: { audioIndex?: number; subtitleIndex?: number; forceTranscode?: boolean } = {},
): Promise<JfPlaybackInfo> {
  const q = new URLSearchParams({ userId: s.userId, AutoOpenLiveStream: "false" });
  if (opts.audioIndex !== undefined) q.set("AudioStreamIndex", String(opts.audioIndex));
  if (opts.subtitleIndex !== undefined) q.set("SubtitleStreamIndex", String(opts.subtitleIndex));
  if (opts.forceTranscode) { q.set("EnableDirectPlay", "false"); q.set("EnableDirectStream", "false"); }
  return jf<JfPlaybackInfo>(s, `/Items/${encodeURIComponent(itemId)}/PlaybackInfo?${q}`, {
    method: "POST",
    body: JSON.stringify({ DeviceProfile: browserDeviceProfile() }),
  });
}

/**
 * A server-built path (TranscodingUrl, subtitle DeliveryUrl) as an absolute
 * URL carrying our key as `ApiKey`: servers embed the legacy `api_key`, which
 * newer ones refuse (see streamUrl()).
 */
export function withApiKey(s: JellyfinSession, path: string): string {
  const u = new URL(path, s.server + "/");
  u.searchParams.delete("api_key");
  u.searchParams.set("ApiKey", s.token);
  return u.toString();
}

export function directVideoUrl(s: JellyfinSession, itemId: string, src: JfMediaSource, playSessionId: string): string {
  const q = new URLSearchParams({ static: "true", MediaSourceId: src.Id, PlaySessionId: playSessionId, DeviceId: s.deviceId, ApiKey: s.token });
  return `${s.server}/Videos/${encodeURIComponent(itemId)}/stream?${q}`;
}

export interface VideoReport {
  itemId: string;
  mediaSourceId: string;
  playSessionId: string;
  seconds: number;
  paused: boolean;
  transcoding: boolean;
  audioIndex?: number;
  subtitleIndex?: number;
}

export function reportVideo(s: JellyfinSession, kind: "start" | "progress" | "stop", r: VideoReport): void {
  const path = kind === "start" ? "/Sessions/Playing" : kind === "progress" ? "/Sessions/Playing/Progress" : "/Sessions/Playing/Stopped";
  jf<void>(s, path, {
    method: "POST",
    body: JSON.stringify({
      ItemId: r.itemId,
      MediaSourceId: r.mediaSourceId,
      PlaySessionId: r.playSessionId,
      PositionTicks: Math.round(r.seconds * TICKS_PER_SECOND),
      IsPaused: r.paused,
      CanSeek: true,
      PlayMethod: r.transcoding ? "Transcode" : "DirectPlay",
      AudioStreamIndex: r.audioIndex,
      SubtitleStreamIndex: r.subtitleIndex,
    }),
  }).catch(() => undefined);
}

/** Free the server's transcoder for a session we're done with. */
export const stopEncoding = (s: JellyfinSession, playSessionId: string) =>
  jf<void>(s, `/Videos/ActiveEncodings?deviceId=${encodeURIComponent(s.deviceId)}&playSessionId=${encodeURIComponent(playSessionId)}`, { method: "DELETE" })
    .catch(() => undefined);

// ── SyncPlay (watch / listen together) ────────────────────────────────────────

/** POST to a SyncPlay endpoint; all of them answer 204. */
export const syncPlay = (s: JellyfinSession, action: string, body?: unknown) =>
  jf<void>(s, `/SyncPlay/${action}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export interface SyncPlayGroup { GroupId: string; GroupName: string; State: string; Participants: string[] }
export const syncPlayGroups = (s: JellyfinSession) => jf<SyncPlayGroup[]>(s, "/SyncPlay/List");

/** .NET timestamps carry 7 fractional digits; not every Date parser takes more than 3. */
export const parseServerDate = (iso: string) => Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));

/**
 * One clock sample against the server: its offset (server − local, ms) and
 * the network round trip that sample suffered (smaller = more trustworthy).
 */
export async function clockSample(s: JellyfinSession): Promise<{ offset: number; rtt: number }> {
  const t0 = Date.now();
  const r = await jf<{ RequestReceptionTime: string; ResponseTransmissionTime: string }>(s, "/GetUtcTime");
  const t3 = Date.now();
  const t1 = parseServerDate(r.RequestReceptionTime);
  const t2 = parseServerDate(r.ResponseTransmissionTime);
  return { offset: (t1 - t0 + (t2 - t3)) / 2, rtt: t3 - t0 - (t2 - t1) };
}
