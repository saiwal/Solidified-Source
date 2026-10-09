// src/modules/channel/api.ts
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { savePosts } from "@utsukta/spa-core/lib/message-store";
import { mapActivityToPost } from "@utsukta/spa-core/lib/activity.mapper";
// import type { Post } from "@utsukta/spa-core/types/post.types";
import type { StreamResult } from "@/shared/stream/store/createStreamStore";
import type { SortOrder } from "@/shared/stream/filters";

export type ChannelParams = {
  start?:   number;
  order?:   SortOrder;
  search?:  string;
  tag?:     string;
  cat?:     string;
  mid?:     string;
  dend?:    string;
  dbegin?:  string;
  nouveau?: 1;
};

/** What the jot offers a visitor on someone else's wall — set only then. */
export type WallCompose = {
  name:          string;
  isGroup:       boolean;
  allowLocation: boolean;
  writeStorage:  boolean;
  features:      Record<string, boolean>;
};

export type ChannelStreamResult = StreamResult & { canPostWall: boolean; wallCompose: WallCompose | null };

export async function fetchChannelPosts(
  nickname: string,
  params: ChannelParams = {},
): Promise<ChannelStreamResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  });

  const path = nickname ? `/spa/channel/${nickname}` : "/spa/channel";
  const res = await apiFetch(`${path}?${qs.toString()}`);
  if (!res.ok) throw await res.json();

  const { data, meta } = await res.json();
  const activities: any[] = Array.isArray(data) ? data : [];
  // See fetchNetworkStream — bodies are already in hand, so store them.
  void savePosts(activities);
  const mainItems = activities.map(mapActivityToPost);

  // Pinned posts are excluded from `data` by the backend whenever this meta
  // key is present (base wall view, first page) — merge them back in as real
  // tree nodes so they participate in the same store (comments, likes, edits,
  // etc.) as everything else. The UI filters them back out of the main list
  // for display; see ChannelView's mainPosts/pinnedPosts split.
  const pinnedActivities: any[] = meta && Array.isArray(meta.pinned) ? meta.pinned : [];
  const mainMids = new Set(mainItems.map((p) => p.mid));
  const pinnedItems = pinnedActivities.map(mapActivityToPost).filter((p) => !mainMids.has(p.mid));

  return {
    items:        [...pinnedItems, ...mainItems],
    rootCount:    meta?.root_count ?? activities.filter((a: any) => a.item_thread_top === 1).length,
    limit:        meta?.limit ?? 10,
    nouveau:      meta?.nouveau ?? false,
    canPostWall:  meta?.can_post_wall ?? false,
    wallCompose:  meta?.wall_compose
      ? {
          name:          meta.wall_compose.name,
          isGroup:       meta.wall_compose.is_group,
          allowLocation: meta.wall_compose.allow_location,
          writeStorage:  meta.wall_compose.write_storage,
          features:      { ...meta.wall_compose.features },
        }
      : null,
  };
}


export interface ChannelConn {
  name: string;
  address: string;
  photo: string;
  url: string;
  local_nick: string | null;
  network: string;
  description: string;
  location: string;
  /** null when the viewer can't connect from here (anonymous / remote). */
  viewer_connected: boolean | null;
}

export interface ConnectionsData {
  connections: ChannelConn[];
  total: number;
  hidden: boolean;
}

export async function fetchConnections(nick: string, start = 0, limit = 24): Promise<ConnectionsData | null> {
  if (!nick) return null;
  const res = await apiFetch(`/spa/profile/${nick}/connections?limit=${limit}&start=${start}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data as ConnectionsData;
}

// GET /spa/profile/:nick — cached under "contact-card" by its callers.
export interface ProfileData {
  channel_name: string;
  channel_address: string;
  xchan_addr: string;
  channel_photo_l: string;
  channel_cover: string;
  pdesc: string;
  location: string;
  homepage: string;
  gender: string;
  marital: string;
  keywords: string[];
  is_connected: boolean;
  connect_url: string;
  is_remote?: boolean;
}

export async function fetchProfile(nick: string): Promise<ProfileData | null> {
  if (!nick) return null;
  const res = await apiFetch(`/spa/profile/${nick}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data as ProfileData;
}
