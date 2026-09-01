// src/modules/pubstream/store.ts
import { createSignal, batch } from "solid-js";
import { toast } from "@utsukta/spa-core/store/toast";
import { fetchPubstream, type PubstreamMeta } from "./api";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { buildThreadTree } from "@utsukta/spa-core/lib/thread";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { renderBody } from "@utsukta/spa-core/lib/renderBody";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { storageGet, storageSet } from "@utsukta/spa-core/lib/storage";
import type { ViewMode } from "@/shared/stream/types";

// ── Constants ──────────────────────────────────────────────────────────────
const PAGE_LIMIT = 20;
const MAX_POSTS  = 200;

// ── Module-level singleton state ───────────────────────────────────────────
const [posts,    setPosts]    = createSignal<Post[]>([]);
const [threads,  setThreads]  = createSignal<ThreadNode[]>([]);
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

function rebuildThreads(allPosts: Post[]): void {
  const processed = allPosts.map((p) => ({ ...p, body: processBody(p.body, p.mimetype) }));
  setThreads(buildThreadTree(processed));
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
      batch(() => {
        setDisabled(true);
        setLoading(false);
        setPosts([]);
        setThreads([]);
      });
      return;
    }

    batch(() => {
      setDisabled(false);
      setMeta(data.meta);
      setPage(1);
      setHasMore(data.has_more);
      setPosts(data.posts.slice(0, MAX_POSTS));
      rebuildThreads(data.posts.slice(0, MAX_POSTS));
      setLoading(false);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load public stream";
    toast.error(msg);
    batch(() => { setError(msg); setLoading(false); });
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

    batch(() => {
      setPage(nextPage);
      setHasMore(data.has_more);
      const combined = [...posts(), ...data.posts].slice(-MAX_POSTS);
      setPosts(combined);
      rebuildThreads(combined);
      setLoading(false);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load more";
    toast.error(msg);
    batch(() => { setError(msg); setLoading(false); });
  }
}

/** Optimistically update like count. */
export function optimisticLike(mid: string): void {
  setPosts((prev) =>
    prev.map((p) => {
      if (p.mid !== mid) return p;
      const liked = !p.viewerLiked;
      return {
        ...p,
        viewerLiked: liked,
        likeCount: p.likeCount + (liked ? 1 : -1),
      };
    }),
  );
  rebuildThreads(posts());
}

/** Optimistically update repeat count. */
export function optimisticRepeat(mid: string): void {
  setPosts((prev) =>
    prev.map((p) => {
      if (p.mid !== mid) return p;
      const repeated = !p.viewerRepeated;
      return {
        ...p,
        viewerRepeated: repeated,
        repeatCount: p.repeatCount + (repeated ? 1 : -1),
      };
    }),
  );
  rebuildThreads(posts());
}

/** Remove a deleted post (and rebuild its thread) from the local view. */
export function removePost(mid: string): void {
  setPosts((prev) => prev.filter((p) => p.mid !== mid && p.uuid !== mid));
  rebuildThreads(posts());
}
