/**
 * useMention.ts
 * Shared @-mention autocomplete hook for any text input surface.
 *
 * Works with both:
 *   - contenteditable (WYSIWYG) via Selection API
 *   - plain <textarea> via selectionStart
 *
 * The connections resource is created at module level so it is fetched once
 * and shared across every PostComposer + CommentComposer on the page — no
 * duplicate network requests.
 */

import { createSignal, createMemo, createEffect, on } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchConnections, type AclConnection } from "@/modules/network/api";
import { mentionQueryAt, mentionTag } from "./mentionTag";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MentionEntry {
  nick: string;
  name: string;
  /** Full federated address, e.g. "alice@example.com" */
  addr: string;
  photo?: string;
}

// Minimum query length before we search the server — avoids firing a
// request (and showing a popup) on every single keystroke.
const MENTION_MIN_CHARS = 3;
const MENTION_DEBOUNCE_MS = 250;

function toMentionEntry(c: AclConnection): MentionEntry {
  return {
    nick: c.nick ?? "",
    name: c.name,
    // Core's /acl sets `link` to xchan_addr, falling back to xchan_url when
    // the xchan has no addr (Acl.php:352). Pass it through verbatim: both
    // spellings are what handle_tag()'s braced-mention branch matches on
    // (xchan_addr OR xchan_url). Stripping the URL down to its host produced
    // a mention of the *hub* for addr-less AP actors, which resolves to
    // nothing.
    addr: c.link || c.nick || "",
    photo: c.photo,
  };
}

// ── Caret utilities ───────────────────────────────────────────────────────────

/**
 * Returns the pixel rect of the current caret for popup anchoring.
 * Works inside a contenteditable; falls back to the container element.
 */
export function getCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rects = range.getClientRects();
  if (rects.length) return rects[0];
  return (sel.focusNode?.parentElement?.getBoundingClientRect()) ?? null;
}

/**
 * Extracts the @-query fragment at the caret inside a contenteditable.
 * Returns null if the cursor is not actively inside an @-mention.
 */
export function getWysiwygMentionQuery(): string | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  return mentionQueryAt((node.textContent ?? "").slice(0, range.startOffset));
}

/**
 * Same logic for a plain <textarea>, using selectionStart.
 */
export function getTextareaMentionQuery(ta: HTMLTextAreaElement): string | null {
  return mentionQueryAt(ta.value.slice(0, ta.selectionStart));
}

export { mentionQueryAt, mentionTag };

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface MentionState {
  /** null = popup closed; string (possibly empty) = popup open, filtering by this */
  query: () => string | null;
  rect:  () => DOMRect | null;
  activeIdx: () => number;
  filtered: () => MentionEntry[];
  open: () => boolean;

  /** Call from a contenteditable onInput handler */
  onWysiwygInput: () => void;
  /** Call from a textarea onInput handler */
  onTextareaInput: (ta: HTMLTextAreaElement) => void;
  /**
   * Call from the keydown handler.
   * Returns true if the event was consumed (caller should return early).
   */
  onKeyDown: (e: KeyboardEvent) => boolean;

  /** Insert the selected entry via the contenteditable Selection API */
  insertWysiwyg: (entry: MentionEntry, syncBody: () => void) => void;
  /** Insert the selected entry into a plain textarea */
  insertTextarea: (
    entry: MentionEntry,
    ta: HTMLTextAreaElement,
    setBody: (v: string) => void,
  ) => void;

  /** Directly set query + anchor rect (for controlled inputs where we observe
   *  the body signal rather than a DOM input event) */
  openWithQuery: (q: string, rect: DOMRect) => void;
  close: () => void;
}

export function useMention(): MentionState {
  const [query, setQuery]       = createSignal<string | null>(null);
  const [rect, setRect]         = createSignal<DOMRect | null>(null);
  const [activeIdx, setActiveIdx] = createSignal(0);

  // Debounce the raw query into a search term — only fires once the user
  // has typed at least MENTION_MIN_CHARS, so we never poll the full
  // connections list.
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  let debounceTimer: number | undefined;
  createEffect(on(query, (q) => {
    window.clearTimeout(debounceTimer);
    const trimmed = (q ?? "").trim();
    if (trimmed.length < MENTION_MIN_CHARS) {
      setDebouncedQuery("");
      return;
    }
    debounceTimer = window.setTimeout(() => setDebouncedQuery(trimmed), MENTION_DEBOUNCE_MS);
  }));

  const [searchResult] = createQueryResource(
    "mention-search",
    () => debouncedQuery() || false,
    (q) => fetchConnections({ search: q, type: "c", count: 8 }),
  );

  const filtered = createMemo<MentionEntry[]>(() =>
    (searchResult() ?? [])
      .filter((c) => c.type === "c" && c.nick)
      .map(toMentionEntry),
  );

  const open = () =>
    query() !== null &&
    (query() ?? "").trim().length >= MENTION_MIN_CHARS &&
    filtered().length > 0;

  function close() {
    setQuery(null);
    setRect(null);
    setActiveIdx(0);
  }

  function onWysiwygInput() {
    const q = getWysiwygMentionQuery();
    if (q !== null) {
      setQuery(q);
      setActiveIdx(0);
      const r = getCaretRect();
      if (r) setRect(r);
    } else {
      close();
    }
  }

  function onTextareaInput(ta: HTMLTextAreaElement) {
    const q = getTextareaMentionQuery(ta);
    if (q !== null) {
      setQuery(q);
      setActiveIdx(0);
      // Anchor to the textarea itself — best we can do without a virtual caret
      setRect(ta.getBoundingClientRect());
    } else {
      close();
    }
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (!open()) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered().length - 1));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      // Caller must still call its own action (e.g. submit on Enter) only
      // when we return false. We consume the event here.
      e.preventDefault();
      return true; // caller should call insertWysiwyg / insertTextarea
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return true;
    }
    return false;
  }

  function insertWysiwyg(entry: MentionEntry, syncBody: () => void) {
    const tag = mentionTag(entry);
    const sel = window.getSelection();
    const q = query() ?? "";
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.setStart(
        range.startContainer,
        Math.max(0, range.startOffset - q.length - 1),
      );
      range.deleteContents();
      const textNode = document.createTextNode(tag + "\u00A0");
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // Caller provides the sync callback (htmlToBb → setBody)
    setTimeout(syncBody, 0);
    close();
  }

  function insertTextarea(
    entry: MentionEntry,
    ta: HTMLTextAreaElement,
    setBody: (v: string) => void,
  ) {
    const tag = mentionTag(entry);
    const cursor = ta.selectionStart;
    const before = ta.value.slice(0, cursor);
    const atIdx = before.length - (mentionQueryAt(before)?.length ?? 0) - 1;
    const newVal =
      ta.value.slice(0, atIdx) + tag + " " + ta.value.slice(cursor);
    setBody(newVal);
    requestAnimationFrame(() => {
      const pos = atIdx + tag.length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
    close();
  }

  function openWithQuery(q: string, r: DOMRect) {
    setQuery(q);
    setRect(r);
    // Only reset index when the query prefix changes to avoid jumping
    // while the user is still typing within the same mention.
  }

  return {
    query,
    rect,
    activeIdx,
    filtered,
    open,
    onWysiwygInput,
    onTextareaInput,
    onKeyDown,
    insertWysiwyg,
    insertTextarea,
    openWithQuery,
    close,
  };
}
