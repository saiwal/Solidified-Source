/**
 * Markdown-style shortcuts on the WYSIWYG surface, word-processor fashion:
 * "- " at the start of a line becomes a bullet list, "## " a heading, and
 * closing **bold** turns it bold. Settings → Features → Editor
 * `spa_autoformat` switches it off.
 *
 * Each conversion lands as its own undo step after the literal characters
 * (RichEditor flushes the typed text first), so Ctrl+Z straight after one
 * gives back exactly what was typed.
 */

import { escapeHtml } from "../lib/linkMeta";

export type BlockFormat =
  | { cmd: "insertUnorderedList" | "insertOrderedList" | "checklist" }
  | { cmd: "formatBlock"; value: "h1" | "h2" | "h3" | "blockquote" | "pre" };

/** A line's text (up to the caret, which just typed a space) → its block format. */
export function blockTrigger(line: string): BlockFormat | null {
  switch (line) {
    case "- ": case "* ": return { cmd: "insertUnorderedList" };
    case "1. ": return { cmd: "insertOrderedList" };
    case "[] ": case "[ ] ": return { cmd: "checklist" };
    case "# ": return { cmd: "formatBlock", value: "h1" };
    case "## ": return { cmd: "formatBlock", value: "h2" };
    case "### ": return { cmd: "formatBlock", value: "h3" };
    case "> ": return { cmd: "formatBlock", value: "blockquote" };
    case "``` ": return { cmd: "formatBlock", value: "pre" };
  }
  return null;
}

// Opening marker after start/space/punctuation, never inside a word — so
// 2*3*4 and snake_case stay literal — and no space just inside either marker.
const INLINE: [RegExp, string][] = [
  [/(^|[^\w*])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, "b"],
  [/(^|[^\w~])~~([^~\s](?:[^~]*[^~\s])?)~~$/, "s"],
  [/(^|[^\w*])\*([^*\s](?:[^*]*[^*\s])?)\*$/, "i"],
  [/(^|[^\w`])`([^`]+)`$/, "code"],
];

/** Text before the caret ending in a closed mark → what to wrap, and where it starts. */
export function inlineTrigger(before: string): { tag: string; start: number; inner: string } | null {
  for (const [re, tag] of INLINE) {
    const m = re.exec(before);
    if (m) return { tag, start: m.index + m[1].length, inner: m[2] };
  }
  return null;
}

const ZWSP = "\u200B";
/** Never format inside these: code is literal, embeds aren't text. */
const NO_INLINE = "pre, code, .bb-share-embed, .bb-card-embed-wrap, [contenteditable=false]";
/** Block shortcuts additionally stay out of blocks that already are one. */
const NO_BLOCK = `${NO_INLINE}, li, table, blockquote, h1, h2, h3, h4, h5, h6`;

/** The text from the start of the caret's line to the caret. */
export function lineBefore(surface: HTMLElement, r: Range): string {
  const el = r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : (r.startContainer as Element);
  const found = el?.closest("p, div");
  const block = found && surface.contains(found) ? found : surface;
  const pre = document.createRange();
  pre.setStart(block, 0);
  pre.setEnd(r.startContainer, r.startOffset);
  // A bare-text surface separates lines with <br> or with sibling blocks
  // (Chrome wraps every line after the first in a <div>); only what follows
  // the last of those is this line.
  let text = "";
  for (const n of Array.from(pre.cloneContents().childNodes)) {
    text = /^(BR|P|DIV)$/.test(n.nodeName) ? "" : text + (n.textContent ?? "");
  }
  return text.replace(/\u200B/g, "");
}

/** Select `n` characters back from the caret, so execCommand("delete") eats the marker. */
function selectBack(n: number) {
  const sel = window.getSelection()!;
  for (let i = 0; i < n; i++) sel.modify("extend", "backward", "character");
}

/**
 * After a typed character: convert a just-completed shortcut. Returns true
 * when it did. `beforeChange` runs first, so the literal text is recorded.
 */
export function autoFormatTyped(surface: HTMLElement, data: string | null, beforeChange: () => void): boolean {
  const sel = window.getSelection();
  if (!data || !sel?.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  const node = r.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !surface.contains(node)) return false;
  const parent = node.parentElement!;
  if (parent.closest(NO_INLINE)) return false;

  if (data === " " && !parent.closest(NO_BLOCK)) {
    const line = lineBefore(surface, r);
    const fmt = blockTrigger(line);
    if (fmt) {
      beforeChange();
      selectBack(line.length);
      document.execCommand("delete");
      if (fmt.cmd === "formatBlock") document.execCommand("formatBlock", false, fmt.value);
      else if (fmt.cmd === "checklist") insertChecklist(surface);
      else document.execCommand(fmt.cmd);
      return true;
    }
  }

  if (!"*~`".includes(data)) return false;
  const before = (node.textContent ?? "").slice(0, r.startOffset);
  const hit = inlineTrigger(before);
  if (!hit) return false;
  beforeChange();
  const range = document.createRange();
  range.setStart(node, hit.start);
  range.setEnd(node, r.startOffset);
  sel.removeAllRanges();
  sel.addRange(range);
  // The trailing anchor puts the caret back outside the mark, so the next
  // character typed isn't bold too.
  document.execCommand("insertHTML", false, `<${hit.tag}>${escapeHtml(hit.inner)}</${hit.tag}>${ZWSP}`);
  return true;
}

/** An empty checklist (bbcode.ts bbChecklist's markup) with the caret in its item. */
export function insertChecklist(surface: HTMLElement) {
  document.execCommand(
    "insertHTML", false,
    '<ul class="checklist" style="list-style-type: none;"><li data-hz-new><input type="checkbox"> <br></li></ul>',
  );
  const li = surface.querySelector("li[data-hz-new]");
  if (!li) return;
  li.removeAttribute("data-hz-new");
  const r = document.createRange();
  r.selectNodeContents(li);
  r.collapse(false);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
}

/** Enter on a line reading exactly "---": a horizontal rule instead of a new line. */
export function autoFormatRule(surface: HTMLElement, beforeChange: () => void): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  if (!surface.contains(r.startContainer)) return false;
  const el = r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : (r.startContainer as Element);
  if (el?.closest(NO_BLOCK) || lineBefore(surface, r) !== "---") return false;
  // Only at the end of the line: "---|text" is a typing situation, not a rule.
  if (r.startContainer.nodeType === Node.TEXT_NODE && r.startOffset < (r.startContainer.textContent ?? "").length) return false;
  beforeChange();
  selectBack(3);
  document.execCommand("insertHTML", false, `<hr>${ZWSP}`);
  return true;
}
