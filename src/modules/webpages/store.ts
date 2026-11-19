import { createSignal, untrack } from 'solid-js';
import { fetchWebpages, deleteWebPage, fetchBlocks, deleteBlock, type WebPage, type Block } from './api';
import { toast } from "@utsukta/spa-core/store/toast";

// Module-level singletons — survive navigation by design.
// loadWebpages() guards against redundant fetches when store is already populated
// for the same nick; pass force=true to bypass the guard (e.g. after a delete).

const [pages, setPages]   = createSignal<WebPage[]>([]);
const [loading, setLoading] = createSignal(false);
const [error, setError]   = createSignal<string | null>(null);
const [currentNick, setCurrentNick] = createSignal<string>('');

// Layout template id assigned to the webpage currently displayed by PageView
// (if any) — lets Layout.tsx resolve the right sidebar from that template
// instead of the module default. See ModuleDef.pageTemplate.
const [currentPageTemplateId, setCurrentPageTemplateId] = createSignal<string | null>(null);

// Chrome mode of the webpage currently displayed by PageView (if any),
// derived from that page's assigned template's `chrome` field — lets
// Layout.tsx hide app chrome for zen/focus/wide/compact pages. Set ONLY by
// PageView.tsx (never by the composer/template editor), so editing such a
// template still shows full chrome. See ModuleDef.pageChrome.
const [currentPageChrome, setCurrentPageChrome] =
  createSignal<"default" | "zen" | "focus" | "wide" | "compact">("default");

export {
  pages,
  loading,
  error,
  currentNick,
  currentPageTemplateId,
  setCurrentPageTemplateId,
  currentPageChrome,
  setCurrentPageChrome,
};

export async function loadWebpages(nick: string, force = false) {
  // Avoid wiping already-loaded data when navigating back to the same channel
  // Guard reads, not dependencies: callers run this from effects.
  if (!force && untrack(() => currentNick() === nick && pages().length > 0)) return;

  setCurrentNick(nick);
  setLoading(true);
  setError(null);
  try {
    setPages(await fetchWebpages(nick));
  } catch (e: any) {
    setError(e.message);
    toast.error(e.message);
  } finally {
    setLoading(false);
  }
}

export async function removePage(iid: number, nick: string) {
  const prev = pages();
  // Optimistic update
  setPages(prev.filter(p => p.iid !== iid));
  try {
    await deleteWebPage(iid, nick);
  } catch (e: any) {
    setPages(prev); // rollback on failure
    setError(e.message);
    toast.error(e.message);
  }
}

// ── Blocks — mirrors the pages state above ────────────────────────────────────

const [blocks, setBlocks] = createSignal<Block[]>([]);
const [blocksLoading, setBlocksLoading] = createSignal(false);
const [blocksNick, setBlocksNick] = createSignal<string>('');

export { blocks, blocksLoading };

export async function loadBlocks(nick: string, force = false) {
  if (!force && blocksNick() === nick && blocks().length > 0) return;

  setBlocksNick(nick);
  setBlocksLoading(true);
  try {
    setBlocks(await fetchBlocks(nick));
  } catch (e: any) {
    toast.error(e.message);
  } finally {
    setBlocksLoading(false);
  }
}

export async function removeBlock(iid: number, nick: string) {
  const prev = blocks();
  setBlocks(prev.filter(b => b.iid !== iid));
  try {
    await deleteBlock(iid, nick);
  } catch (e: any) {
    setBlocks(prev); // rollback on failure
    toast.error(e.message);
  }
}
