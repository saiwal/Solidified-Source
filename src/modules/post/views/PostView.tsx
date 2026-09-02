// src/modules/post/views/PostView.tsx
import { createMemo, createSignal, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import PostCard from "@/shared/stream/components/PostCard";
import type { StreamHandlers } from "@/shared/stream/types";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { buildThreadTree, appendNewBranches, mergeReplies, applyBranchMeta } from "@utsukta/spa-core/lib/thread";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { mapActivityToPost } from "@utsukta/spa-core/lib/activity.mapper";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  apiDeleteItem,
  apiEditItem,
  apiToggleStar,
  fetchComments,
  fetchDisplayItem,
} from "@utsukta/spa-core/lib/item-api";
import { toggleVerb, repeatItem, COMMENTS_PAGE_SIZE, tempCommentNode } from "@/shared/stream/store/actions-store";
import { useCommentOrder } from "@utsukta/spa-core/store/comment-order";
import type { CommentOrder } from "@utsukta/spa-core/store/comment-order";
import { useThreadMode } from "@utsukta/spa-core/store/thread-mode";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { unblockChannel } from "@utsukta/spa-core/lib/blocklist-api";
import { approveModerationItem, dropModerationItem } from "@/modules/moderate/api";

function flatNodes(posts: Post[]): ThreadNode[] {
  return posts.map((p) => ({ ...p, children: [] }));
}

function updateNodeInTree(node: ThreadNode, mid: string, updater: (n: ThreadNode) => ThreadNode): ThreadNode {
  if (node.mid === mid) return updater(node);
  return { ...node, children: node.children.map((c) => updateNodeInTree(c, mid, updater)) };
}

// Root + a first page of comments (shape depends on the thread_mode setting
// — threaded or flat), fetched separately (no highlight/context mode here —
// this route has no target-comment param today; see PostDetailModal for the
// sibling-window fetch used when opening a permalink to a specific nested
// comment instead of the thread root).
async function fetchPost(uuid: string): Promise<ThreadNode> {
  const rawRoot = await fetchDisplayItem(uuid);

  const order = useCommentOrder()();
  const threaded = useThreadMode()();
  // Comments are a second request — see PostDetailModal: offline the root can
  // come from the local store while the comments have no copy, and a post
  // without its replies beats an error page.
  const commentsResult = await (
    threaded
      ? fetchComments(rawRoot.uuid, { count: COMMENTS_PAGE_SIZE, order })
      : fetchComments(rawRoot.uuid, { count: COMMENTS_PAGE_SIZE, flat: true, order })
  ).catch(
    () => ({ mid: rawRoot.uuid, total: 0, comments: [] }) as Awaited<ReturnType<typeof fetchComments>>,
  );

  const rootPost: Post = mapActivityToPost(rawRoot);
  const posts = (commentsResult.comments ?? []).map(mapActivityToPost);
  const children = threaded
    ? applyBranchMeta(buildThreadTree(posts, order), commentsResult.branches)
    : flatNodes(posts);
  return {
    ...rootPost,
    children,
    hasMoreComments: !!(threaded ? commentsResult.has_more_roots : commentsResult.has_more),
    commentsOffset: threaded ? commentsResult.next_roots_offset : commentsResult.next_offset,
  };
}

type ReactionOverride = {
  viewerLiked?: boolean;
  viewerDisliked?: boolean;
  viewerRepeated?: boolean;
  viewerStarred?: boolean;
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
  const o = overrides[n.mid];
  return {
    ...(o ? { ...n, ...o } : n),
    children: n.children.map(c => applyOverrides(c, overrides)),
  };
}

export default function PostView() {
  const params = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const navViewer = useNavViewer();

  const [node, { refetch, mutate }] = createQueryResource("post", () => params.uuid, fetchPost);

  // The just-posted reply is appended in place rather than refetched — a
  // refetch re-runs the paged comment fetch, which may not include it.
  function addLocalComment(parentMid: string, body: string) {
    const comment = tempCommentNode(parentMid, body, navViewer());
    mutate((prev) => prev && updateNodeInTree(prev, parentMid, (n) => ({
      ...n, children: [...n.children, comment],
    })));
  }
  const [localReactions, setLocalReactions] = createSignal<Record<string, ReactionOverride>>({});

  async function loadMoreComments(rootUuid: string, attachMid: string, isRoot: boolean, offset: number, order: CommentOrder): Promise<void> {
    const existingChildren = findInTree(node(), attachMid)?.children ?? [];

    if (!isRoot) {
      const result = await fetchComments(rootUuid, { branch: attachMid, branchOffset: offset, branchLimit: COMMENTS_PAGE_SIZE });
      const posts = (result.comments ?? []).map(mapActivityToPost);
      mutate((prev) => prev && updateNodeInTree(prev, attachMid, (n) => ({
        ...n,
        children: mergeReplies(existingChildren, posts, attachMid),
        hasMoreComments: !!result.has_more,
        commentsOffset: result.next_branch_offset ?? offset,
      })));
      return;
    }

    if (useThreadMode()()) {
      const result = await fetchComments(rootUuid, { count: COMMENTS_PAGE_SIZE, rootsOffset: offset, order });
      const posts = (result.comments ?? []).map(mapActivityToPost);
      mutate((prev) => prev && updateNodeInTree(prev, attachMid, (n) => ({
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
      mutate((prev) => prev && updateNodeInTree(prev, attachMid, (n) => ({
        ...n,
        children: fresh.length ? [...existingChildren, ...fresh] : existingChildren,
        hasMoreComments: !!result.has_more,
        commentsOffset: result.next_offset ?? offset,
      })));
    }
  }

  const displayNode = createMemo((): ThreadNode | undefined => {
    const n = node();
    return n ? applyOverrides(n, localReactions()) : undefined;
  });

  function toggleReaction(
    mid: string,
    viewerField: keyof Pick<ReactionOverride, "viewerLiked" | "viewerDisliked" | "viewerRepeated">,
    countField: keyof Pick<ReactionOverride, "likeCount" | "dislikeCount" | "repeatCount">,
  ) {
    setLocalReactions(prev => {
      const o = prev[mid] ?? {};
      const treeNode = findInTree(node(), mid);
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

  const handlers: StreamHandlers = {
    onLike(mid) {
      const found = findInTree(node(), mid);
      if (!found?.iid) return;
      toggleReaction(mid, "viewerLiked", "likeCount");
      toggleVerb(found.iid, "like").catch(() => toggleReaction(mid, "viewerLiked", "likeCount"));
    },
    onDislike(mid) {
      const found = findInTree(node(), mid);
      if (!found?.iid) return;
      toggleReaction(mid, "viewerDisliked", "dislikeCount");
      toggleVerb(found.iid, "dislike").catch(() => toggleReaction(mid, "viewerDisliked", "dislikeCount"));
    },
    onRepeat(mid) {
      const o = localReactions()[mid];
      const treeNode = findInTree(node(), mid);
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
    // CommentComposer already POSTs the comment itself; just show it.
    onComment(parentMid, body) {
      addLocalComment(parentMid, body);
    },
    onLoadComments: () => Promise.resolve(),
    onLoadMoreComments: loadMoreComments,
    onStar(mid) {
      const found = findInTree(node(), mid);
      if (!found?.iid) return;
      const o = localReactions()[mid];
      const current = o?.viewerStarred ?? found.viewerStarred ?? false;
      setLocalReactions(prev => ({ ...prev, [mid]: { ...(prev[mid] ?? {}), viewerStarred: !current } }));
      apiToggleStar(found.iid).catch(() => {
        setLocalReactions(prev => ({ ...prev, [mid]: { ...(prev[mid] ?? {}), viewerStarred: current } }));
      });
    },
    async onDelete(mid) {
      const found = findInTree(node(), mid);
      if (found?.uuid) await apiDeleteItem(found.uuid);
      navigate(-1);
    },
    async onEdit(mid, payload) {
      const found = findInTree(node(), mid);
      if (!found?.uuid) return;
      await apiEditItem(found.uuid, payload);
      refetch();
    },
    async onApprove(iid) {
      await approveModerationItem(iid);
      refetch();
    },
    async onReject(iid) {
      await dropModerationItem(iid);
      refetch();
    },
  };

  return (
    <div class="max-w-3xl mx-auto py-4 px-2">
      <Show when={node.loading && !node()}>
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

      <Show when={node.error}>
        <div class="bg-surface rounded-2xl p-6 text-center">
          <p class="text-sm text-red-500">
            {t("post.load_error")}: {node.error?.message}
          </p>
        </div>
      </Show>

      <Show when={displayNode()}>
        {(n) => (
          <Show
            when={!n().blocked}
            fallback={<BlockedPlaceholder authorHash={n().authorHash} onUnblocked={refetch} />}
          >
            <PostCard
              post={n()}
              initiallyExpanded
              handlers={handlers}
            />
          </Show>
        )}
      </Show>
    </div>
  );
}

function BlockedPlaceholder(props: { authorHash?: string; onUnblocked: () => void }) {
  const { t } = useI18n();
  const [unblocking, setUnblocking] = createSignal(false);

  async function handleUnblock() {
    if (!props.authorHash || unblocking()) return;
    setUnblocking(true);
    try {
      await unblockChannel(props.authorHash);
      props.onUnblocked();
    } finally {
      setUnblocking(false);
    }
  }

  return (
    <div class="bg-surface rounded-2xl p-6 text-center space-y-3">
      <p class="text-sm text-muted">{t("blocklist.permalink_blocked")}</p>
      <button
        onClick={handleUnblock}
        disabled={unblocking()}
        class="text-xs px-3 py-1.5 rounded-lg border border-rim text-muted
               hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
      >
        {unblocking() ? t("blocklist.unblocking") : t("blocklist.unblock")}
      </button>
    </div>
  );
}
