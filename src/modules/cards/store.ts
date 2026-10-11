// src/modules/cards/store.ts
import { createSignal } from "solid-js";
import { createStreamStore } from "@/shared/stream/store/createStreamStore";
import { fetchCards } from "./api";
import type { StreamResult, StreamParams } from "@/shared/stream/store/createStreamStore";

export interface CardParams extends StreamParams {
  search?: string;
  tag?: string;
  cat?: string;
  dbegin?: string;
  dend?: string;
  deck?: string;
}

// ── nick signal ───────────────────────────────────────────────────────────────
const [nick, setNick] = createSignal("");
export { nick };

// ── fetcher adapter ───────────────────────────────────────────────────────────
async function cardsFetcher(params: CardParams): Promise<StreamResult> {
  const res = await fetchCards(nick(), params);
  return {
    items: res.cards,
    rootCount: res.meta.root_count,
    limit: res.meta.limit,
    nouveau: false,
  };
}

// ── store instance ────────────────────────────────────────────────────────────
const store = createStreamStore<CardParams>(cardsFetcher);
export const {
  posts, loading, loadingMore, hasMore, newPosts, profileUid,
  loadMore, flushNewPosts, stopPolling,
} = store;

export function resetPosts() { store.reset(); }
export async function loadCards(nickname: string, params?: CardParams) {
  setNick(nickname);
  return store.load(params);
}
