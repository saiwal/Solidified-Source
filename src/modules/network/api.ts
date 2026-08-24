import type { Post } from "@utsukta/spa-core/types/post.types";
import { mapActivityToPost } from "@utsukta/spa-core/lib/activity.mapper";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { savePosts } from "@utsukta/spa-core/lib/message-store";
const HIDDEN_VERBS = new Set(['Like', 'Dislike', 'Announce', 'Accept', 'Reject', 'TentativeAccept']);

function shouldDisplay(a: any): boolean {
  if (a.verb === 'Add' || a.verb === 'Remove') return false;
  if (a.flags?.includes('notshown')) return false;
  if (a.obj_type === 'Answer') return false;
  const isThreadTop = a.mid === a.message_top;
  if (HIDDEN_VERBS.has(a.verb) && !isThreadTop) return false;
  return true;
}

export interface Author {
  name: string;
  address: string;
  url: string;
  photo: { src: string; mimetype: string };
}

export interface Item {
  uuid: string;
  mid: string;
  parent_mid: string;
  thr_parent: string;
  created: string;
  edited: string;
  title: string;
  body: string;
  verb: string;
  obj_type: string;
  like_count: number;
  dislike_count: number;
  announce_count: number;
  comment_count: number;
  item_private: number;
  item_thread_top: number;
  item_unseen: number;
  iid: number;
  profile_uid: number;
  flags: string[];
  author: Author;
  permalink: string;
  viewer_liked: boolean;
  viewer_disliked: boolean;
  viewer_repeated: boolean;
}

export interface Reactor {
  name: string;
  address: string;
  url: string;
  photo: string;
  created: string;
}

export interface ReactionCounts {
  like_count: number;
  dislike_count: number;
  announce_count: number;
}
export type NetworkParams = {
  start?: number;
  order?: 'created' | 'commented' | 'unthreaded';
  search?: string;
  tag?: string;
  cat?: string;
  verb?: string;
  file?: string;
  gid?: number;
  cid?: number;
  xchan?: string;
  net?: string;
  pf?: 1;
  star?: 1;
  liked?: 1;
  conv?: 1;
  dm?: 1;
  event?: 1;
  poll?: 1;
  spam?: 1;
  unseen?: 1;
  nouveau?: 1;
  cmin?: number;
  cmax?: number;
  dend?: string;
  dbegin?: string;
};
export function parseNetworkParams(params: Record<string, string | string[] | undefined>): NetworkParams {
  const p: NetworkParams = {};
  if (params.order && params.order !== "created") p.order = params.order as NetworkParams["order"];
  if (params.search) p.search = String(params.search);
  if (params.tag)    p.tag    = String(params.tag);
  if (params.file)   p.file   = String(params.file);
  if (params.star  === "1") p.star  = 1;
  if (params.pf    === "1") p.pf    = 1;
  if (params.conv  === "1") p.conv  = 1;
  if (params.dm    === "1") p.dm    = 1;
  if (params.event === "1") p.event = 1;
  if (params.poll  === "1") p.poll  = 1;
  if (params.dbegin) p.dbegin = String(params.dbegin);
  if (params.dend)   p.dend   = String(params.dend);
  if (params.cmin)   p.cmin   = Number(params.cmin);
  if (params.cmax)   p.cmax   = Number(params.cmax);
  if (params.cid)    p.cid    = Number(params.cid);
  if (params.gid)    p.gid    = Number(params.gid);
  return p;
}

export type AclConnection = {
  type: 'c' | 'g';
  name: string;
  nick: string;
  id: string | number;
  xid: string;
  link: string;
  photo?: string;
};
export type AclEntry = {
  type: 'c' | 'g';
  name: string;
  nick: string;
  id: string | number;
  xid: string;
  link: string;
  photo?: string;
};

export type AclSearchParams = {
  search?: string;
  type?: '' | 'c' | 'g' | 'm';
  count?: number;
};

/** decodeURIComponent, but never throws on a hash that isn't valid encoding. */
function decodeXid(xid: string): string {
  try { return decodeURIComponent(xid); } catch { return xid; }
}

export async function fetchConnections(params: AclSearchParams = {}): Promise<AclConnection[]> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.type)   qs.set('type', params.type);
  qs.set('count', String(params.count ?? 100));
  // Session/permission-dependent results (e.g. type "m" is filtered per-viewer
  // by post_mail grants) — never let the browser HTTP cache serve a stale copy.
  const res = await fetch(`/acl?${qs.toString()}`, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  const items: AclConnection[] = data.items ?? [];
  // Two fixups on the way out:
  // - xid: core urlencodes the hash in /acl output (Acl.php: $g['hash'] =
  //   urlencode(...)) and decodes it again in its own widget (view/js/acl.js).
  //   For zot6 base64url hashes that's a no-op, but an ActivityPub xchan_hash is
  //   the actor URL — left encoded it matches no contact, and its %XX escapes
  //   blow up Activity::map_acl()'s vsprintf when the ACL is federated.
  // - photo: core marks groups/profiles/forums with a placeholder image path that
  //   doesn't resolve under the SPA origin — drop it so consumers render their
  //   icon fallback instead of a broken <img>.
  return items.map((c) => ({
    ...c,
    xid: decodeXid(c.xid),
    photo: c.photo?.endsWith('twopeople.png') ? undefined : c.photo,
  }));
}

export async function fetchFolders(): Promise<string[]> {
  const res = await fetch('/spa/folders');
  if (!res.ok) return [];
  const { data } = await res.json();
  return Array.isArray(data) ? data : [];
}

export type ForumConnection = {
  id: number;
  name: string;
  photo: string;
};

export async function fetchForums(): Promise<ForumConnection[]> {
  const res = await apiFetch('/spa/connections?filter=active&type=forum&order=name&limit=200');
  if (!res.ok) return [];
  const { data } = await res.json();
  return Array.isArray(data)
    ? data.map((c: any) => ({ id: c.id, name: c.name, photo: c.photo }))
    : [];
}

export type NetworkStreamResult = {
  items: Post[];
  rootCount: number;
  limit: number;
  nouveau: boolean;
};
export async function fetchNetworkStream(params: NetworkParams = {}): Promise<NetworkStreamResult> {
  // `event` and `poll` are UI-only convenience flags — translate to backend verb filter
  const { event, poll, ...rest } = params;
  const apiParams = event
    ? { ...rest, verb: '.Event' }
    : poll
      ? { ...rest, verb: '.Question' }
      : rest;

  const qs = new URLSearchParams();
  Object.entries(apiParams).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });

  const res = await fetch(`/spa/network?${qs.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  const { data, meta } = await res.json();

  const activities: any[] = Array.isArray(data) ? data : [];
  const rootCount: number = meta?.root_count ?? activities.filter((a: any) => a.item_thread_top === 1).length;
  const limit: number     = meta?.limit   ?? 10;
  const nouveau: boolean  = meta?.nouveau ?? false;

  // Incremental offline copy: the response already carries full bodies, so
  // recording them here makes every post you scrolled past openable offline
  // without a single extra request.
  void savePosts(activities);

  const items = activities.filter(shouldDisplay).map(mapActivityToPost);
  return { items, rootCount, limit, nouveau };
}
// Re-export shared item API helpers for use within this module

export {
  fetchItemDetail,
  fetchComments,
  fetchLikes,
  fetchDislikes,
  fetchRepeats,
  apiCreatePost,
  apiCreateComment,
  apiToggleLike,
  apiToggleDislike,
  apiToggleRepeat,
  apiToggleStar,
  apiEditItem,
  apiDeleteItem,
} from '@utsukta/spa-core/lib/item-api';
