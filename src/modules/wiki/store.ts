// src/modules/wiki/store.ts
import { createSignal, untrack } from "solid-js";
import {
  fetchWikis,
  fetchWikiPages,
  fetchWikiPage,
  fetchPageHistory,
  fetchPageRevision,
  type WikiMeta,
  type WikiPage,
  type WikiPageResponse,
  type PageHistoryEntry,
} from "./api";

// ── Wiki list ─────────────────────────────────────────────────────────────────

const [wikis, setWikis]               = createSignal<WikiMeta[]>([]);
const [wikisLoading, setWikisLoading] = createSignal(false);
const [isOwner, setIsOwner]           = createSignal(false);
const [canCreate, setCanCreate]       = createSignal(false);
const [wikisNick, setWikisNick]       = createSignal("");
const [wikisError, setWikisError]     = createSignal<string>("");

export { wikis, wikisLoading, isOwner, canCreate, wikisError };

export async function loadWikis(nick: string): Promise<void> {
  // Guard reads, not dependencies: callers run this from effects.
  if (untrack(() => wikisNick() === nick && wikis().length > 0)) return;
  setWikisNick(nick);
  setWikisLoading(true);
  setWikisError("");
  try {
    const res = await fetchWikis(nick);
    setWikis(res.wikis);
    setIsOwner(res.is_owner);
    setCanCreate(res.can_create);
  } catch (e: any) {
    const msg: string = e?.message ?? "";
    setWikisError(msg.includes("403") ? "permission" : "error");
    setWikis([]);
  } finally {
    setWikisLoading(false);
  }
}

export function resetWikis(): void {
  setWikisNick("");
  setWikis([]);
  setIsOwner(false);
  setCanCreate(false);
  setWikisError("");
}

export function patchWiki(urlName: string, patch: Partial<import("./api").WikiMeta>): void {
  setWikis((prev) => prev.map((w) => w.url_name === urlName ? { ...w, ...patch } : w));
}

// ── Page list ─────────────────────────────────────────────────────────────────

const [pages, setPages]               = createSignal<WikiPage[]>([]);
const [pagesLoading, setPagesLoading] = createSignal(false);
const [currentWiki, setCurrentWiki]   = createSignal<WikiMeta | null>(null);
const [canWrite, setCanWrite]         = createSignal(false);

export { pages, pagesLoading, currentWiki, canWrite };

export async function loadWikiPages(nick: string, wikiUrlName: string): Promise<void> {
  setPagesLoading(true);
  try {
    const res = await fetchWikiPages(nick, wikiUrlName);
    setCurrentWiki(res.wiki);
    setPages(res.pages);
    setCanWrite(res.can_write);
  } catch (e) {
    console.error("loadWikiPages:", e);
    setPages([]);
    setCurrentWiki(null);
  } finally {
    setPagesLoading(false);
  }
}

// ── Current page ──────────────────────────────────────────────────────────────

const [pageData, setPageData]         = createSignal<WikiPageResponse | null>(null);
const [pageLoading, setPageLoading]   = createSignal(false);
const [pageNotFound, setPageNotFound] = createSignal(false);
const [editMode, setEditMode]         = createSignal(false);
const [draftContent, setDraftContent] = createSignal("");
const [draftCommitMsg, setDraftCommitMsg] = createSignal("");

export { pageData, pageLoading, pageNotFound, editMode, draftContent, draftCommitMsg };

export function toggleEditMode(): void {
  const entering = !editMode();
  setEditMode(entering);
  if (entering) {
    setDraftContent(pageData()?.raw ?? "");
    setDraftCommitMsg("");
  }
}

export function updateDraft(v: string): void {
  setDraftContent(v);
}

// Restores a saved draft (from the HQ DraftsWidget) straight into edit mode,
// bypassing toggleEditMode()'s default of seeding from the live page content.
export function enterEditModeWithContent(content: string, commitMsg = ""): void {
  setDraftContent(content);
  setDraftCommitMsg(commitMsg);
  setEditMode(true);
}

export async function loadPage(
  nick: string,
  wikiUrlName: string,
  pageUrlName: string,
): Promise<void> {
  setPageLoading(true);
  setEditMode(false);
  setPageNotFound(false);
  try {
    const res = await fetchWikiPage(nick, wikiUrlName, pageUrlName);
    setPageData(res);
    setDraftContent(res.raw);
    setCanWrite(res.can_write);
  } catch (e: any) {
    const msg: string = e?.message ?? "";
    if (msg.includes("404")) {
      setPageNotFound(true);
    }
    setPageData(null);
  } finally {
    setPageLoading(false);
  }
}

export function resetPage(): void {
  setPageData(null);
  setEditMode(false);
  setDraftContent("");
  setPageNotFound(false);
  clearHistory();
}

// ── Page history ──────────────────────────────────────────────────────────────

const [historyData, setHistoryData]       = createSignal<PageHistoryEntry[]>([]);
const [historyLoading, setHistoryLoading] = createSignal(false);
const [showHistory, setShowHistory]       = createSignal(false);

export { historyData, historyLoading, showHistory };

export function toggleHistory(): void {
  setShowHistory((v) => !v);
}

export function clearHistory(): void {
  setHistoryData([]);
  setShowHistory(false);
}

export async function loadHistory(
  nick: string,
  wikiUrlName: string,
  pageUrlName: string,
): Promise<void> {
  setHistoryLoading(true);
  try {
    const res = await fetchPageHistory(nick, wikiUrlName, pageUrlName);
    setHistoryData(res.history ?? []);
  } catch (e) {
    console.error("loadHistory:", e);
    setHistoryData([]);
  } finally {
    setHistoryLoading(false);
  }
}

// ── Revision preview ──────────────────────────────────────────────────────────

const [previewRevision, setPreviewRevision]   = createSignal<number | null>(null);
const [previewHtml, setPreviewHtml]           = createSignal<string>("");
const [previewLoading, setPreviewLoading]     = createSignal(false);

export { previewRevision, previewHtml, previewLoading };

export function closePreview(): void {
  setPreviewRevision(null);
  setPreviewHtml("");
}

export async function loadRevisionPreview(
  nick: string,
  wikiUrlName: string,
  pageUrlName: string,
  revision: number,
): Promise<void> {
  setPreviewRevision(revision);
  setPreviewLoading(true);
  try {
    const res = await fetchPageRevision(nick, wikiUrlName, pageUrlName, revision);
    setPreviewHtml(res.html);
  } catch (e) {
    console.error("loadRevisionPreview:", e);
    setPreviewHtml("");
  } finally {
    setPreviewLoading(false);
  }
}
