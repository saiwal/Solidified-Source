// src/modules/post/views/PostView.tsx
import { zrl } from "@utsukta/spa-core/lib/zid";
import { createEffect, createMemo, createSignal, Show, untrack } from "solid-js";
import { updateInterval } from "@utsukta/spa-core/store/auth-store";
import { cardClass } from "@ui/Card";
import { useLocation, useNavigate, useParams } from "@solidjs/router";
import { setPathSubject } from "@utsukta/spa-core/store/site-config";
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
import type { CreatedComment } from "@/shared/editor/composers/CommentComposer";
import { toggleVerb, repeatItem, COMMENTS_PAGE_SIZE, tempCommentNode } from "@/shared/stream/store/actions-store";
import { useCommentOrder } from "@utsukta/spa-core/store/comment-order";
import type { CommentOrder } from "@utsukta/spa-core/store/comment-order";
import { useThreadMode } from "@utsukta/spa-core/store/thread-mode";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { unblockChannel } from "@utsukta/spa-core/lib/blocklist-api";
import { approveModerationItem, dropModerationItem } from "@/modules/moderate/api";
import { Button } from "@ui/Button";
import PageActions from "@/shared/views/layout/PageActions";
import { openShare } from "@utsukta/spa-core/store/share";
import { shareTargetForPost } from "@/shared/lib/shareLinks";
import { MdOutlineOpen_in_new, MdOutlineShare } from "solid-icons/md";

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
// ponytail: a b64-encoded mid can't be told apart from its root by uuid, so a
// comment opened that way isn't highlighted; decode and compare mids if needed.
const isCommentLink = (uuid: string, rootUuid: string) => uuid !== rootUuid && !uuid.startsWith("b64.");

async function fetchPost([uuid, threaded, order, full]: readonly [string, boolean, CommentOrder, boolean]): Promise<ThreadNode> {
  const rawRoot = await fetchDisplayItem(uuid);
  // The link names a comment: load that comment's ancestors and siblings
  // (as PostDetailModal does) instead of page one, until "show all".
  const context = !full && isCommentLink(uuid, rawRoot.uuid);
  // Comments are a second request — see PostDetailModal: offline the root can
  // come from the local store while the comments have no copy, and a post
  // without its replies beats an error page.
  const commentsResult = await (
    context
      ? fetchComments(rawRoot.uuid, { around: uuid })
      : threaded
        ? fetchComments(rawRoot.uuid, { count: COMMENTS_PAGE_SIZE, order })
        : fetchComments(rawRoot.uuid, { count: COMMENTS_PAGE_SIZE, flat: true, order })
  ).catch(
    () => ({ mid: rawRoot.uuid, total: 0, comments: [] }) as Awaited<ReturnType<typeof fetchComments>>,
  );

  const rootPost: Post = mapActivityToPost(rawRoot);
  const posts = (commentsResult.comments ?? []).map(mapActivityToPost);
  // The context window isn't ordered by the server.
  const byCreated = (a: Post, b: Post) =>
    order === "newest_first" ? b.created.localeCompare(a.created) : a.created.localeCompare(b.created);
  const children = context
    ? (threaded ? buildThreadTree(posts) : flatNodes([...posts].sort(byCreated)))
    : threaded
      ? applyBranchMeta(buildThreadTree(posts, order), commentsResult.branches)
      : flatNodes(posts);
  return {
    ...rootPost,
    children,
    hasMoreComments: !context && !!(threaded ? commentsResult.has_more_roots : commentsResult.has_more),
    commentsOffset: context ? undefined : (threaded ? commentsResult.next_roots_offset : commentsResult.next_offset),
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

  // A comment link opens in context; "show all" swaps in the paged thread.
  const [fullThread, setFullThread] = createSignal(false);
  createEffect(() => params.uuid, () => { setFullThread(false); }, { defer: true });

  const [node, { refetch, mutate }] = createQueryResource(
    "post",
    // Comment style and order are part of the key, so changing either in
    // Settings refetches instead of serving the cached shape.
    () => (params.uuid ? ([params.uuid, useThreadMode()(), useCommentOrder()(), fullThread()] as const) : undefined),
    fetchPost,
    // loadMoreComments/addLocalComment grow the cached tree; a background
    // refetch would cut it back to the first comment page and jump the page.
    { refetchOnWindowFocus: false, refetchOnReconnect: false },
  );

  // The just-posted reply is appended in place rather than refetched — a
  // refetch re-runs the paged comment fetch, which may not include it.
  function addLocalComment(parentMid: string, body: string, created?: CreatedComment) {
    // List mode: every comment hangs off the root (see PostDetailModal).
    mutate((prev) => prev && updateNodeInTree(prev, useThreadMode()() ? parentMid : prev.mid, (n) => ({
      ...n,
      children: [...n.children, tempCommentNode(parentMid, body, navViewer(), { ...created, profileUid: n.profileUid, parent_mid: prev.mid })],
    })));
    setKnownTotal((k) => (k === null ? k : k + 1)); // mine isn't news
  }

  const highlightUuid = createMemo(() => {
    const n = node();
    return n && params.uuid && isCommentLink(params.uuid, n.uuid) ? params.uuid : undefined;
  });

  // An article, card or webpage answers with the page it lives on.
  createEffect(() => (node.error as { redirect?: string } | undefined)?.redirect, (to) => {
    if (to) navigate(to, { replace: true });
  });

  // The layout titles a page after its module, and this one has no nav label.
  createEffect(() => {
    const n = node();
    return n ? `${(!n.titleNsfw && n.title) || n.authorName} · Hubzilla` : null;
  }, (title) => {
    if (title) document.title = title;
  });

  // New comments: poll the thread's total and offer a refresh — refetching
  // unasked would cut a paged-in thread back to page one under the reader.
  // The first answer is the baseline, so both sides count the same way.
  const [knownTotal, setKnownTotal] = createSignal<number | null>(null);
  const [liveTotal, setLiveTotal] = createSignal(0);
  const newComments = () => (knownTotal() === null ? 0 : Math.max(0, liveTotal() - knownTotal()!));
  const rootUuid = createMemo(() => node()?.uuid);
  createEffect(() => [rootUuid(), updateInterval()] as const, ([uuid, every]) => {
    const cleanups: (() => void)[] = [];
    if (!uuid) return;
    setKnownTotal(null);
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetchComments(uuid, { count: 1, flat: true }).catch(() => null);
      if (!r || stopped) return;
      if (untrack(knownTotal) === null) setKnownTotal(r.total);
      setLiveTotal(r.total);
    };
    void check();
    const id = setInterval(check, every);
    cleanups.push(() => { stopped = true; clearInterval(id); });
    return () => cleanups.forEach((f) => f());
  });
  const showNewComments = () => {
    setKnownTotal(liveTotal());
    // Leaving a comment-in-context view fetches by itself (new query key).
    if (highlightUuid() && !fullThread()) setFullThread(true);
    else refetch();
  };

  const [localReactions, setLocalReactions] = createSignal<Record<string, ReactionOverride>>({});

  // A wall post makes this the channel's page: nav, theme and search follow.
  const route = useLocation();
  createEffect(() => [route.pathname, node()?.wallNick ?? ""] as const, ([path, wall]) => { setPathSubject(path, wall); });

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
    onComment(parentMid, body, _name, _avatar, created) {
      addLocalComment(parentMid, body, created);
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

      <Show when={node.error && !(node.error as { redirect?: string }).redirect}>
        <div class="bg-surface rounded-2xl p-6 text-center">
          <p class="text-sm text-danger-txt">
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
            <PageActions mobileOnly actions={[
              { label: t("share.action"), icon: MdOutlineShare, onClick: () => openShare(shareTargetForPost(n())) },
              // A federated post's home copy; a local one's permalink is this page.
              { label: t("post.original"), icon: MdOutlineOpen_in_new, href: zrl(n().permalink),
                show: !!n().permalink && !n().permalink.startsWith(location.origin) },
            ]} />
            <Show when={newComments() > 0}>
              <Button class="w-full mb-3" onClick={showNewComments}>
                ↑ {newComments()} {newComments() === 1 ? t("post.comments_singular") : t("post.comments_plural")}
              </Button>
            </Show>
            <PostCard
              post={n()}
              highlightUuid={highlightUuid()}
              initiallyExpanded
              handlers={handlers}
              contextBanner={
                <Show when={highlightUuid() && !fullThread()}>
                  <div class={`${cardClass()} flex items-center justify-between gap-3 px-4 py-2 mb-3 text-xs text-muted`}>
                    <span>{t("post.viewing_in_context")}</span>
                    <Button variant="ghost" size="sm" class="shrink-0" onClick={() => setFullThread(true)}>
                      {t("post.show_all_comments")}
                    </Button>
                  </div>
                </Show>
              }
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
      <Button variant="ghost" size="sm" onClick={handleUnblock} disabled={unblocking()}>
        {unblocking() ? t("blocklist.unblocking") : t("blocklist.unblock")}
      </Button>
    </div>
  );
}
