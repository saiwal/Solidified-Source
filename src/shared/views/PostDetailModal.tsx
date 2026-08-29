// src/shared/views/PostDetailModal.tsx
import { type Component, createEffect, createMemo, createSignal, on, Show, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import PostCard from "../stream/components/PostCard";
import type { StreamHandlers, EditPayload } from "../stream/types";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { buildThreadTree, appendNewBranches, mergeReplies, applyBranchMeta } from "@utsukta/spa-core/lib/thread";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { mapActivityToPost } from "@utsukta/spa-core/lib/activity.mapper";
import { BiRegularX } from "solid-icons/bi";
import { useI18n } from "@utsukta/spa-core/i18n";
import { apiDeleteItem, apiEditItem, apiToggleStar, fetchComments, fetchDisplayItem } from "@utsukta/spa-core/lib/item-api";
import { isDirectMessage } from "@/shared/stream/components/DmMeta";
import { toggleVerb, repeatItem, COMMENTS_PAGE_SIZE } from "@/shared/stream/store/actions-store";
import { useCommentOrder } from "@utsukta/spa-core/store/comment-order";
import type { CommentOrder } from "@utsukta/spa-core/store/comment-order";
import { useThreadMode } from "@utsukta/spa-core/store/thread-mode";
import { markItemSeen } from "@utsukta/spa-core/lib/markSeen";
import { approveModerationItem, dropModerationItem } from "@/modules/moderate/api";

function flatNodes(posts: Post[]): ThreadNode[] {
  return posts.map((p) => ({ ...p, children: [] }));
}

function updateNodeInTree(node: ThreadNode, mid: string, updater: (n: ThreadNode) => ThreadNode): ThreadNode {
  if (node.mid === mid) return updater(node);
  return { ...node, children: node.children.map((c) => updateNodeInTree(c, mid, updater)) };
}

// Root + comments are fetched separately: the root always via /spa/display,
// comments either a first page (normal open, shape depends on the thread_mode
// setting — threaded or flat) or, when `uuid` names a comment nested inside
// the thread rather than the root itself (opened via an in-body permalink
// click — see handleBodyClick below), as the ancestor + sibling-window
// "context" fetch around that comment instead — always rendered hierarchically
// regardless of thread_mode, since showing "this comment in context" is
// inherently about its ancestor chain.
interface PostDetailResult {
  node: ThreadNode;
  // True when this fetch used the ancestor + sibling-window "context" mode
  // (uuid names a comment nested inside the thread, not the root itself) —
  // meaning only that comment's immediate surroundings were loaded, not the
  // rest of the thread. Callers use this to offer a "show all comments"
  // affordance, since context mode has no "load more" of its own (see
  // buildCommentContext's backend doc comment — it's deliberately scoped to
  // one comment's context, not a paginated view).
  isContext: boolean;
}

async function fetchPostDetail(uuid: string, order: CommentOrder, threaded: boolean): Promise<PostDetailResult> {
  const rawRoot = await fetchDisplayItem(uuid);

  const isHighlight = uuid !== rawRoot.uuid;
  // Comments are a second request. Offline the root can come from the local
  // message store while the comments have no cached copy — show the message
  // rather than failing the whole thread on its replies.
  const commentsResult = await (
    isHighlight
      ? fetchComments(rawRoot.uuid, { around: uuid })
      : threaded
        ? fetchComments(rawRoot.uuid, { count: COMMENTS_PAGE_SIZE, order })
        : fetchComments(rawRoot.uuid, { count: COMMENTS_PAGE_SIZE, flat: true, order })
  ).catch(
    () =>
      ({ mid: rawRoot.uuid, total: 0, comments: [] }) as Awaited<
        ReturnType<typeof fetchComments>
      >,
  );

  // Viewing the thread is what "reads" it — the root's own unseen flag was
  // already cleared by the caller (e.g. MessageItem.handleClick), but
  // replies/comments never go through that path, so their unseen flags
  // would otherwise never clear (see HQ message-badge bug: badge kept
  // reappearing for threads with unseen replies).
  if (rawRoot?.item_unseen && rawRoot?.uuid) markItemSeen(rawRoot.uuid);
  for (const raw of commentsResult.comments ?? []) {
    if (raw?.item_unseen && raw?.uuid) markItemSeen(raw.uuid);
  }

  const rootPost: Post = mapActivityToPost(rawRoot);
  const posts = (commentsResult.comments ?? []).map(mapActivityToPost);
  const children = isHighlight
    ? buildThreadTree(posts)
    : threaded
      ? applyBranchMeta(buildThreadTree(posts, order), commentsResult.branches)
      : flatNodes(posts);
  return {
    node: {
      ...rootPost,
      children,
      hasMoreComments: !isHighlight && !!(threaded ? commentsResult.has_more_roots : commentsResult.has_more),
      commentsOffset: isHighlight ? undefined : (threaded ? commentsResult.next_roots_offset : commentsResult.next_offset),
    },
    isContext: isHighlight,
  };
}

type ReactionOverride = {
  viewerLiked?: boolean;
  viewerDisliked?: boolean;
  viewerRepeated?: boolean;
  viewerStarred?: boolean;
  pinned?: boolean;
  likeCount?: number;
  dislikeCount?: number;
  repeatCount?: number;
};

function findInTree(n: ThreadNode | undefined, mid: string): ThreadNode | undefined {
  if (!n) return undefined;
  if (n.mid === mid) return n;
  for (const child of n.children) {
    const found = findInTree(child, mid);
    if (found) return found;
  }
  return undefined;
}

function applyOverrides(n: ThreadNode, overrides: Record<string, ReactionOverride>): ThreadNode {
  return {
    ...(overrides[n.mid] ? { ...n, ...overrides[n.mid] } : n),
    children: n.children.map(c => applyOverrides(c, overrides)),
  };
}

interface PostDetailModalProps {
  uuid: string;
  onClose: () => void;
  handlers?: StreamHandlers;
}

const PostDetailModal: Component<PostDetailModalProps> = (props) => {
  const [nodeData, setNodeData] = createSignal<ThreadNode | undefined>(undefined);
  const [nodeLoading, setNodeLoading] = createSignal(true);
  const [nodeError, setNodeError] = createSignal<Error | null>(null);
  const [nestedUuid, setNestedUuid] = createSignal<string | null>(null);
  const [localReactions, setLocalReactions] = createSignal<Record<string, ReactionOverride>>({});
  // True while the current view is a narrow ancestor+siblings "context" fetch
  // (opened via a notification or in-body permalink to a specific comment) —
  // drives the "show all comments" banner, since that mode has no "load more"
  // of its own to reach the rest of the thread.
  const [isNarrowContext, setIsNarrowContext] = createSignal(false);
  const [loadingFullThread, setLoadingFullThread] = createSignal(false);

  const { t } = useI18n();
  const commentOrder = useCommentOrder();
  const threadMode = useThreadMode();
  let dialogRef!: HTMLDivElement;
  let scrollRef!: HTMLDivElement;
  onMount(() => scrollRef?.focus());

  async function loadNode(uuid: string) {
    setNodeLoading(true);
    setNodeError(null);
    try {
      const { node, isContext } = await fetchPostDetail(uuid, commentOrder(), threadMode());
      setNodeData(() => node);
      setIsNarrowContext(isContext);
    } catch (e) {
      setNodeError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setNodeLoading(false);
    }
  }

  // Drops the narrow ancestor+siblings context view and re-fetches the
  // thread normally (root-level pagination, respecting thread_mode) starting
  // from page 1 — the target comment stays highlighted (highlightUuid below
  // doesn't depend on which fetch mode was used) if it happens to be on that
  // first page, but the point is letting the viewer browse the rest of the
  // thread, not necessarily keeping the target in view.
  async function loadFullThread() {
    const rootUuid = nodeData()?.uuid;
    if (!rootUuid || loadingFullThread()) return;
    setLoadingFullThread(true);
    try {
      const { node, isContext } = await fetchPostDetail(rootUuid, commentOrder(), threadMode());
      setNodeData(() => node);
      setIsNarrowContext(isContext);
    } catch (e) {
      setNodeError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoadingFullThread(false);
    }
  }

  async function loadMoreComments(rootUuid: string, attachMid: string, isRoot: boolean, offset: number, order: CommentOrder): Promise<void> {
    const existingChildren = findInTree(nodeData(), attachMid)?.children ?? [];

    if (!isRoot) {
      const result = await fetchComments(rootUuid, { branch: attachMid, branchOffset: offset, branchLimit: COMMENTS_PAGE_SIZE });
      const posts = (result.comments ?? []).map(mapActivityToPost);
      setNodeData((prev) => prev && updateNodeInTree(prev, attachMid, (n) => ({
        ...n,
        children: mergeReplies(existingChildren, posts, attachMid),
        hasMoreComments: !!result.has_more,
        commentsOffset: result.next_branch_offset ?? offset,
      })));
      return;
    }

    if (threadMode()) {
      const result = await fetchComments(rootUuid, { count: COMMENTS_PAGE_SIZE, rootsOffset: offset, order });
      const posts = (result.comments ?? []).map(mapActivityToPost);
      setNodeData((prev) => prev && updateNodeInTree(prev, attachMid, (n) => ({
        ...n,
        children: applyBranchMeta(appendNewBranches(existingChildren, posts, order), result.branches),
        hasMoreComments: !!result.has_more_roots,
        commentsOffset: result.next_roots_offset ?? offset,
      })));
    } else {
      const result = await fetchComments(rootUuid, { count: COMMENTS_PAGE_SIZE, offset, flat: true, order });
      const posts = (result.comments ?? []).map(mapActivityToPost);
      const existingMids = new Set(existingChildren.map((n) => n.mid));
      const fresh = flatNodes(posts.filter((p) => !existingMids.has(p.mid)));
      setNodeData((prev) => prev && updateNodeInTree(prev, attachMid, (n) => ({
        ...n,
        children: fresh.length ? [...existingChildren, ...fresh] : existingChildren,
        hasMoreComments: !!result.has_more,
        commentsOffset: result.next_offset ?? offset,
      })));
    }
  }

  createEffect(on(() => props.uuid, (uuid) => { void loadNode(uuid); }));

  function refetch() { void loadNode(props.uuid); }

  const highlightUuid = createMemo(() => {
    const n = nodeData();
    if (!n) return undefined;
    return props.uuid !== n.uuid ? props.uuid : undefined;
  });

  const displayNode = createMemo((): ThreadNode | undefined => {
    const n = nodeData();
    return n ? applyOverrides(n, localReactions()) : undefined;
  });

  function toggleReaction(
    mid: string,
    viewerField: keyof Pick<ReactionOverride, "viewerLiked" | "viewerDisliked" | "viewerRepeated">,
    countField: keyof Pick<ReactionOverride, "likeCount" | "dislikeCount" | "repeatCount">,
  ) {
    setLocalReactions(prev => {
      const o = prev[mid] ?? {};
      const treeNode = findInTree(nodeData(), mid);
      const currentActive = o[viewerField] ?? treeNode?.[viewerField] ?? false;
      const currentCount = o[countField] ?? treeNode?.[countField] ?? 0;
      return {
        ...prev,
        [mid]: {
          ...o,
          [viewerField]: !currentActive,
          [countField]: currentActive ? currentCount - 1 : currentCount + 1,
        },
      };
    });
  }

  const selfHandlers: StreamHandlers = {
    onLike(mid) {
      const found = findInTree(nodeData(), mid);
      if (!found?.iid) return;
      toggleReaction(mid, "viewerLiked", "likeCount");
      toggleVerb(found.iid, "like").catch(() => toggleReaction(mid, "viewerLiked", "likeCount"));
    },
    onDislike(mid) {
      const found = findInTree(nodeData(), mid);
      if (!found?.iid) return;
      toggleReaction(mid, "viewerDisliked", "dislikeCount");
      toggleVerb(found.iid, "dislike").catch(() => toggleReaction(mid, "viewerDisliked", "dislikeCount"));
    },
    onRepeat(mid) {
      const o = localReactions()[mid];
      const treeNode = findInTree(nodeData(), mid);
      const alreadyRepeated = o?.viewerRepeated ?? treeNode?.viewerRepeated ?? false;
      if (alreadyRepeated || !treeNode?.iid) return;
      setLocalReactions(prev => {
        const existing = prev[mid] ?? {};
        return { ...prev, [mid]: { ...existing, viewerRepeated: true, repeatCount: (existing.repeatCount ?? treeNode.repeatCount ?? 0) + 1 } };
      });
      repeatItem(treeNode.iid).catch(() => {
        setLocalReactions(prev => {
          const existing = prev[mid] ?? {};
          return { ...prev, [mid]: { ...existing, viewerRepeated: false, repeatCount: (existing.repeatCount ?? 1) - 1 } };
        });
      });
    },
    // CommentComposer already POSTs the comment itself; only refresh here.
    onComment() {
      refetch();
    },
    onLoadComments: () => Promise.resolve(),
    onLoadMoreComments: loadMoreComments,
    onStar(mid) {
      const found = findInTree(nodeData(), mid);
      if (!found?.iid) return;
      const o = localReactions()[mid];
      const current = o?.viewerStarred ?? found.viewerStarred ?? false;
      setLocalReactions(prev => ({ ...prev, [mid]: { ...(prev[mid] ?? {}), viewerStarred: !current } }));
      apiToggleStar(found.iid).catch(() => {
        setLocalReactions(prev => ({ ...prev, [mid]: { ...(prev[mid] ?? {}), viewerStarred: current } }));
      });
    },
    async onEdit(mid, payload) {
      const found = findInTree(nodeData(), mid);
      if (!found?.uuid) throw new Error("Item not found");
      await apiEditItem(found.uuid, payload);
      await loadNode(props.uuid);
    },
    async onDelete(mid) {
      const found = findInTree(nodeData(), mid);
      if (found?.uuid) await apiDeleteItem(found.uuid);
      props.onClose();
    },
    async onApprove(iid) {
      await approveModerationItem(iid);
      await loadNode(props.uuid);
    },
    async onReject(iid) {
      await dropModerationItem(iid);
      await loadNode(props.uuid);
    },
  };

  function handleBodyClick(e: MouseEvent) {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    try {
      let path: string;
      if (href.startsWith("http")) {
        const url = new URL(href);
        if (url.hostname !== window.location.hostname) return;
        path = url.pathname;
      } else {
        path = href;
      }
      const m = path.match(/\/display\/([^/?#]+)/);
      if (m) {
        e.preventDefault();
        setNestedUuid(m[1]);
      }
    } catch { /* ignore */ }
  }

  const wrappedHandlers: StreamHandlers | undefined = props.handlers
    ? {
        onLike: (mid: string) => {
          props.handlers!.onLike(mid);
          toggleReaction(mid, "viewerLiked", "likeCount");
        },
        onDislike: (mid: string) => {
          props.handlers!.onDislike(mid);
          toggleReaction(mid, "viewerDisliked", "dislikeCount");
        },
        onRepeat: (mid: string) => {
          const o = localReactions()[mid];
          const treeNode = findInTree(nodeData(), mid);
          const alreadyRepeated = o?.viewerRepeated ?? treeNode?.viewerRepeated ?? false;
          if (alreadyRepeated) return;
          props.handlers!.onRepeat(mid);
          setLocalReactions(prev => {
            const existing = prev[mid] ?? {};
            const currentCount = existing.repeatCount ?? treeNode?.repeatCount ?? 0;
            return { ...prev, [mid]: { ...existing, viewerRepeated: true, repeatCount: currentCount + 1 } };
          });
        },
        onComment: (parentMid, body, authorName, authorAvatar) => {
          props.handlers!.onComment(parentMid, body, authorName, authorAvatar);
          refetch();
        },
        onLoadComments: (mid, uuid) => props.handlers!.onLoadComments(mid, uuid),
        // Not delegated to props.handlers: that targets the parent feed's
        // stream store, not this modal's own local nodeData tree.
        onLoadMoreComments: loadMoreComments,
        // Root edits go through the parent feed handler so its copy stays in
        // sync; comments usually aren't in the feed store, so edit directly.
        onEdit: async (mid: string, payload: EditPayload) => {
          if (nodeData()?.mid === mid && props.handlers!.onEdit) {
            await props.handlers!.onEdit(mid, payload);
          } else {
            const found = findInTree(nodeData(), mid);
            if (!found?.uuid) throw new Error("Item not found");
            await apiEditItem(found.uuid, payload);
          }
          await loadNode(props.uuid);
        },
        onStar: props.handlers!.onStar
          ? (mid: string) => {
              props.handlers!.onStar!(mid);
              setLocalReactions(prev => {
                const o = prev[mid] ?? {};
                const treeNode = findInTree(nodeData(), mid);
                const current = o.viewerStarred ?? treeNode?.viewerStarred ?? false;
                return { ...prev, [mid]: { ...o, viewerStarred: !current } };
              });
            }
          : undefined,
        onPin: props.handlers!.onPin
          ? (mid: string) => {
              props.handlers!.onPin!(mid);
              setLocalReactions(prev => {
                const o = prev[mid] ?? {};
                const treeNode = findInTree(nodeData(), mid);
                const current = o.pinned ?? treeNode?.pinned ?? false;
                return { ...prev, [mid]: { ...o, pinned: !current } };
              });
            }
          : undefined,
        onDelete: props.handlers!.onDelete
          ? async (mid: string) => {
              const found = findInTree(nodeData(), mid);
              if (found?.uuid) await apiDeleteItem(found.uuid);
              props.handlers!.onDelete!(mid);
              props.onClose();
            }
          : undefined,
        onRefresh: async () => { refetch(); },
        // Moderation isn't a feed concern — no feed handler set supplies these,
        // and they act on this modal's own tree — so reuse selfHandlers'.
        onApprove: selfHandlers.onApprove,
        onReject: selfHandlers.onReject,
      }
    : undefined;

  return (
    <Portal>
      <Show when={nestedUuid()}>
        <PostDetailModal
          uuid={nestedUuid()!}
          onClose={() => setNestedUuid(null)}
          handlers={props.handlers}
        />
      </Show>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay/80"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="post-modal-title"
          tabindex="-1"
          class="relative w-full max-w-full lg:max-w-[50%] max-h-[90svh] flex flex-col
                 bg-base rounded-2xl shadow-2xl overflow-clip focus:outline-none"
        >
          {/* Header */}
          <div class="flex items-center justify-between px-5 py-3 shrink-0 border-b border-rim bg-surface">
            <h2 id="post-modal-title" class="text-sm font-semibold text-muted">
              {nodeData() && isDirectMessage(nodeData()!) ? t("post.dm_title") : t("post.modal_title")}
            </h2>
            <button
              onClick={props.onClose}
              class="p-1.5 rounded-lg hover:bg-elevated
                     text-subtle hover:text-txt transition-colors"
              aria-label={t("post.modal_close")}
            >
              <BiRegularX />
            </button>
          </div>

          {/* Scrollable body */}
          <div
            ref={scrollRef}
            tabindex="-1"
            class="flex-1 overflow-y-auto focus:outline-none"
            style={{ "-webkit-overflow-scrolling": "touch" }}
            onClick={(e) => { e.stopPropagation(); handleBodyClick(e); }}
          >
            <Show when={nodeLoading() && !nodeData()}>
              <div class="space-y-4 animate-pulse">
                <div class="bg-surface rounded-2xl p-5">
                  <div class="flex gap-3 mb-4">
                    <div class="w-11 h-11 rounded-full bg-elevated" />
                    <div class="flex-1 space-y-2 pt-1">
                      <div class="h-3 bg-elevated rounded w-1/3" />
                      <div class="h-3 bg-elevated rounded w-1/4" />
                    </div>
                  </div>
                  <div class="space-y-2">
                    <div class="h-3 bg-elevated rounded" />
                    <div class="h-3 bg-elevated rounded w-5/6" />
                    <div class="h-3 bg-elevated rounded w-4/6" />
                  </div>
                </div>
              </div>
            </Show>

            <Show when={nodeError()}>
              <div class="bg-surface rounded-2xl p-6 text-center">
                <p class="text-sm text-red-500">
                  {t("post.load_error")}: {nodeError()?.message}
                </p>
              </div>
            </Show>

            <Show when={displayNode()}>
              {(n) => (
                <PostCard
                  post={n()}
                  highlightUuid={highlightUuid()}
                  initiallyExpanded
                  seamless
                  expandAll
                  handlers={wrappedHandlers ?? selfHandlers}
                  contextBanner={
                    <Show when={isNarrowContext()}>
                      <div class="flex items-center justify-between gap-3 px-4 py-2 mb-3 rounded-xl bg-surface border border-rim text-xs text-muted">
                        <span>{t("post.viewing_in_context")}</span>
                        <button
                          type="button"
                          onClick={loadFullThread}
                          disabled={loadingFullThread()}
                          class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium
                                 rounded-full border border-rim bg-base text-muted
                                 hover:bg-overlay hover:text-txt transition-colors
                                 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {loadingFullThread() ? t("post.loading") : t("post.show_all_comments")}
                        </button>
                      </div>
                    </Show>
                  }
                />
              )}
            </Show>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default PostDetailModal;
