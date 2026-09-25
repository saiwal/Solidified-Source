// src/modules/bookmarks/api.ts
//
// Bookmarks are Hubzilla `menu` + `menu_item` rows. A folder carrying
// MENU_SYSTEM on top of MENU_BOOKMARK came from somebody else's post, which is
// the `system` flag below and the own/connections split core renders as two
// sections.
import { apiFetch } from "@utsukta/spa-core/lib/fetch";

export interface BookmarkItem {
  id: number;
  /** Raw stored link — what the edit form shows. */
  url: string;
  /** What to actually open: carries magic auth when the link is to a known zot hub. */
  visit_url: string;
  title: string;
  order: number;
  is_chat: boolean;
  is_zid: boolean;
  private: boolean;
}

export interface BookmarkMenu {
  id: number;
  /** Channel-wide menu key. For post-derived folders this is "<hash16> Name" — show `label`. */
  name: string;
  label: string;
  /** Saved from a connection's post rather than created by you. */
  system: boolean;
  items: BookmarkItem[];
}

async function send<T>(path: string, init?: RequestInit, fallbackMsg = "Request failed"): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const msg = await res.json().then((j) => j?.error?.message).catch(() => null);
    throw new Error(msg || fallbackMsg);
  }
  return (await res.json()).data as T;
}

export async function fetchAllBookmarks(): Promise<BookmarkMenu[]> {
  const data = await send<{ menus?: BookmarkMenu[] }>(
    "/spa/bookmarks", undefined, "Failed to fetch bookmarks");
  return data.menus ?? [];
}

export interface NewBookmark {
  url: string;
  title: string;
  /** Existing folder, or `menu_name` to create/target one by name. Neither = your own derived folder. */
  menu_id?: number;
  menu_name?: string;
  private?: boolean;
  /** A chatroom: lands in Bookmarked Rooms (MENU_ITEM_CHATROOM). */
  ischat?: boolean;
}

export async function createBookmark(b: NewBookmark): Promise<number | null> {
  const data = await send<{ mitem_id: number | null }>(
    "/spa/bookmarks", { method: "POST", body: JSON.stringify(b) }, "Failed to add bookmark");
  return data.mitem_id;
}

/** Save links out of a post. Omit `urls` to save every #^-marked link, as core does. */
export async function saveBookmarksFromItem(opts: {
  item: string;
  urls?: { url: string; title: string }[];
  menu_id?: number;
  menu_name?: string;
}): Promise<number> {
  const data = await send<{ count: number }>(
    "/spa/bookmarks/item", { method: "POST", body: JSON.stringify(opts) },
    "Failed to save bookmarks");
  // A saved chatroom link (e.g. from an invite) belongs in the Bookmarked Rooms widget too.
  void import("@/modules/chat/bookmarks").then((m) => { m.resetChatBookmarks(); void m.loadChatBookmarks(); });
  return data.count;
}

/** Edit title/url, and/or move to another folder by passing `menu_id`. */
export async function updateBookmark(
  id: number,
  patch: { title?: string; url?: string; menu_id?: number },
): Promise<void> {
  await send(`/spa/bookmarks/${id}`, { method: "POST", body: JSON.stringify(patch) },
    "Failed to update bookmark");
}

export async function deleteBookmark(mitemId: number): Promise<void> {
  await send(`/spa/bookmarks/${mitemId}`, { method: "DELETE" }, "Failed to delete bookmark");
}

/** Create a folder, or rename one by passing its `menu_id`. */
export async function saveFolder(f: { menu_id?: number; name: string; desc?: string }): Promise<number> {
  const data = await send<{ menu_id: number }>(
    "/spa/bookmarks/folder", { method: "POST", body: JSON.stringify(f) },
    "Failed to save folder");
  return data.menu_id;
}

export async function deleteFolder(menuId: number): Promise<void> {
  await send(`/spa/bookmarks/folder/${menuId}`, { method: "DELETE" }, "Failed to delete folder");
}

export async function reorderBookmarks(menuId: number, ids: number[]): Promise<void> {
  await send("/spa/bookmarks/reorder",
    { method: "POST", body: JSON.stringify({ menu_id: menuId, ids }) },
    "Failed to reorder bookmarks");
}
