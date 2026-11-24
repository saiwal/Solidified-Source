// src/shared/stream/store/createStreamStore.ts
import { createSignal, untrack, createStore, reconcile, snapshot, createOptimisticStore, createRoot, action, deep } from "solid-js";
import { buildThreadTree } from "@utsukta/spa-core/lib/thread";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { updateInterval } from "@utsukta/spa-core/store/auth-store";
import { toast } from "@utsukta/spa-core/store/toast";
import { RANKED_ORDERS } from "@/shared/stream/filters/ranked";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { visibleUuids, prependWithMotion, resetReveal } from "@/shared/stream/reveal";
import { createSyncSignal } from "@utsukta/spa-core/lib/syncSignal";

interface LiveCounts {
  like_count: number;
  dislike_count: number;
  announce_count: number;
  comment_count: number;
  viewer_liked: boolean;
  viewer_disliked: boolean;
  viewer_repeated: boolean;
}

const COUNTS_MAX = 50; // matches Item::COUNTS_MAX

export interface StreamResult {
  items: Post[];
  rootCount: number;
  limit: number;
  nouveau: boolean;
}

export interface StreamParams {
  start?: number;
  dbegin?: string;
  [key: string]: unknown;
}

// ── private helpers (not exported) ───────────────────────────────────────────

function postToThreadNode(p: Post): ThreadNode {
  return { ...p, children: [] };
}

function findDraft(nodes: ThreadNode[], mid: string): ThreadNode | undefined {
  for (const n of nodes) {
    if (n.mid === mid) return n;
    const found = n.children.length ? findDraft(n.children, mid) : undefined;
    if (found) return found;
  }
  return undefined;
}

const REACTION_FIELDS = {
  like: ["viewerLiked", "likeCount"],
  dislike: ["viewerDisliked", "dislikeCount"],
  announce: ["viewerRepeated", "repeatCount"],
} as const;

/** Sets a reaction on a node, adjusting its count only if it changes —
 *  idempotent, so applying it to the view and then to the confirmed store
 *  (which a poll may already have updated) never double-counts. */
export function setReaction(n: ThreadNode, verb: keyof typeof REACTION_FIELDS, on: boolean) {
  const [flag, count] = REACTION_FIELDS[verb];
  if (n[flag] === on) return;
  n[flag] = on;
  n[count] += on ? 1 : -1;
}

export function updateNode(
  nodes: ThreadNode[],
  mid: string,
  updater: (n: ThreadNode) => ThreadNode,
): ThreadNode[] {
  return nodes.map((n) => {
    if (n.mid === mid) return updater(n);
    if (n.children.length)
      return { ...n, children: updateNode(n.children, mid, updater) };
    return n;
  });
}

function countsKey(n: ThreadNode): string {
  return [n.likeCount, n.dislikeCount, n.repeatCount, n.commentCount, n.viewerLiked, n.viewerDisliked, n.viewerRepeated].join();
}

// ── factory ───────────────────────────────────────────────────────────────────

export function createStreamStore<P extends StreamParams>(
  fetcher: (params: P) => Promise<StreamResult>,
) {
  // A store reconciled by mid, not a signal: updateNode() returns a fresh
  // object for the node it touches, and <For> keys by reference — as a plain
  // signal every like/edit (and every live-count poll) remounted that card,
  // dropping its open reply box, expanded body and playing media. Reconciling
  // patches the existing node in place, so only the changed text re-renders.
  const [state, setState] = createStore<{ posts: ThreadNode[] }>({ posts: [] });
  // What views render: the confirmed posts plus whatever is in flight. A
  // reaction runs as an action (`optimistic` below): it shows at once, and
  // when it settles the view falls back to the confirmed store — which by
  // then holds the result, or never changed if the request failed. A poll
  // writing the confirmed store meanwhile can't undo it on screen, which is
  // what the old activated/inflight bookkeeping existed for.
  // ponytail: deep() re-snapshots the whole feed on every store write — fine
  // at feed sizes; project per thread if HOT_SCOPE_TIME ever flags it.
  const [view, setView] = createRoot(() =>
    createOptimisticStore(() => deep(state.posts), [] as ThreadNode[], { key: "mid" }));
  const posts = () => view;
  function setPosts(next: ThreadNode[] | ((prev: ThreadNode[]) => ThreadNode[])) {
    const value = typeof next === "function" ? next(snapshot(state.posts)) : next;
    setState((s) => { reconcile(value, "mid")(s.posts); });
  }
  const [loading, setLoading] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [newPosts, setNewPosts] = createSignal<ThreadNode[]>([]);
  const [profileUid, setProfileUid] = createSignal<number>(0);
  // Sync: load() sets params and fetches with them in the same step — a
  // batched signal would hand the fetcher the previous filter.
  const [params, setParams] = createSyncSignal<P>({} as P);

  let currentOffset = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollGeneration = 0;

  // ── polling ─────────────────────────────────────────────────────────────────

  // pollGeneration guards against orphaned poll chains: if stopPolling() runs
  // while a tick is already mid-flight (inside the await below), clearTimeout
  // can't cancel it — without this check that tick's schedule() call would
  // re-arm a new timer nothing can ever cancel again.
  function stopPolling() {
    pollGeneration++;
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  async function checkForNew() {
    // Ranked sorts (top/hot/discussed/controversial) don't put the newest post
    // first, so the created-based cursor below would be meaningless — no live
    // "new posts" pill while one of them is active.
    if (RANKED_ORDERS.includes(String(params().order))) return;
    const topPost = newPosts()[0] ?? posts()[0];
    if (!topPost) return;
    const topDate = new Date(topPost.created.replace(" ", "T") + "Z");
    topDate.setSeconds(topDate.getSeconds() + 1);
    const dbegin = topDate.toISOString().slice(0, 19).replace("T", " ");
    try {
      const result = await fetcher({ ...params(), start: 0, dbegin } as P);
      if (!result.items.length) return;
      const threads = result.nouveau
        ? result.items.map(postToThreadNode)
        : buildThreadTree(result.items);
      const existingMids = new Set([
        ...posts().map((t) => t.mid),
        ...newPosts().map((t) => t.mid),
      ]);
      const fresh = threads.filter((t) => !existingMids.has(t.mid));
      if (fresh.length) setNewPosts((prev) => [...fresh, ...prev]);
    } catch (err) {
      console.error("Poll failed", err);
    }
  }

  // checkForNew() only asks for posts newer than the top one, so this keeps
  // the counts on already-loaded posts live. On-screen posts first; with
  // none tracked (a view without use:reveal) the newest loaded ones.
  async function refreshCounts() {
    const uid = profileUid();
    const loaded = snapshot(state.posts); // the confirmed store, not the optimistic view
    if (!uid || !loaded.length) return;
    const onScreen = loaded.filter((p) => visibleUuids.has(p.uuid));
    const uuids = (onScreen.length ? onScreen : loaded).slice(0, COUNTS_MAX).map((p) => p.uuid);
    const qs = new URLSearchParams({ uid: String(uid) });
    uuids.forEach((u) => qs.append("uuids[]", u));
    // Snapshot to compare against: a toggle that starts *and* finishes
    // while this request is out isn't in `inflight` by the time it lands.
    const before = new Map(loaded.map((p) => [p.uuid, countsKey(p)]));
    try {
      const res = await apiFetch(`/spa/item/counts?${qs}`);
      if (!res.ok) return;
      const counts: Record<string, LiveCounts> = (await res.json()).data ?? {};
      setPosts((prev) =>
        prev.map((n) => {
          const c = counts[n.uuid];
          if (!c || before.get(n.uuid) !== countsKey(n)) return n;
          const next = {
            ...n,
            likeCount: c.like_count,
            dislikeCount: c.dislike_count,
            repeatCount: c.announce_count,
            commentCount: c.comment_count,
            viewerLiked: c.viewer_liked,
            viewerDisliked: c.viewer_disliked,
            viewerRepeated: c.viewer_repeated,
          };
          return countsKey(next) === countsKey(n) ? n : next;
        }),
      );
    } catch (err) {
      console.error("Count refresh failed", err);
    }
  }

  function startPolling() {
    stopPolling();
    const generation = pollGeneration;
    const schedule = () => {
      pollTimer = setTimeout(async () => {
        if (generation !== pollGeneration) return;
        if (document.visibilityState === "visible") {
          await checkForNew();
          await refreshCounts();
        }
        if (generation !== pollGeneration) return;
        schedule();
      }, updateInterval());
    };
    schedule();
  }

  // ── load / loadMore ─────────────────────────────────────────────────────────

  // In flat/unthreaded mode (no thread-top restriction) a raw backend page
  // can consist entirely of non-post activity — likes/reactions on older
  // threads — which fetchers filter out client-side. That doesn't mean the
  // backend is out of data: "more" is driven by the raw rootCount vs limit,
  // not by whether anything survived client-side filtering. Keep pulling
  // pages (bounded) until something displayable turns up or we genuinely
  // run out.
  async function fetchDisplayablePage(startOffset: number): Promise<{
    threads: ThreadNode[];
    offset: number;
    more: boolean;
    result: StreamResult;
  }> {
    let offset = startOffset;
    let more = true;
    let result: StreamResult = { items: [], rootCount: 0, limit: 0, nouveau: false };
    for (let guard = 0; guard < 10 && more; guard++) {
      result = await fetcher({ ...params(), start: offset } as P);
      offset += result.rootCount;
      more = result.rootCount >= result.limit;
      const threads = result.nouveau
        ? result.items.map(postToThreadNode)
        : buildThreadTree(result.items);
      if (threads.length) return { threads, offset, more, result };
    }
    return { threads: [], offset, more, result };
  }

  // Latest load wins: a sort/filter change while a load is still out must
  // not be dropped, and the earlier response must not land over it.
  let loadGen = 0;

  async function load(newParams?: P) {
    const gen = ++loadGen;
    if (newParams !== undefined) setParams(() => newParams);
    setLoading(true);
    setHasMore(true);
    currentOffset = 0;
    stopPolling();
    resetReveal();
    try {
      // Untracked: callers fire load() from effects, and the fetcher reads
      // params()/nick() synchronously — tracked, the effect re-runs on the
      // setParams above and refetches page one forever.
      const { threads, offset, more, result } = await untrack(() => fetchDisplayablePage(0));
      if (gen !== loadGen) return;
      setPosts(threads);
      setNewPosts([]);
      currentOffset = offset;
      setHasMore(more);
      if (result.items.length && result.items[0].profileUid)
        setProfileUid(result.items[0].profileUid);
      startPolling();
    } catch (err) {
      if (gen !== loadGen) return;
      console.error(err);
      toast.error("Failed to load posts. Check your connection and try again.");
    } finally {
      if (gen === loadGen) setLoading(false);
    }
  }

  async function loadMore() {
    if (loadingMore() || !hasMore()) return;
    setLoadingMore(true);
    const gen = loadGen;
    try {
      const { threads, offset, more } = await fetchDisplayablePage(currentOffset);
      if (gen !== loadGen) return; // a fresh load replaced the list meanwhile
      const existingMids = new Set(posts().map((t) => t.mid));
      const fresh = threads.filter((t) => !existingMids.has(t.mid));
      if (fresh.length) setPosts((prev) => [...prev, ...fresh]);
      currentOffset = offset;
      setHasMore(more);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load more posts. Check your connection and try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  // ── optimistic changes ──────────────────────────────────────────────────────

  /** Shows `apply` on the node at once, runs `request`, and on success writes
   *  the same change to the confirmed store; a failure rolls back on its own.
   *  `apply` must be idempotent (see setReaction). */
  const optimistic = action(function* (mid: string, apply: (n: ThreadNode) => void, request: () => Promise<unknown>) {
    setView((s) => { const n = findDraft(s, mid); if (n) apply(n); });
    try {
      yield request();
    } catch (err) {
      console.error(err);
      return;
    }
    setState((s) => { const n = findDraft(s.posts, mid); if (n) apply(n); });
  });

  // ── misc ────────────────────────────────────────────────────────────────────

  // Sets a node's children plus its own pagination meta in one update.
  // commentsOffset MUST be kept in sync here — leaving it stale means the
  // next "load more" click keeps re-requesting an already-fetched page,
  // which gets silently deduped away and looks like the button does nothing.
  // Merge strategy (which thread.ts helper builds `children`) is the
  // caller's call — see actions-store.ts's loadComments/loadMoreComments —
  // since it differs by comment-view mode (threaded root page / threaded
  // branch continuation / flat list page) and this store has no opinion on
  // that.
  function patchNodeChildren(mid: string, children: ThreadNode[], hasMoreComments: boolean, commentsOffset: number) {
    setPosts((prev) =>
      updateNode(prev, mid, (n) => ({ ...n, children, hasMoreComments, commentsOffset })),
    );
  }

  function flushNewPosts() {
    const fresh = newPosts();
    if (!fresh.length) return;
    prependWithMotion(() => {
      setPosts((prev) => [...fresh, ...prev]);
      setNewPosts([]);
    }, posts()[0]?.uuid, fresh[0].uuid);
  }

  async function softRefresh() {
    if (refreshing()) return;
    if (posts().length === 0 && newPosts().length === 0) return load();
    setRefreshing(true);
    try {
      const result = await fetcher({ ...params(), start: 0 } as P);
      const threads = result.nouveau
        ? result.items.map(postToThreadNode)
        : buildThreadTree(result.items);
      const existingMids = new Set([
        ...posts().map((t) => t.mid),
        ...newPosts().map((t) => t.mid),
      ]);
      const fresh = threads.filter((t) => !existingMids.has(t.mid));
      if (fresh.length) {
        prependWithMotion(() => setPosts((prev) => [...fresh, ...prev]), posts()[0]?.uuid, fresh[0].uuid);
      }
    } catch (err) {
      console.error("Refresh failed", err);
      toast.error("Failed to refresh. Check your connection and try again.");
    } finally {
      setRefreshing(false);
    }
  }

  function reset() {
    setPosts([]);
    setNewPosts([]);
    setHasMore(true);
    currentOffset = 0;
    stopPolling();
  }

  return {
    posts,
    loading,
    loadingMore,
    refreshing,
    hasMore,
    newPosts,
    profileUid,
    load,
    loadMore,
    softRefresh,
    flushNewPosts,
    reset,
    stopPolling,
    optimistic,
    setPosts,
    patchNodeChildren,
  };
}
