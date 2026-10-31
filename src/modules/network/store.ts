// src/modules/network/store.ts
import { createSignal } from "solid-js";
import { storageGet, storageSet } from "@utsukta/spa-core/lib/storage";
import { createStreamStore } from "@/shared/stream/store/createStreamStore";
import { fetchNetworkStream } from "./api";
import type { NetworkParams } from "./api";
import { createActionHandlers } from "@/shared/stream/store/actions-store";
import type { ViewMode } from "@/shared/stream/types";
import { RANKED_ORDERS } from "@/shared/stream/filters/ranked";
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";

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
  // A ranked order remembered from before Advanced Sorting was turned off.
  if (!order || (RANKED_ORDERS.includes(order) && !isFeatureEnabled("spa_advanced_sort"))) return {};
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

// The params the shown stream was loaded with. The URL is the source of truth:
// NetworkContentWidget reloads when it changes, and the filter controls also
// apply by hand (search has to, it's debounced) — this key keeps the two from
// fetching the same stream twice.
let loadedKey: string | undefined;

export function resetPosts() { loadedKey = undefined; store.reset(); }
export function loadedNetworkParams(): NetworkParams | undefined {
  return loadedKey === undefined ? undefined : JSON.parse(loadedKey);
}
export function applyNetwork(params: NetworkParams) {
  const key = JSON.stringify(params);
  if (key === loadedKey) return;
  store.reset();
  loadedKey = key;
  return store.load(params);
}

// ── actions ───────────────────────────────────────────────────────────────────
export const {
  handleLike, handleDislike, handleRepeat,
  handleStar, handleDelete, handleEdit,
  handleComment, loadComments, loadMoreComments, handleRefresh,
} = createActionHandlers(store);
