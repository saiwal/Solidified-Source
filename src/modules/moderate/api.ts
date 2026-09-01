// src/modules/moderate/api.ts
import { apiFetch, apiError } from "@utsukta/spa-core/lib/fetch";

export interface PendingAuthor {
  name?: string;
  url?: string;
  hash?: string;
  photo?: { src?: string; mimetype?: string };
}

export interface PendingTarget {
  title?: string;
  body?: string;
  mimetype?: string;
  permalink?: string;
}

export interface PendingItem {
  iid: number;
  uuid: string;
  mid: string;
  thr_parent: string;
  verb: string;
  obj_type: string;
  created: string;
  is_reply: boolean;
  title?: string;
  body?: string;
  mimetype?: string;
  author: PendingAuthor;
  target: PendingTarget | null;
}

export async function fetchModerationQueue(): Promise<PendingItem[]> {
  const res = await apiFetch("/spa/moderate");
  if (!res.ok) throw new Error(`Failed to fetch moderation queue (${res.status})`);
  const json = await res.json();
  return (json.data ?? []) as PendingItem[];
}

// Pending Like/Dislike/Announce on a single post/comment — feeds the inline
// "pending reactions" panel (comments get an inline approve/deny badge
// instead, since they render as real thread rows and reactions don't).
export async function fetchPendingReactions(mid: string): Promise<PendingItem[]> {
  const res = await apiFetch(`/spa/moderate?mid=${encodeURIComponent(mid)}`);
  if (!res.ok) throw new Error(`Failed to fetch pending reactions (${res.status})`);
  const json = await res.json();
  return (json.data ?? []) as PendingItem[];
}

export async function approveModerationItem(iid: number): Promise<void> {
  const res = await apiFetch(`/spa/moderate/${iid}/approve`, { method: "POST", body: "{}" });
  if (!res.ok) throw await apiError(res, "approve");
}

export async function dropModerationItem(iid: number): Promise<void> {
  const res = await apiFetch(`/spa/moderate/${iid}/drop`, { method: "POST", body: "{}" });
  if (!res.ok) throw await apiError(res, "drop");
}
