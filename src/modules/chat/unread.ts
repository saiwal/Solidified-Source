// src/modules/chat/unread.ts
// Browser-only "unread" state for chatrooms: when you last saw each room,
// compared against the room list's `last_other` (newest message by someone
// else). Per browser, in localStorage — reading on the phone doesn't clear the
// laptop's dot.
import { createSignal } from "solid-js";
import { persistedSignal } from "@utsukta/spa-core/lib/persisted";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { currentNick, isLocalUser } from "@utsukta/spa-core/store/auth-store";
import { fetchRooms, type ChatRoom, type ChatRoomListResponse } from "./api";
import { bookmarks, isRemoteBookmark, refreshChatBookmarks, type ChatBookmark } from "./bookmarks";

// Chat timestamps are UTC "YYYY-MM-DD HH:MM:SS", so plain string comparison
// orders them.
const nowUtc = () => new Date().toISOString().slice(0, 19).replace("T", " ");

const [seen, setSeen] = persistedSignal<Record<string, string>>(
  "hz-chat-seen",
  {},
  (raw) => {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : undefined;
  },
  JSON.stringify,
);

// Rooms never opened in this browser count as seen up to the first time this
// ran, so the feature doesn't light up every existing room on day one.
// ponytail: compares server time against this browser's clock; skew of a few
// minutes only shifts which pre-existing messages count as unread.
const [since] = persistedSignal("hz-chat-seen-since", nowUtc());
try { localStorage.setItem("hz-chat-seen-since", since()); } catch { /* best-effort */ }

const key = (nick: string, roomId: number) => `${nick}:${roomId}`;

export function markChatSeen(nick: string, roomId: number, created: string): void {
  const k = key(nick, roomId);
  if ((seen()[k] ?? "") < created) setSeen({ ...seen(), [k]: created });
}

export const isChatUnread = (nick: string, room: Pick<ChatRoom, "id" | "last_other">): boolean =>
  !!room.last_other && room.last_other > (seen()[key(nick, room.id)] ?? since());

// Rooms on another hub are keyed by their bookmark url; they open there, so
// the SPA never sees their messages and "seen" is simply "clicked just now".
export const markRemoteChatSeen = (bm: ChatBookmark): void =>
  setSeen({ ...seen(), [bm.url]: nowUtc() });

export const isRemoteChatUnread = (bm: ChatBookmark): boolean =>
  !!bm.last_other && bm.last_other > (seen()[bm.url] ?? since());

// ── Nav badge: unread rooms on your own channel + bookmarked remote rooms ──

// The query cache isn't reactive; this signal re-runs the badge whenever a
// chat-rooms list lands (from the poll below or any room-list widget).
const [cacheTick, bumpCache] = createSignal(undefined, { equals: false });
queryClient.getQueryCache().subscribe((e) => {
  if (e.type === "updated" && e.query.queryKey[0] === "chat-rooms") bumpCache();
});

const POLL_MS = 60_000;
let polling = false;

// Started lazily by the badge, so only when the chat nav item is rendered.
function startPolling(nick: string): void {
  polling = true;
  let stopped = false;
  const tick = async () => {
    if (stopped || document.visibilityState !== "visible") return;
    try {
      // Same key as ChatRoomsListWidget, so a list fetched within the minute is reused.
      // Remote rooms' times ride the bookmark list; only re-read it if there are any.
      if (bookmarks().some(isRemoteBookmark)) void refreshChatBookmarks();
      await queryClient.fetchQuery({ queryKey: ["chat-rooms", nick], queryFn: () => fetchRooms(nick), staleTime: POLL_MS });
    } catch (e) {
      // 403 = app not installed / no permission: stop asking. Anything else
      // (offline, 5xx) just retries on the next tick.
      if (String(e).includes("403")) {
        stopped = true;
        clearInterval(timer);
      }
    }
  };
  const timer = setInterval(tick, POLL_MS);
  document.addEventListener("visibilitychange", () => void tick());
  void tick();
}

export function chatNavBadge(): number | undefined {
  const nick = currentNick();
  if (!isLocalUser() || !nick) return undefined;
  if (!polling) {
    startPolling(nick);
    void refreshChatBookmarks(); // first load; later ticks refresh only if any are remote
  }
  cacheTick();
  const data = queryClient.getQueryData<ChatRoomListResponse>(["chat-rooms", nick]);
  const own = data?.rooms.filter((r) => isChatUnread(nick, r)).length ?? 0;
  const remote = bookmarks().filter((b) => isRemoteBookmark(b) && isRemoteChatUnread(b)).length;
  return own + remote || undefined;
}
