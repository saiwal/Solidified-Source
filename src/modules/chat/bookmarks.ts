// src/modules/chat/bookmarks.ts
// Shared reactive state for chat room bookmarks (used by widget + room view).

import { createSignal, batch } from "solid-js";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { isLocalUser } from "@utsukta/spa-core/store/auth-store";
import { subscribeToPush } from "@utsukta/spa-core/lib/webPush";

export interface ChatBookmark {
  id: number;
  url: string;
  /** Where to open it: `url` with zid auth for a room on another hub. */
  visit_url?: string;
  title: string;
  /** Room on another hub: newest message by someone else, as last notified (ChatFed). */
  last_other?: string | null;
  /** Room on another hub: Web Push when a notice arrives (opt-in). */
  push?: boolean;
}

const [bookmarks, setBookmarks] = createSignal<ChatBookmark[]>([]);
const [loaded, setLoaded] = createSignal(false);
const [loading, setLoading] = createSignal(false);

export { bookmarks, loaded, loading };

export async function loadChatBookmarks(): Promise<void> {
  if (loaded() || loading() || !isLocalUser()) return;
  setLoading(true);
  try {
    const res = await apiFetch("/spa/bookmarks/chat");
    if (res.ok) {
      const json = await res.json();
      batch(() => {
        setBookmarks(json.data?.bookmarks ?? []);
        setLoaded(true);
      });
    }
  } finally {
    setLoading(false);
  }
}

/** Re-read the list in place (no loading state), for the unread poll. */
export async function refreshChatBookmarks(): Promise<void> {
  if (!loaded()) return loadChatBookmarks();
  const res = await apiFetch("/spa/bookmarks/chat");
  if (res.ok) setBookmarks((await res.json()).data?.bookmarks ?? []);
}

/**
 * Web Push for a remote room. Turning it on registers this device for push
 * first (idempotent) — a preference with no subscription behind it would
 * silently never fire. Returns false when the browser can't or won't push.
 */
export async function setChatPush(id: number, on: boolean): Promise<boolean> {
  if (on && !(await subscribeToPush())) return false;
  const res = await apiFetch("/spa/bookmarks/chat-push", {
    method: "POST",
    body: JSON.stringify({ id, push: on }),
  });
  if (!res.ok) return false;
  setBookmarks((prev) => prev.map((b) => (b.id === id ? { ...b, push: on } : b)));
  return true;
}

/** A bookmark for a room on another hub (opens there, dot comes from notices). */
export const isRemoteBookmark = (bm: ChatBookmark): boolean => {
  try {
    return new URL(bm.url, location.origin).origin !== location.origin;
  } catch {
    return false;
  }
};

export function isRoomBookmarked(nick: string, roomId: number): boolean {
  const url = `${window.location.origin}/chat/${nick}/${roomId}`;
  return bookmarks().some((b) => b.url === url);
}

export function bookmarkIdForRoom(nick: string, roomId: number): number | undefined {
  const url = `${window.location.origin}/chat/${nick}/${roomId}`;
  return bookmarks().find((b) => b.url === url)?.id;
}

export async function addChatBookmark(nick: string, roomId: number, title: string): Promise<void> {
  const url = `${window.location.origin}/chat/${nick}/${roomId}`;
  const res = await apiFetch("/spa/bookmarks", {
    method: "POST",
    body: JSON.stringify({ url, title, ischat: true }),
  });
  if (res.ok) {
    const json = await res.json();
    const id: number | null = json.data?.mitem_id ?? null;
    if (id) setBookmarks((prev) => [...prev, { id, url, title }]);
  }
}

export async function removeChatBookmark(id: number): Promise<void> {
  const res = await apiFetch(`/spa/bookmarks/${id}`, { method: "DELETE" });
  if (res.ok) setBookmarks((prev) => prev.filter((b) => b.id !== id));
}

export function resetChatBookmarks(): void {
  batch(() => {
    setBookmarks([]);
    setLoaded(false);
  });
}
