// src/modules/pubstream/api.ts
import { apiError } from "@utsukta/spa-core/lib/fetch";
import type { Post } from "@utsukta/spa-core/types/post.types";

export interface PubstreamMeta {
  firehose: boolean;
  ordering: string;
}

export interface PubstreamResponse {
  posts: Post[];
  page: number;
  has_more: boolean;
  meta: PubstreamMeta;
}

export interface PubstreamParams {
  page?: number;
  limit?: number;
  tag?: string;
  net?: string;
}

/** Fetch a page of public stream posts. Returns null if disabled (403). */
export async function fetchPubstream(
  params: PubstreamParams = {},
): Promise<PubstreamResponse | null> {
  const qs = new URLSearchParams();
  if (params.page)  qs.set("page",  String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.tag)   qs.set("tag",   params.tag);
  if (params.net)   qs.set("net",   params.net);

  const res = await fetch(`/spa/pubstream?${qs}`);

  // 403 = disabled / not allowed — return null so UI can show "disabled" state
  if (res.status === 403 || res.status === 401) return null;

  if (!res.ok) throw await apiError(res);

  const json = await res.json();
  const data = json.data ?? json;

  // Remap snake_case fields from PHP formatter → Post shape
  const posts: Post[] = (data.posts ?? []).map(remapPost);

  return {
    posts,
    page:     data.page,
    has_more: data.has_more,
    meta:     data.meta,
  };
}

/** Map the raw PHP-formatted item fields to the frontend Post type. */
function remapPost(r: Record<string, unknown>): Post {
  const author = (r.author ?? {}) as Record<string, unknown>;
  const photo  = (author.photo ?? {}) as Record<string, unknown>;

  return {
    uuid:          String(r.uuid ?? r.mid ?? ""),
    id:            String(r.uuid ?? r.mid ?? ""),
    iid:           Number(r.iid ?? 0),
    profileUid:    Number(r.profile_uid ?? 0),
    mid:           String(r.mid ?? ""),
    parent_mid:    String(r.parent_mid ?? ""),
    thr_parent:    String(r.thr_parent ?? ""),
    top_mid:       String(r.message_top ?? ""),
    parent:        String(r.parent_mid ?? ""),
    body:          String(r.body ?? ""),
    // Raw body here — this remapper deliberately does not render. store.ts
    // does that in processBody(), which needs the format to pick a renderer.
    mimetype:      String(r.mimetype ?? ""),
    title:         String(r.title ?? ""),
    authorName:    String(author.name ?? ""),
    authorAvatar:  String(photo.src ?? ""),
    authorUrl:     String(author.url ?? ""),
    authorHash:    author.hash ? String(author.hash) : undefined,
    created:       String(r.created ?? ""),
    commented:     r.commented ? String(r.commented) : undefined,
    edited:        r.edited    ? String(r.edited)    : undefined,
    verb:          r.verb      ? String(r.verb)      : undefined,
    obj_type:      r.obj_type  ? String(r.obj_type)  : undefined,
    item_thread_top: Number(r.item_thread_top ?? 1),
    flags:         (r.flags as string[]) ?? [],
    permalink:     String(r.permalink ?? ""),
    children:      [],
    likeCount:     Number(r.like_count ?? 0),
    dislikeCount:  Number(r.dislike_count ?? 0),
    repeatCount:   Number(r.announce_count ?? 0),
    viewerLiked:   Boolean(r.viewer_liked),
    viewerDisliked: Boolean(r.viewer_disliked),
    viewerRepeated: Boolean(r.viewer_repeated),
  };
}
