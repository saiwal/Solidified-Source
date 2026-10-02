// src/modules/messenger/pins.ts
// Pinned DM conversations are ordinary Hubzilla bookmarks of the
// conversation's Messenger url — the same storage as chatroom bookmarks, so a
// pin also appears in the Bookmarks app and opens the conversation from there.
import { useQuery } from "@tanstack/solid-query";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { isLocalUser } from "@utsukta/spa-core/store/auth-store";

export interface DmPin {
  id: number;
  title: string;
  /** The conversation's group key (sorted participant hashes). */
  key: string;
}

const KEY = ["messenger-pins"];

/** `/messenger/<nick>/dms/<key>` as stored: absolute, on this hub. */
export const pinUrl = (base: string, key: string) =>
  `${location.origin}${base}/dms/${encodeURIComponent(key)}`;

async function fetchPins(base: string): Promise<DmPin[]> {
  const res = await apiFetch("/spa/bookmarks");
  if (!res.ok) return [];
  const menus: { items: { id: number; url: string; title: string }[] }[] = (await res.json()).data?.menus ?? [];
  const prefix = `${location.origin}${base}/dms/`;
  return menus.flatMap((m) => m.items)
    .filter((i) => i.url.startsWith(prefix) && !i.url.slice(prefix.length).includes("/"))
    .map((i) => ({ id: i.id, title: i.title, key: decodeURIComponent(i.url.slice(prefix.length)) }));
}

/** This Messenger's pinned conversations (local users only — bookmarks are theirs). */
export function usePins(base: () => string) {
  return useQuery(() => ({
    queryKey: [...KEY, base()],
    queryFn: () => fetchPins(base()),
    enabled: isLocalUser(),
  }));
}

export async function setPinned(base: string, key: string, title: string, pin: DmPin | undefined): Promise<void> {
  const res = pin
    ? await apiFetch(`/spa/bookmarks/${pin.id}`, { method: "DELETE" })
    // private: a bookmark's ACL, so the pin isn't shown to anyone else.
    : await apiFetch("/spa/bookmarks", { method: "POST", body: JSON.stringify({ url: pinUrl(base, key), title, private: true }) });
  if (!res.ok) throw new Error(`${res.status}`);
  await queryClient.invalidateQueries({ queryKey: KEY });
}
