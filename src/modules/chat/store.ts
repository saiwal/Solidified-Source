// src/modules/chat/store.ts
import { createSignal, batch } from "solid-js";
import { persistedSignal } from "@utsukta/spa-core/lib/persisted";
import type { ChatRoom, ChatMessage, PresenceMember, ChatRoomAcl } from "./api";
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

// ── Active room chat state ─────────────────────────────────────────────────────

const [messages, setMessages] = createSignal<ChatMessage[]>([]);
const [presence, setPresence] = createSignal<PresenceMember[]>([]);
const [chatLoading, setChatLoading] = createSignal(false);
const [sendError, setSendError] = createSignal<string | null>(null);
const [activeRoomId, setActiveRoomId] = createSignal<number | null>(null);
const [viewerHash, setViewerHash] = createSignal("");
const [roomName, setRoomName] = createSignal("");
const [roomExpire, setRoomExpire] = createSignal(0);
const [roomIsOwner, setRoomIsOwner] = createSignal(false);
const [roomAcl, setRoomAcl] = createSignal<ChatRoomAcl | null>(null);

export { messages, presence, chatLoading, sendError, activeRoomId, viewerHash, roomName, roomExpire, roomIsOwner, roomAcl };

// Track the latest message timestamp for polling
let lastSince: string | undefined;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export async function enterRoom(
  nick: string,
  roomId: number,
): Promise<void> {
  if (activeRoomId() === roomId) return;

  stopPolling();
  batch(() => {
    setActiveRoomId(roomId);
    setMessages([]);
    setPresence([]);
    setRoomName("");
    setRoomExpire(0);
    setRoomIsOwner(false);
    setRoomAcl(null);
    lastSince = undefined;
    setChatLoading(true);
  });

  try {
    await apiJoin(nick, roomId);
    const data = await fetchMessages(nick, roomId, undefined, 50);
    batch(() => {
      setMessages(data.messages);
      setPresence(data.presence);
      if (data.viewer_hash)           setViewerHash(data.viewer_hash);
      if (data.room_name)             setRoomName(data.room_name);
      if (data.room_expire != null)   setRoomExpire(data.room_expire);
      if (data.is_room_owner != null) setRoomIsOwner(data.is_room_owner);
      if (data.room_acl)              setRoomAcl(data.room_acl);
      if (data.messages.length > 0)
        lastSince = data.messages[data.messages.length - 1].created;
      setChatLoading(false);
    });
  } catch {
    setChatLoading(false);
  }

  // Poll every 3 s for new messages
  pollTimer = setInterval(() => pollMessages(nick, roomId), 3000);
}

async function pollMessages(nick: string, roomId: number): Promise<void> {
  if (activeRoomId() !== roomId) return;
  try {
    const data = await fetchMessages(nick, roomId, lastSince, 50);
    if (data.messages.length > 0) {
      batch(() => {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !existingIds.has(m.id));
          const next = [...prev, ...fresh];
          // Cap at 200 messages
          return next.length > 200 ? next.slice(next.length - 200) : next;
        });
        lastSince = data.messages[data.messages.length - 1].created;
      });
    }
    // Always update presence
    setPresence(data.presence);
  } catch {
    // silently retry
  }
}

export function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function exitRoom(nick: string, roomId: number): Promise<void> {
  stopPolling();
  setActiveRoomId(null);
  try {
    await apiLeave(nick, roomId);
  } catch {
    // best-effort
  }
}

// ── Send ───────────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  nick: string,
  roomId: number,
  body: string,
): Promise<void> {
  setSendError(null);
  try {
    await apiSendMessage(nick, roomId, body);
    // Immediately poll so the message appears without waiting for the interval
    await pollMessages(nick, roomId);
  } catch (e: any) {
    setSendError(e.message ?? "Send failed");
  }
}

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
  await loadRooms(nick);
  return room;
}

export async function updateChatRoomExpire(
  nick: string,
  roomId: number,
  expire: number,
): Promise<void> {
  const result = await apiUpdate(nick, roomId, { expire });
  setRoomExpire(result.expire);
  setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, expire: result.expire } : r));
}

export async function deleteChatRoom(
  nick: string,
  roomId: number,
): Promise<void> {
  await apiDrop(nick, roomId);
  setRooms((prev) => prev.filter((r) => r.id !== roomId));
}

export function resetChat(): void {
  stopPolling();
  batch(() => {
    setRooms([]);
    setMessages([]);
    setPresence([]);
    setActiveRoomId(null);
    setViewerHash("");
    setRoomExpire(0);
    setRoomIsOwner(false);
    setRoomAcl(null);
    lastSince = undefined;
  });
}

// ── Pinned rooms (sidebar widget, localStorage-backed) ─────────────────────────

export interface PinnedRoom {
  nick: string;
  roomId: number;
  name: string;
  acl: ChatRoomAcl | null;
}

const [pinnedRooms, setPinnedRooms] = persistedSignal<PinnedRoom[]>(
  "hz-pinned-chats",
  [],
  (raw) => {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PinnedRoom[]) : undefined;
  },
  JSON.stringify,
);
export { pinnedRooms };

export function pinRoom(room: PinnedRoom): void {
  const prev = pinnedRooms();
  const existing = prev.findIndex((r) => r.roomId === room.roomId && r.nick === room.nick);
  setPinnedRooms(
    existing !== -1
      ? prev.map((r, i) => (i === existing ? { ...r, ...room } : r))
      : [...prev, room],
  );
}

export function unpinRoom(nick: string, roomId: number): void {
  setPinnedRooms(pinnedRooms().filter((r) => !(r.nick === nick && r.roomId === roomId)));
}

export function isRoomPinned(nick: string, roomId: number): boolean {
  return pinnedRooms().some((r) => r.nick === nick && r.roomId === roomId);
}
