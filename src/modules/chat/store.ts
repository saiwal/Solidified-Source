// src/modules/chat/store.ts
import { createSignal, batch, onCleanup } from "solid-js";
import type { ChatRoom, ChatMessage, PresenceMember, ChatRoomAcl } from "./api";
import type { MimeType } from "@utsukta/spa-core/lib/mimetypes";
import { aclIsRestricted, type aclPayload } from "@/shared/editor/components/acl-mode";
import { queryClient } from "@utsukta/spa-core/lib/query-client";

// ChatRoomsListWidget / RoomCardWidget cache room lists by query.
const invalidateRoomQueries = () => {
  void queryClient.invalidateQueries({ queryKey: ["chat-rooms"] });
  void queryClient.invalidateQueries({ queryKey: ["chat-room"] });
};
import {
  fetchRooms,
  fetchMessages,
  sendMessage as apiSendMessage,
  joinRoom as apiJoin,
  leaveRoom as apiLeave,
  createRoom as apiCreate,
  dropRoom as apiDrop,
  updateRoom as apiUpdate,
} from "./api";

// ── Room list state (persists across navigation) ───────────────────────────────

const [rooms, setRooms] = createSignal<ChatRoom[]>([]);
const [roomsLoading, setRoomsLoading] = createSignal(false);
const [isOwner, setIsOwner] = createSignal(false);
const [chatroomsInstalled, setChatroomsInstalled] = createSignal(true);

export { rooms, roomsLoading, isOwner, chatroomsInstalled };

export async function loadRooms(nick: string): Promise<void> {
  if (roomsLoading()) return;
  setRoomsLoading(true);
  try {
    const data = await fetchRooms(nick);
    batch(() => {
      setRooms(data.rooms);
      setIsOwner(data.is_owner);
      setChatroomsInstalled(data.chatrooms_installed);
    });
  } finally {
    setRoomsLoading(false);
  }
}

// ── Room sessions ─────────────────────────────────────────────────────────────

/**
 * One joined room: its own messages, presence and 3 s poller, so several chat
 * windows can be open at once. Must be created under an owner (ChatWindow) —
 * leaving the room and stopping the poller hang off its cleanup.
 */
export function createRoomSession(nick: string, roomId: number) {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [presence, setPresence] = createSignal<PresenceMember[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [viewerHash, setViewerHash] = createSignal("");
  const [name, setName] = createSignal("");
  const [expire, setExpire] = createSignal(0);
  const [isOwner, setIsOwner] = createSignal(false);
  const [acl, setAcl] = createSignal<ChatRoomAcl | null>(null);

  let lastSince: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  async function poll(): Promise<void> {
    try {
      const data = await fetchMessages(nick, roomId, lastSince, 50);
      if (disposed) return;
      batch(() => {
        if (data.messages.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const next = [...prev, ...data.messages.filter((m) => !existingIds.has(m.id))];
            // Cap at 200 messages
            return next.length > 200 ? next.slice(next.length - 200) : next;
          });
          lastSince = data.messages[data.messages.length - 1].created;
        }
        setPresence(data.presence);
      });
    } catch {
      // silently retry
    }
  }

  void (async () => {
    try {
      await apiJoin(nick, roomId);
      const data = await fetchMessages(nick, roomId, undefined, 50);
      if (disposed) return;
      batch(() => {
        setMessages(data.messages);
        setPresence(data.presence);
        if (data.viewer_hash)           setViewerHash(data.viewer_hash);
        if (data.room_name)             setName(data.room_name);
        if (data.room_expire != null)   setExpire(data.room_expire);
        if (data.is_room_owner != null) setIsOwner(data.is_room_owner);
        if (data.room_acl)              setAcl(data.room_acl);
        if (data.messages.length > 0)
          lastSince = data.messages[data.messages.length - 1].created;
      });
    } catch {
      // fall through to polling — the next tick may succeed
    } finally {
      setLoading(false);
    }
    // The window can close while the join is still in flight.
    if (!disposed) timer = setInterval(poll, 3000);
  })();

  onCleanup(() => {
    disposed = true;
    clearInterval(timer);
    apiLeave(nick, roomId).catch(() => {}); // best-effort
  });

  return {
    nick,
    roomId,
    messages,
    presence,
    loading,
    viewerHash,
    name,
    expire,
    isOwner,
    acl,
    /** Throws on failure, so the composer store can surface it. */
    async send(body: string, mimetype: MimeType = "text/bbcode"): Promise<void> {
      await apiSendMessage(nick, roomId, body, mimetype);
      // Poll right away so the message appears without waiting for the interval
      await poll();
    },
    /** Rewrite who may see/join the room — AclPicker state as aclPayload(). */
    async setVisibility(p: ReturnType<typeof aclPayload>): Promise<void> {
      const { scope, ...lists } = p;
      const result = await apiUpdate(nick, roomId, { ...lists, visibility: scope ?? (aclIsRestricted(lists) ? "custom" : "public") });
      setAcl(result.room_acl);
    },
    async setExpire(minutes: number): Promise<void> {
      const result = await apiUpdate(nick, roomId, { expire: minutes });
      setExpire(result.expire);
      setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, expire: result.expire } : r));
    },
  };
}

export type RoomSession = ReturnType<typeof createRoomSession>;

// ── Room management ───────────────────────────────────────────────────────────

export async function createChatRoom(
  nick: string,
  opts: {
    name: string;
    expire: number;
    visibility: import('./api').RoomVisibility;
    allow_cid?: string[];
    allow_gid?: string[];
    deny_cid?: string[];
    deny_gid?: string[];
  },
): Promise<{ id: number; name: string }> {
  const room = await apiCreate(nick, opts);
  invalidateRoomQueries();
  await loadRooms(nick);
  return room;
}

export async function deleteChatRoom(
  nick: string,
  roomId: number,
): Promise<void> {
  await apiDrop(nick, roomId);
  invalidateRoomQueries();
  setRooms((prev) => prev.filter((r) => r.id !== roomId));
}
