// src/modules/chat/api.ts
import { apiFetch } from "@utsukta/spa-core/lib/fetch";

export interface ChatRoom {
  id: number;
  name: string;
  expire: number;
  in_room: number;
  last_msg: string | null;
  is_owner: boolean;
}

export interface ChatRoomListResponse {
  nick: string;
  rooms: ChatRoom[];
  is_owner: boolean;
  chatrooms_installed: boolean;
}

export interface ChatRoomDetail {
  id: number;
  name: string;
  expire: number;
  in_room: number;
  is_owner: boolean;
  nick: string;
}

export interface ChatMessage {
  id: number;
  body: string;
  created: string;
  author_name: string;
  author_avatar: string;
  author_url: string;
  author_hash: string;
}

export interface PresenceMember {
  hash: string;
  name: string;
  avatar: string;
  url: string;
  status: string;
}

export interface ChatRoomAcl {
  allow_cid: string[];
  allow_gid: string[];
  deny_cid:  string[];
  deny_gid:  string[];
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
  presence: PresenceMember[];
  viewer_hash: string;
  room_name: string;
  room_expire?: number;
  is_room_owner?: boolean;
  room_acl?: ChatRoomAcl;
}

// ── Room list ─────────────────────────────────────────────────────────────────

export async function fetchRooms(nick: string): Promise<ChatRoomListResponse> {
  const res = await apiFetch(`/spa/chat/${nick}`);
  if (!res.ok) throw new Error(`Failed to fetch rooms: ${res.status}`);
  const json = await res.json();
  return json.data as ChatRoomListResponse;
}

export async function fetchRoomDetail(
  nick: string,
  roomId: number,
): Promise<ChatRoomDetail> {
  const res = await apiFetch(`/spa/chat/${nick}/${roomId}`);
  if (!res.ok) throw new Error(`Failed to fetch room: ${res.status}`);
  const json = await res.json();
  return json.data as ChatRoomDetail;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function fetchMessages(
  nick: string,
  roomId: number,
  since?: string,
  limit = 50,
): Promise<ChatMessagesResponse> {
  const res = await apiFetch(`/spa/chat/${nick}/${roomId}/messages`, {
    method: "POST",
    body: JSON.stringify({ since, limit }),
  });
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
  const json = await res.json();
  return json.data as ChatMessagesResponse;
}

export async function sendMessage(
  nick: string,
  roomId: number,
  body: string,
  mimetype = "text/bbcode",
): Promise<void> {
  const res = await apiFetch(`/spa/chat/${nick}/${roomId}/send`, {
    method: "POST",
    body: JSON.stringify({ body, mimetype }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? `Send failed: ${res.status}`);
  }
}

// ── Presence ──────────────────────────────────────────────────────────────────

export async function joinRoom(nick: string, roomId: number): Promise<void> {
  await apiFetch(`/spa/chat/${nick}/${roomId}/join`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function leaveRoom(nick: string, roomId: number): Promise<void> {
  await apiFetch(`/spa/chat/${nick}/${roomId}/leave`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ── Room management ───────────────────────────────────────────────────────────

export async function createRoom(
  nick: string,
  opts: {
    name: string;
    expire: number;
    visibility: RoomVisibility;
    allow_cid?: string[];
    allow_gid?: string[];
    deny_cid?: string[];
    deny_gid?: string[];
  },
): Promise<{ id: number; name: string; visibility: string }> {
  const res = await apiFetch(`/spa/chat/${nick}/new`, {
    method: "POST",
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? `Create failed: ${res.status}`);
  }
  const json = await res.json();
  return json.data;
}

export async function updateRoom(
  nick: string,
  roomId: number,
  opts: {
    expire?: number;
    name?: string;
    visibility?: RoomVisibility;
    allow_cid?: string[];
    allow_gid?: string[];
    deny_cid?: string[];
    deny_gid?: string[];
  },
): Promise<{ id: number; name: string; expire: number; room_acl: ChatRoomAcl }> {
  const res = await apiFetch(`/spa/chat/${nick}/${roomId}/update`, {
    method: "POST",
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? `Update failed: ${res.status}`);
  }
  const json = await res.json();
  return json.data;
}

export async function dropRoom(nick: string, roomId: number): Promise<void> {
  const res = await apiFetch(`/spa/chat/${nick}/${roomId}/drop`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Drop failed: ${res.status}`);
}

// ── ACL options ───────────────────────────────────────────────────────────────

export interface AclGroup {
  id: number;
  hash: string;
  name: string;
}

export interface AclConnection {
  hash: string;
  name: string;
  avatar: string;
  url: string;
  addr: string;
}

export interface AclOptions {
  default_group: string;
  groups: AclGroup[];
  connections: AclConnection[];
}

export type RoomVisibility = 'public' | 'connections' | 'private' | 'custom';

export async function fetchAclOptions(nick: string): Promise<AclOptions> {
  const res = await apiFetch(`/spa/chat/${nick}/acl-options`);
  if (!res.ok) throw new Error(`Failed to fetch ACL options: ${res.status}`);
  const json = await res.json();
  return json.data as AclOptions;
}
