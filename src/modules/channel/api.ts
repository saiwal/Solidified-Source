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
  dm?:      1;
};

export type ChannelStreamResult = StreamResult & { canPostWall: boolean };

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
  };
}

