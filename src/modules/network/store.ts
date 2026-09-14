// src/modules/network/store.ts
import { createSignal } from "solid-js";
import { storageGet, storageSet } from "@utsukta/spa-core/lib/storage";
import { createStreamStore } from "@/shared/stream/store/createStreamStore";
import { fetchNetworkStream } from "./api";
import type { NetworkParams } from "./api";
import { createActionHandlers } from "@/shared/stream/store/actions-store";
import type { ViewMode } from "@/shared/stream/types";

// ── viewMode ──────────────────────────────────────────────────────────────────
export type { ViewMode };
const [viewMode, setViewMode] = createSignal<ViewMode>("feed");
storageGet<ViewMode>("network:viewMode", "feed").then(setViewMode);
export function changeView(v: ViewMode) {
  storageSet("network:viewMode", v);
  setViewMode(v);
}
export { viewMode };

// ── sort pref ─────────────────────────────────────────────────────────────────
// order/range are owned by the URL; this only supplies the default a bare
// /network starts from. localStorage, not storage.ts — the first stream fetch
// needs it synchronously.
export function sortPref(): { order?: string; range?: string } {
  const order = localStorage.getItem("hz-network-order") || undefined;
  if (!order) return {};
  return { order, range: localStorage.getItem("hz-network-range") || undefined };
}

export function saveSortPref(order?: string, range?: string): void {
  if (!order || order === "created") {
    localStorage.removeItem("hz-network-order");
    localStorage.removeItem("hz-network-range");
    return;
  }
  localStorage.setItem("hz-network-order", order);
  if (range) localStorage.setItem("hz-network-range", range);
  else localStorage.removeItem("hz-network-range");
}

// ── store instance ────────────────────────────────────────────────────────────
const store = createStreamStore<NetworkParams>(fetchNetworkStream);
export const {
  posts, loading, loadingMore, refreshing, hasMore, newPosts, profileUid,
  loadMore, flushNewPosts, stopPolling, softRefresh,
} = store;

export function resetPosts() { store.reset(); }
export function loadNetwork(params?: NetworkParams) { return store.load(params); }

// ── actions ───────────────────────────────────────────────────────────────────
export const {
  handleLike, handleDislike, handleRepeat,
  handleStar, handleDelete, handleEdit,
  handleComment, loadComments, loadMoreComments, handleRefresh,
} = createActionHandlers(store);
