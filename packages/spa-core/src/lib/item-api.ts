// src/shared/lib/item-api.ts
import { apiFetch, apiError } from "./fetch";
import { savePosts, getStoredPost } from './message-store';
import type { CommentOrder } from '../store/comment-order';

const BASE = '/spa/item';

function encodeId(uuid: string): string {
  return encodeURIComponent(uuid);
}

// ── GET ───────────────────────────────────────────────────────────────────────

export const fetchItemDetail = (uuid: string) =>
  apiFetch(`${BASE}/${encodeId(uuid)}`).then(r => r.json());

/**
 * The raw item behind /spa/display/:id, falling back to the local copy when
 * there's no connection — a post read in a stream or opened once before stays
 * openable offline. Successful fetches are recorded, so opening a post is
 * itself what saves it.
 */
export async function fetchDisplayItem(id: string): Promise<any> {
  try {
    const res = await fetch(`/spa/display/${id}`);
    if (!res.ok) throw await apiError(res);
    const json = await res.json();
    const data = json.data ?? json;
    if (data.error) throw new Error(data.error);
    void savePosts([data.post]);
    return data.post;
  } catch (err) {
    const stored = await getStoredPost(id);
    if (stored) return stored;
    throw err;
  }
}

export interface FetchCommentsOpts {
  /** Numeric = roots_limit (threaded) or limit (flat). 'all' = one-shot full-thread fetch (no pagination). */
  count?: number | 'all';
  order?: CommentOrder;
  // threaded mode (roots + per-branch initial slice)
  rootsOffset?: number;
  /** How many of each root comment's own earliest descendants to bundle in — defaults to `count`. */
  branchLimit?: number;
  // threaded mode: "load more replies" for one specific comment's subtree
  branch?: string;
  branchOffset?: number;
  // list mode: flat pagination across all comments regardless of depth
  flat?: boolean;
  offset?: number;
  /** Fetch ancestors + a sibling window around this comment instead of a page of roots. */
  around?: string;
  before?: number;
  after?: number;
}

export interface CommentBranchMeta {
  fetched: number;
  next_offset: number;
  total: number;
  has_more: boolean;
}

export interface CommentsResponse {
  mid: string;
  total: number;
  comments: any[];
  mode?: 'roots' | 'branch' | 'flat' | 'context';
  order?: CommentOrder;
  // roots mode (threaded)
  roots_offset?: number;
  roots_limit?: number;
  roots_fetched?: number;
  next_roots_offset?: number;
  total_roots?: number;
  has_more_roots?: boolean;
  branch_limit?: number;
  branches?: Record<string, CommentBranchMeta>;
  // branch mode (threaded, "load more replies")
  branch?: string;
  branch_offset?: number;
  // branch + flat modes share these
  fetched?: number;
  has_more?: boolean;
  // flat mode (list)
  offset?: number;
  limit?: number;
  next_offset?: number;
  next_branch_offset?: number;
  // context mode
  target_mid?: string;
  target_found?: boolean;
  ancestor_mids?: string[];
  sibling_thr_parent?: string;
  has_more_before?: boolean;
  has_more_after?: boolean;
}

export const fetchComments = (uuid: string, opts: FetchCommentsOpts = {}): Promise<CommentsResponse> => {
  const { count = 'all', order, rootsOffset, branchLimit, branch, branchOffset, flat, offset, around, before, after } = opts;
  const params = new URLSearchParams();
  if (rootsOffset) params.set('roots_offset', String(rootsOffset));
  if (order) params.set('order', order);
  if (branchLimit !== undefined) params.set('branch_limit', String(branchLimit));
  if (branch) params.set('branch', branch);
  if (branchOffset !== undefined) params.set('branch_offset', String(branchOffset));
  if (flat) params.set('flat', '1');
  if (offset) params.set('offset', String(offset));
  if (around) params.set('around', around);
  if (before !== undefined) params.set('before', String(before));
  if (after !== undefined) params.set('after', String(after));
  const qs = params.toString();
  return apiFetch(`${BASE}/${encodeId(uuid)}/comments/${count}${qs ? `?${qs}` : ''}`).then(r => r.json());
};

export const fetchLikes    = (uuid: string) =>
  apiFetch(`${BASE}/${encodeId(uuid)}/likes`).then(r => r.json());

export const fetchDislikes = (uuid: string) =>
  apiFetch(`${BASE}/${encodeId(uuid)}/dislikes`).then(r => r.json());

export const fetchRepeats  = (uuid: string) =>
  apiFetch(`${BASE}/${encodeId(uuid)}/repeats`).then(r => r.json());

// ── POST ──────────────────────────────────────────────────────────────────────

async function post<T>(url: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await apiFetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface ReactionResult {
  success: boolean;
  state: 'added' | 'removed';
  like_count: number;
  dislike_count: number;
  announce_count: number;
}

export interface CommentResult {
  success: boolean;
  iid: number;
  mid: string;
  uuid: string;
}

export interface RsvpResult {
  success: boolean;
  state: 'added' | 'removed';
  attend_count: number;
  decline_count: number;
  maybe_count: number;
}

export const apiToggleLike    = (uuid: string) =>
  post<ReactionResult>(`${BASE}/${encodeId(uuid)}/like`);

export const apiToggleDislike = (uuid: string) =>
  post<ReactionResult>(`${BASE}/${encodeId(uuid)}/dislike`);

export const apiToggleRepeat  = (uuid: string) =>
  post<ReactionResult>(`${BASE}/${encodeId(uuid)}/repeat`);

export const apiTogglePin = (uuid: string) =>
  post<{ success: boolean; pinned: boolean }>(`${BASE}/${encodeId(uuid)}/pin`);

export const apiToggleStar = (iid: number): Promise<void> =>
  fetch(`/starred/${iid}`, {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  }).then(() => undefined);

export const apiRsvpAttend  = (uuid: string) =>
  post<RsvpResult>(`${BASE}/${encodeId(uuid)}/accept`);

export const apiRsvpDecline = (uuid: string) =>
  post<RsvpResult>(`${BASE}/${encodeId(uuid)}/reject`);

export const apiRsvpMaybe   = (uuid: string) =>
  post<RsvpResult>(`${BASE}/${encodeId(uuid)}/tentativeaccept`);

export const apiAddToCalendar = (uuid: string) =>
  post<{ success: boolean }>(`${BASE}/${encodeId(uuid)}/addtocal`);

export const apiCreatePost = (body: Record<string, unknown>) =>
  post<{ success: boolean; iid: number; mid: string; uuid: string }>(BASE, body);

export const apiCreateComment = (parentUuid: string, content: string, title = '') =>
  post<CommentResult>(`${BASE}/${encodeId(parentUuid)}/comment`, { body: content, title });

/** Fields an edit may change. Omitted keys are left untouched server-side —
 *  notably `category`, whose absence means "keep the item's categories" (the
 *  inline comment editor relies on that; the post composer always sends it). */
export interface EditPayload {
  body: string;
  title?: string;
  summary?: string;
  category?: string;
  mimetype?: string;
}

export const apiEditItem = (uuid: string, payload: EditPayload) =>
  post<{ success: boolean }>(`${BASE}/${encodeId(uuid)}/edit`, { ...payload });

export interface ComposeSource {
  success: boolean;
  body: string;
  title: string;
  summary: string;
  mimetype: string;
  category: string;
}

/** Item source for the edit composer — [share …] blocks collapsed to [share=<id>].
 *
 *  Returns null when the source could not be trusted, rather than a partly-filled
 *  object: apiFetch resolves on HTTP errors too, and an error body (`{error: …}`)
 *  parses as JSON with `category` undefined. Callers that treated that as "no
 *  categories" and saved would delete every category on the item, so an
 *  unusable response has to be distinguishable from a genuinely empty one. */
export const apiFetchComposeSource = async (uuid: string): Promise<ComposeSource | null> => {
  const res = await apiFetch(`${BASE}/${encodeId(uuid)}/compose`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null) as ComposeSource | null;
  if (!data?.success || typeof data.category !== "string") return null;
  return data;
};

export const apiDeleteItem = (uuid: string) =>
  post<{ success: boolean }>(`${BASE}/${encodeId(uuid)}/delete`);

// Pull one more level of a remote (ActivityPub) thread's replies into the DB.
// Zot threads already arrive whole, so this only ever finds anything on AP items.
export const apiFetchRemoteReplies = (uuid: string) =>
  post<{ data: { fetched: number } }>(`${BASE}/${encodeId(uuid)}/fetchreplies`)
    .then(d => d.data.fetched);

export const apiFetchItemFolders = (uuid: string): Promise<string[]> =>
  apiFetch(`${BASE}/${encodeId(uuid)}/folders`)
    .then(r => r.json())
    .then(d => Array.isArray(d?.data) ? d.data : []);

export const apiSaveToFolder = (uuid: string, name: string, remove = false): Promise<string[]> =>
  post<{ data: { folders: string[] } }>(`${BASE}/${encodeId(uuid)}/saveto`, { name, remove })
    .then(d => d.data.folders);

export const apiVotePoll = (uuid: string, answer: string | string[]) =>
  post<{ success: boolean }>(`${BASE}/${encodeId(uuid)}/vote`, { answer });

export const apiFollowPost = (uuid: string): Promise<void> =>
  post<{ success?: boolean; error?: string }>(`${BASE}/${encodeId(uuid)}/follow`)
    .then(r => { if (!r.success) throw new Error(r.error || 'Follow failed'); });

export const apiUnfollowPost = (uuid: string): Promise<void> =>
  post<{ success?: boolean; error?: string }>(`${BASE}/${encodeId(uuid)}/unfollow`)
    .then(r => { if (!r.success) throw new Error(r.error || 'Unfollow failed'); });
