/**
 * useEmoji.ts
 * Emoji autocomplete hook — mirrors useMention but triggers on `:`.
 *
 * Trigger: `:` followed by 2+ alphanumeric/underscore/dash/plus chars,
 * no spaces, no second colon. Works with both contenteditable and textarea.
 */

import { createSignal, createMemo } from "solid-js";
import { getEmojiMap, addRecentEmoji, type EmojiEntry } from "@utsukta/spa-core/store/emoji-store";
import { getCaretRect } from "../mention/useMention";

export type { EmojiEntry };

// ── Query extraction ──────────────────────────────────────────────────────────

const VALID_SLUG = /^[a-zA-Z0-9_+\-]+$/;

function extractEmojiQuery(textBefore: string): string | null {
  const colonIdx = textBefore.lastIndexOf(":");
  if (colonIdx === -1) return null;
  const fragment = textBefore.slice(colonIdx + 1);
  if (fragment.length < 2) return null;
  if (!VALID_SLUG.test(fragment)) return null;
  return fragment;
}

export function getWysiwygEmojiQuery(): string | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const before = (node.textContent ?? "").slice(0, range.startOffset);
  return extractEmojiQuery(before);
}

export function getTextareaEmojiQuery(ta: HTMLTextAreaElement): string | null {
  return extractEmojiQuery(ta.value.slice(0, ta.selectionStart));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface EmojiState {
  query:     () => string | null;
  rect:      () => DOMRect | null;
  activeIdx: () => number;
  filtered:  () => EmojiEntry[];
  open:      () => boolean;

  onWysiwygInput:  () => void;
  onTextareaInput: (ta: HTMLTextAreaElement) => void;
  onKeyDown:       (e: KeyboardEvent) => boolean;

  insertWysiwyg:  (entry: EmojiEntry, syncBody: () => void) => void;
  insertTextarea: (entry: EmojiEntry, ta: HTMLTextAreaElement, setBody: (v: string) => void) => void;

  openWithQuery: (q: string, rect: DOMRect) => void;
  close:         () => void;
}

export function useEmoji(): EmojiState {
  const [query,     setQuery]     = createSignal<string | null>(null);
  const [rect,      setRect]      = createSignal<DOMRect | null>(null);
  const [activeIdx, setActiveIdx] = createSignal(0);

  const filtered = createMemo<EmojiEntry[]>(() => {
    const q = query();
    if (q === null) return [];
    const map = getEmojiMap();
    const lq = q.toLowerCase();
    const entries = Object.values(map);
    const starts = entries.filter(e => e.shortname.slice(1).startsWith(lq));
    const contains = entries.filter(e => !e.shortname.slice(1).startsWith(lq) && e.shortname.includes(lq));
    return [...starts, ...contains].slice(0, 8);
  });

  const open = () => query() !== null && filtered().length > 0;

  function close() {
    setQuery(null);
    setRect(null);
    setActiveIdx(0);
  }

  function onWysiwygInput() {
    const q = getWysiwygEmojiQuery();
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
    const q = getTextareaEmojiQuery(ta);
    if (q !== null) {
      setQuery(q);
      setActiveIdx(0);
      setRect(ta.getBoundingClientRect());
    } else {
      close();
    }
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (!open()) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered().length - 1));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      return true;
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return true;
    }
    return false;
  }

  function insertWysiwyg(entry: EmojiEntry, syncBody: () => void) {
    addRecentEmoji(entry.shortname);
    const sel = window.getSelection();
    const q = query() ?? "";
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // Delete the `:query` typed so far (colon + query chars)
      range.setStart(range.startContainer, Math.max(0, range.startOffset - q.length - 1));
      range.deleteContents();
      const img = document.createElement("img");
      img.src = `/${entry.filepath}`;
      img.className = "emoji";
      img.alt = entry.shortname;
      img.title = entry.shortname;
      const spaceNode = document.createTextNode(" ");
      const frag = document.createDocumentFragment();
      frag.appendChild(img);
      frag.appendChild(spaceNode);
      range.insertNode(frag);
      range.setStartAfter(spaceNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setTimeout(syncBody, 0);
    close();
  }

  function insertTextarea(entry: EmojiEntry, ta: HTMLTextAreaElement, setBody: (v: string) => void) {
    addRecentEmoji(entry.shortname);
    const tag = entry.shortname;
    const cursor = ta.selectionStart;
    const before = ta.value.slice(0, cursor);
    const colonIdx = before.lastIndexOf(":");
    const newVal = ta.value.slice(0, colonIdx) + tag + " " + ta.value.slice(cursor);
    setBody(newVal);
    requestAnimationFrame(() => {
      const pos = colonIdx + tag.length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
    close();
  }

  function openWithQuery(q: string, r: DOMRect) {
    setQuery(q);
    setRect(r);
  }

  return {
    query, rect, activeIdx, filtered, open,
    onWysiwygInput, onTextareaInput, onKeyDown,
    insertWysiwyg, insertTextarea,
    openWithQuery, close,
  };
}
