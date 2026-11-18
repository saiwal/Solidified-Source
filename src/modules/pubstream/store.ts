// src/modules/pubstream/store.ts
import { createSignal, createStore, reconcile, createOptimisticStore, createRoot, action, deep } from "solid-js";
import { resetReveal } from "@/shared/stream/reveal";
import { toast } from "@utsukta/spa-core/store/toast";
import { fetchPubstream, type PubstreamMeta } from "./api";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { buildThreadTree } from "@utsukta/spa-core/lib/thread";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { renderBody } from "@utsukta/spa-core/lib/renderBody";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { storageGet, storageSet } from "@utsukta/spa-core/lib/storage";
import type { ViewMode } from "@/shared/stream/types";
import { createSyncSignal } from "@utsukta/spa-core/lib/syncSignal";

// ── Constants ──────────────────────────────────────────────────────────────
const PAGE_LIMIT = 20;
const MAX_POSTS  = 200;

// ── Module-level singleton state ───────────────────────────────────────────
const [posts,    setPosts]    = createSyncSignal<Post[]>([]);
// Reconciled by mid, not a signal — see createStreamStore: rebuildThreads()
// makes every node a fresh object, and <For> keys by reference, so as a
// signal each like remounted every card on the page.
const [threadState, setThreadState] = createStore<{ list: ThreadNode[] }>({ list: [] });
// What the view renders: the confirmed threads plus reactions in flight —
// same shape as createStreamStore's (see `optimistic` below).
const [view, setView] = createRoot(() =>
  createOptimisticStore(() => deep(threadState.list), [] as ThreadNode[], { key: "mid" }));
const threads = () => view;
const setThreads = (next: ThreadNode[]) =>
  setThreadState((s) => { reconcile(next, "mid")(s.list); });
const [loading,  setLoading]  = createSignal(false);
const [hasMore,  setHasMore]  = createSignal(true);
const [page,     setPage]     = createSignal(1);
const [error,    setError]    = createSignal<string | null>(null);
const [disabled, setDisabled] = createSignal(false);
const [meta,     setMeta]     = createSignal<PubstreamMeta | null>(null);

// ── viewMode ───────────────────────────────────────────────────────────────
const [viewMode, setViewMode] = createSignal<ViewMode>("masonry");
storageGet<ViewMode>("pubstream:viewMode", "masonry").then(setViewMode);
export function changeView(v: ViewMode) {
  storageSet("pubstream:viewMode", v);
  setViewMode(v);
}

export {
  threads, loading, hasMore, page, error, disabled, meta, posts, viewMode,
};

// ── Helpers ────────────────────────────────────────────────────────────────
function processBody(raw: string, mimetype?: string): string {
  return renderBody(raw, mimetype, undefined, sanitizeHtml);
}

// Rendered once on arrival, so a like doesn't re-render every body on the page.
function processPosts(raw: Post[]): Post[] {
  return raw.map((p) => ({ ...p, body: processBody(p.body, p.mimetype) }));
}

function rebuildThreads(allPosts: Post[]): void {
  setThreads(buildThreadTree(allPosts));
}

// ── Actions ────────────────────────────────────────────────────────────────

/** Initial load (or refresh). Resets all state. */
export async function loadPubstream(tag?: string, net?: string): Promise<void> {
  if (loading()) return;
  setLoading(true);
  setError(null);

  try {
    const data = await fetchPubstream({ page: 1, limit: PAGE_LIMIT, tag, net });

    if (data === null) {
      { setDisabled(true);
        setLoading(false);
        setPosts([]);
        setThreads([]); }
      return;
    }

    const fresh = processPosts(data.posts.slice(0, MAX_POSTS));
    resetReveal();
    { setDisabled(false);
      setMeta(data.meta);
      setPage(1);
      setHasMore(data.has_more);
      setPosts(fresh);
      rebuildThreads(fresh);
      setLoading(false); }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load public stream";
    toast.error(msg);
    { setError(msg); setLoading(false); }
  }
}

/** Load the next page and append. */
export async function loadMore(tag?: string, net?: string): Promise<void> {
  if (loading() || !hasMore()) return;
  const nextPage = page() + 1;
  setLoading(true);

  try {
    const data = await fetchPubstream({ page: nextPage, limit: PAGE_LIMIT, tag, net });
    if (!data) { setLoading(false); return; }

    { setPage(nextPage);
      setHasMore(data.has_more);
      const combined = [...posts(), ...processPosts(data.posts)].slice(-MAX_POSTS);
      setPosts(combined);
      rebuildThreads(combined);
      setLoading(false); }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load more";
    toast.error(msg);
    { setError(msg); setLoading(false); }
  }
}

function findDraft(nodes: ThreadNode[], mid: string): ThreadNode | undefined {
  for (const n of nodes) {
    if (n.mid === mid || n.uuid === mid) return n;
    const found = n.children.length ? findDraft(n.children, mid) : undefined;
    if (found) return found;
  }
  return undefined;
}

/** Shows `apply` on the post at once, runs `request`, and on success writes
 *  the change into the confirmed posts; a failure rolls back on its own.
 *  `apply` must be idempotent (setReaction is). */
export const optimistic = action(function* (mid: string, apply: (n: ThreadNode) => void, request: () => Promise<unknown>) {
  setView((s) => { const n = findDraft(s, mid); if (n) apply(n); });
  try {
    yield request();
  } catch (err) {
    console.error(err);
    return;
  }
  setPosts((prev) => prev.map((p) => {
    if (p.mid !== mid && p.uuid !== mid) return p;
    const next = { ...p, children: [] } as ThreadNode;
    apply(next);
    const { children: _, ...post } = next;
    return post as Post;
  }));
  rebuildThreads(posts());
});

/** Remove a deleted post (and rebuild its thread) from the local view. */
export function removePost(mid: string): void {
  setPosts((prev) => prev.filter((p) => p.mid !== mid && p.uuid !== mid));
  rebuildThreads(posts());
}
