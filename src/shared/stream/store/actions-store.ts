// src/shared/stream/store/actions-store.ts
//
// Single source of truth for all post-level actions.
// Every stream module (network, channel, articles) imports from here.
// To add a new action, add it to createActionHandlers and to StreamHandlers.
//
// Actions defined here:
//   handleLike · handleDislike · handleRepeat · handleStar · handleDelete
//   handleComment · loadComments · loadMoreComments
//
// Planned (not yet implemented):
//   handleFileInFolder — requires Hubzilla folder/collection API integration

import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { buildThreadTree, appendNewBranches, mergeReplies, applyBranchMeta } from "@utsukta/spa-core/lib/thread";
import type { Post } from "@utsukta/spa-core/types/post.types";
import type { createStreamStore } from "./createStreamStore";
import { updateNode } from "./createStreamStore";
import { fetchComments, fetchItemDetail, apiDeleteItem, apiEditItem, apiToggleStar, type EditPayload } from "@utsukta/spa-core/lib/item-api";
import { mapActivityToPost } from "@utsukta/spa-core/lib/activity.mapper";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import type { NavViewer } from "@utsukta/spa-core/lib/nav-api";
import { useCommentOrder } from "@utsukta/spa-core/store/comment-order";
import type { CommentOrder } from "@utsukta/spa-core/store/comment-order";
import { useThreadMode } from "@utsukta/spa-core/store/thread-mode";

// Root comments per page (threaded mode) or comments per page (list/flat
// mode) — not user-configurable, only comment order and view mode are (see
// comment-order / thread-mode stores).
export const COMMENTS_PAGE_SIZE = 5;

function filterReactions(comments: any[] | undefined): any[] {
  return (comments ?? []).filter((a: any) => !REACTION_VERBS.has(a.verb));
}

// The just-posted comment, rendered from what the composer already knows
// instead of re-fetching the thread — a refetch re-runs whatever windowed
// fetch opened the view (e.g. PostDetailModal's ancestor+siblings context
// mode), which doesn't contain the new reply, so it would vanish instead of
// appearing. Real mid/uuid arrive on the next real load.
export function tempCommentNode(parentMid: string, body: string, viewer?: NavViewer): ThreadNode {
  const tempMid = crypto.randomUUID();
  return {
    uuid: tempMid, id: tempMid, mid: tempMid,
    parent_mid: parentMid, thr_parent: parentMid,
    top_mid: parentMid, parent: parentMid,
    body: sanitizeHtml(body), title: "",
    authorName: viewer?.name || currentNick(),
    authorAvatar: viewer?.avatar ?? "",
    authorUrl: viewer?.url ?? "",
    authorAddress: viewer?.addr ?? "",
    created: new Date().toISOString().replace("T", " ").slice(0, 19),
    verb: "Create", obj_type: "Note", flags: [], permalink: "",
    likeCount: 0, dislikeCount: 0, repeatCount: 0,
    viewerLiked: false, viewerDisliked: false, viewerRepeated: false,
    item_thread_top: 0, children: [],
  };
}

function flatNodes(posts: Post[]): ThreadNode[] {
  return posts.map((p) => ({ ...p, children: [] }));
}

function appendFlatComments(existing: ThreadNode[], newPosts: Post[]): ThreadNode[] {
  const existingMids = new Set(existing.map((n) => n.mid));
  const fresh = flatNodes(newPosts.filter((p) => !existingMids.has(p.mid)));
  return fresh.length ? [...existing, ...fresh] : existing;
}

type StreamStore = ReturnType<typeof createStreamStore>;

export const REACTION_VERBS = new Set([
  "Like", "Dislike", "Announce", "Accept", "Reject",
  "TentativeAccept", "Add", "Remove",
]);

// ── low-level API calls ───────────────────────────────────────────────────────

export async function toggleVerb(
  iid: number,
  verb: "like" | "dislike" | "announce" | "star",
): Promise<void> {
  const url = `/like/${iid}?verb=${verb}&conv_mode=&page_mode=client&reload=0`;
  const res = await fetch(url, { method: "GET", credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${verb} failed: ${res.status} ${text}`);
  }
}

export async function repeatItem(iid: number): Promise<void> {
  const url = `/share/${iid}`;
  const res = await fetch(url, { method: "GET", credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`repeat failed: ${res.status} ${text}`);
  }
}

// ── node lookup ───────────────────────────────────────────────────────────────

export function findNode(nodes: ThreadNode[], mid: string): ThreadNode | undefined {
  for (const n of nodes) {
    if (n.mid === mid || n.uuid === mid) return n;
    if (n.children.length) {
      const found = findNode(n.children, mid);
      if (found) return found;
    }
  }
  return undefined;
}

// ── action handler factory ────────────────────────────────────────────────────

export function createActionHandlers(store: StreamStore) {
  function iidFor(mid: string): number {
    const node = findNode(store.posts(), mid);
    return node ? Number(node.id) : 0;
  }

  return {
    handleLike(mid: string) {
      const iid = iidFor(mid);
      store.optimisticToggle(mid, "like", "likeCount", () => toggleVerb(iid, "like"));
    },

    handleDislike(mid: string) {
      const iid = iidFor(mid);
      store.optimisticToggle(mid, "dislike", "dislikeCount", () => toggleVerb(iid, "dislike"));
    },

    handleRepeat(mid: string) {
      const iid = iidFor(mid);
      const node = findNode(store.posts(), mid);
      if (!node || node.viewerRepeated) return;
      store.setPosts((prev) =>
        updateNode(prev, mid, (n) => ({
          ...n,
          viewerRepeated: true,
          repeatCount: n.repeatCount + 1,
        })),
      );
      repeatItem(iid).catch(() => {
        store.setPosts((prev) =>
          updateNode(prev, mid, (n) => ({
            ...n,
            viewerRepeated: false,
            repeatCount: n.repeatCount - 1,
          })),
        );
      });
    },

    handleStar(mid: string) {
      const node = findNode(store.posts(), mid);
      if (!node?.iid) return;
      const newStarred = !(node.viewerStarred ?? false);
      store.setPosts((prev) =>
        updateNode(prev, mid, (n) => ({ ...n, viewerStarred: newStarred })),
      );
      apiToggleStar(node.iid).catch(() => {
        store.setPosts((prev) =>
          updateNode(prev, mid, (n) => ({ ...n, viewerStarred: !newStarred })),
        );
      });
      // TODO: handleFileInFolder — add folder assignment here once Hubzilla
      // collection/folder API (/api/item/:id/file or equivalent) is integrated
    },

    async handleDelete(mid: string): Promise<void> {
      const node = findNode(store.posts(), mid);
      if (!node) return;
      await apiDeleteItem(node.uuid);
      store.setPosts((prev) => prev.filter((p) => p.mid !== mid));
    },

    async handleEdit(mid: string, payload: EditPayload): Promise<void> {
      const node = findNode(store.posts(), mid);
      if (!node) return;
      await apiEditItem(node.uuid, payload);
      const detail = await fetchItemDetail(node.uuid);
      const item = detail?.item;
      if (!item) return;
      const mapped = mapActivityToPost(item);
      store.setPosts((prev) =>
        updateNode(prev, mid, (n) => ({
          ...n,
          body: mapped.body,
          rawBody: mapped.rawBody,
          title: mapped.title,
          summary: mapped.summary,
          edited: mapped.edited,
        })),
      );
    },

    handleComment(
      parentMid: string,
      body: string,
      _authorName: string,
      _authorAvatar: string,
    ): void {
      const tempComment = tempCommentNode(parentMid, body);

      store.setPosts((prev) =>
        updateNode(prev, parentMid, (n) => ({
          ...n, children: [...n.children, tempComment],
        })),
      );
    },

    async loadComments(mid: string, uuid: string): Promise<void> {
      const order = useCommentOrder()();
      if (useThreadMode()()) {
        const result = await fetchComments(uuid, { count: COMMENTS_PAGE_SIZE, order });
        const posts = filterReactions(result.comments).map(mapActivityToPost);
        const children = applyBranchMeta(buildThreadTree(posts, order), result.branches);
        store.patchNodeChildren(mid, children, !!result.has_more_roots, result.next_roots_offset ?? 0);
      } else {
        const result = await fetchComments(uuid, { count: COMMENTS_PAGE_SIZE, flat: true, order });
        const posts = filterReactions(result.comments).map(mapActivityToPost);
        store.patchNodeChildren(mid, flatNodes(posts), !!result.has_more, result.next_offset ?? 0);
      }
    },

    // rootUuid: the thread root's uuid (always the URL target for the API
    // call). attachMid: the node — post root or a specific comment — to
    // attach fetched children to. isRoot: "load more root comments" (paginate
    // top-level comments, threaded or flat) vs "load more replies" for one
    // comment's own branch (threaded mode only — list mode never sets
    // hasMoreComments on an individual comment, so this path is unreachable
    // there).
    async loadMoreComments(rootUuid: string, attachMid: string, isRoot: boolean, offset: number, order: CommentOrder): Promise<void> {
      const node = findNode(store.posts(), attachMid);
      const existingChildren = node?.children ?? [];

      if (!isRoot) {
        const result = await fetchComments(rootUuid, { branch: attachMid, branchOffset: offset, branchLimit: COMMENTS_PAGE_SIZE });
        const posts = filterReactions(result.comments).map(mapActivityToPost);
        store.patchNodeChildren(
          attachMid, mergeReplies(existingChildren, posts, attachMid), !!result.has_more, result.next_branch_offset ?? offset,
        );
        return;
      }

      if (useThreadMode()()) {
        const result = await fetchComments(rootUuid, { count: COMMENTS_PAGE_SIZE, rootsOffset: offset, order });
        const posts = filterReactions(result.comments).map(mapActivityToPost);
        const appended = applyBranchMeta(appendNewBranches(existingChildren, posts, order), result.branches);
        store.patchNodeChildren(attachMid, appended, !!result.has_more_roots, result.next_roots_offset ?? offset);
      } else {
        const result = await fetchComments(rootUuid, { count: COMMENTS_PAGE_SIZE, offset, flat: true, order });
        const posts = filterReactions(result.comments).map(mapActivityToPost);
        store.patchNodeChildren(
          attachMid, appendFlatComments(existingChildren, posts), !!result.has_more, result.next_offset ?? offset,
        );
      }
    },

    async handleRefresh(mid: string, uuid: string): Promise<void> {
      const detail = await fetchItemDetail(uuid);
      const item = detail?.item;
      if (item) {
        store.setPosts((prev) =>
          updateNode(prev, mid, (n) => ({
            ...n,
            likeCount:       item.like_count      ?? n.likeCount,
            dislikeCount:    item.dislike_count   ?? n.dislikeCount,
            repeatCount:     item.announce_count  ?? n.repeatCount,
            commentCount:    item.comment_count   ?? n.commentCount,
            viewerLiked:     item.viewer_liked    ?? n.viewerLiked,
            viewerDisliked:  item.viewer_disliked ?? n.viewerDisliked,
            viewerRepeated:  item.viewer_repeated ?? n.viewerRepeated,
          })),
        );
      }
      // Reload comments only if they were already fetched
      const node = findNode(store.posts(), mid);
      if (node && node.children.length > 0) {
        const result = await fetchComments(uuid); // 'all' — full unpaginated refetch
        const posts = filterReactions(result.comments).map(mapActivityToPost);
        const order = useCommentOrder()();
        const children = useThreadMode()() ? buildThreadTree(posts, order) : flatNodes(posts);
        // Full refetch — nothing more to page in until the user next asks.
        store.patchNodeChildren(mid, children, false, 0);
      }
    },
  };
}
