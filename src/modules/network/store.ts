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
