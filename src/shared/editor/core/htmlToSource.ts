import type { MimeType } from "../types/editor.types";
import {
  getStyle, styleBBCode, imgBBCode, mediaBBCode, listMarker, spoilerOpen,
  quoteAuthor, isQuoteLabel,
} from "./elementBBCode";
import { htmlToMarkdown } from "./markdownTurndown";

/** Convert WYSIWYG HTML to the chosen source format. */
export function htmlToSource(html: string, mimetype: MimeType): string {
  const clean = unwrapLatexEmbeds(html);
  if (mimetype === "text/html") return clean;
  // The configured service restores protected bbcode verbatim and serializes
  // tables — a bare TurndownService destroys both. See markdownTurndown.ts.
  if (mimetype === "text/markdown") return htmlToMarkdown(clean);
  return htmlToBBCode(clean);
}

// Rendered KaTeX chips (see hydrateLatexEmbeds in sourceToHtml.ts) can't be
// serialized by walking their children — katex.renderToString()'s internal
// markup isn't invertible. Swap each chip back for its original $…$ / $$…$$
// source text before any format-specific conversion runs.
const ZWSP = "\u200B";

function unwrapLatexEmbeds(html: string): string {
  if (!html.includes("data-latex-raw")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.body.querySelectorAll<HTMLElement>("[data-latex-raw]").forEach((el) => {
    const raw = decodeURIComponent(el.getAttribute("data-latex-raw") ?? "");
    // Strip the zero-width caret anchors sourceToHtml placed on either side.
    const prev = el.previousSibling;
    if (prev?.nodeType === Node.TEXT_NODE && prev.textContent?.endsWith(ZWSP)) {
      prev.textContent = prev.textContent.slice(0, -1);
    }
    const next = el.nextSibling;
    if (next?.nodeType === Node.TEXT_NODE && next.textContent?.startsWith(ZWSP)) {
      next.textContent = next.textContent.slice(1);
    }
    el.replaceWith(document.createTextNode(raw));
  });
  return doc.body.innerHTML;
}

function htmlToBBCode(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return nodeTobbcode(doc.body).trim();
}

// Block-level tags, for the line-joining rule in joinChildren(). Everything
// else is inline and simply concatenates.
//
// li/tr/th/td are absent on purpose: their parent's case walks them directly
// and supplies its own separators.
const BLOCK_TAGS =
  /^(?:div|p|h[1-6]|blockquote|pre|ul|ol|dl|table|hr|details|center)$/;

const isBrNode = (n: Node) =>
  n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName.toLowerCase() === "br";

const isBlockNode = (n: Node | undefined) =>
  n?.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.test((n as Element).tagName.toLowerCase());

/**
 * Serialize an element's children, giving every block child its own line.
 *
 * Contenteditable produces wildly different shapes for the same document —
 * Chrome wraps lines in <div>s (and often leaves the *first* line unwrapped),
 * Firefox separates them with <br>. Appending "\n" after each block, as this
 * used to, got both wrong: "a<div>b</div>" lost the break entirely (the two
 * lines merged), while an empty line — "<div><br></div>", the shape Chrome
 * emits for a blank line — produced two newlines, one from the <br> and one
 * from the block, so every blank line the user typed came back doubled.
 *
 * Instead: consecutive inline children form one line, each block child is one
 * line, and the lines are joined with a single "\n". A block's own trailing
 * <br> is filler the browser adds to keep an empty block visible, so it is
 * dropped rather than counted as a second break.
 */
function joinChildren(el: Element): string {
  const nodes = Array.from(el.childNodes);
  if ((nodes[nodes.length - 1] as Element | undefined)?.tagName?.toLowerCase() === "br") nodes.pop();

  const lines: string[] = [];
  let inline = "";
  for (const [i, child] of nodes.entries()) {
    // A <br> against a block is the line's terminator, not a blank line — the
    // block boundary is already the break, and Chrome writes exactly this
    // shape when you turn a line into a heading below an unwrapped first line.
    // An authored blank line there is <br class="bb-blank"> (bbcodeToHtml's
    // newline pass marks it), which is the only way to tell the two apart:
    // the HTML is otherwise identical, and counting the plain one grew a blank
    // line above the block on every Enter.
    if (
      isBrNode(child) &&
      !(child as Element).classList?.contains("bb-blank") &&
      (isBlockNode(nodes[i - 1]) || isBlockNode(nodes[i + 1]))
    ) continue;
    if (isBlockNode(child)) {
      if (inline !== "") { lines.push(inline); inline = ""; }
      lines.push(nodeTobbcode(child));
    } else {
      inline += nodeTobbcode(child);
    }
  }
  if (inline !== "") lines.push(inline);
  return lines.join("\n");
}

// Direct <li> children only — a nested list's items belong to that list, and
// its own case picks them up. Filtering el.children rather than a
// ":scope > li" query keeps this working outside a browser (the test's DOM
// shim has no :scope support) and is the same walk either way.
const listItems = (el: Element) =>
  Array.from(el.children)
    .filter((c) => c.tagName.toLowerCase() === "li")
    .map((li) => `[*]${nodeTobbcode(li)}`)
    .join("\n");

const DL_TERM_CLASSES: [string, string][] = [
  ["b", "dl-terms-bold"],
  ["i", "dl-terms-italic"],
  ["u", "dl-terms-underline"],
  ["l", "dl-terms-large"],
  ["m", "dl-terms-monospace"],
  ["h", "dl-horizontal"],
];

function nodeTobbcode(node: Node): string {
  // Zero-width spaces are caret anchors around share chips (sourceToHtml) —
  // keep them out of the stored bbcode.
  if (node.nodeType === Node.TEXT_NODE)
    return (node.textContent ?? "").replace(/\u200B/g, "");

  const el = node as Element;

  // Share chips emitted by sourceToHtml — map straight back to their bbcode
  if (el.getAttribute) {
    const shareId = el.getAttribute("data-share-id");
    if (shareId) return `[share=${shareId}][/share]`;
    const shareRaw = el.getAttribute("data-share-raw");
    if (shareRaw) return decodeURIComponent(shareRaw);
    // Raw bbcode embeds ([zvideo]/[zaudio], see sourceToHtml) — verbatim.
    const bbRaw = el.getAttribute("data-bb-raw");
    if (bbRaw) return decodeURIComponent(bbRaw);
    // Compact card chips — a stored card embed is a share block, handled above.
    const cardId = el.getAttribute("data-card-id");
    if (cardId) return `[card=${cardId}][/card]`;
    // The [crypt] decrypt button (bbcode.ts's makeCryptHtml) — read the
    // payload straight back into bbcode, ignoring any child content, so a
    // WYSIWYG blur/save (onEditorBlur/onEditorInput in RichEditor.tsx) can
    // never replace the real ciphertext with the button's own placeholder
    // text ("🔒 Encrypted content"), which is what nodeTobbcode's generic
    // `default: children()` fallback would otherwise do.
    const cryptPayload = el.getAttribute("data-crypt-payload");
    if (cryptPayload !== null) return `[crypt]${cryptPayload}[/crypt]`;
  }

  const children = () => joinChildren(el);
  const tag = el.tagName?.toLowerCase();

  switch (tag) {
    case "b":
    case "strong":      return `[b]${children()}[/b]`;
    case "i":
    case "em":          return `[i]${children()}[/i]`;
    case "u":           return `[u]${children()}[/u]`;
    case "sub":         return `[sub]${children()}[/sub]`;
    case "sup":         return `[sup]${children()}[/sup]`;
    case "s":
    case "strike":
    case "del":         return `[s]${children()}[/s]`;
    case "code":        return `[code]${children()}[/code]`;
    case "pre":         return `[code]${el.textContent ?? ""}[/code]`;
    case "blockquote": {
      // A named quote is "<span class="bb-quote">X wrote:</span><blockquote>" —
      // the attribution can't live on the element itself.
      const author = quoteAuthor(el);
      return author ? `[quote=${author}]${children()}[/quote]` : `[quote]${children()}[/quote]`;
    }
    case "h1":          return `[h1]${children()}[/h1]`;
    case "h2":          return `[h2]${children()}[/h2]`;
    case "h3":          return `[h3]${children()}[/h3]`;
    case "h4":          return `[h4]${children()}[/h4]`;
    case "h5":          return `[h5]${children()}[/h5]`;
    case "h6":          return `[h6]${children()}[/h6]`;

    // <p> and <div> are the same thing here: one line of the document, which
    // joinChildren() has already separated from its siblings.
    case "p":
    case "div": {
      // [footer] renders as this div (bbcode.ts); without the class check the
      // generic div handling below would drop the tag on the first round trip.
      if (el.classList?.contains("wall-item-footer"))
        return `[footer]${children()}[/footer]`;
      const align = getStyle(el, "text-align");
      const inner = children();
      return align === "center" ? `[center]${inner}[/center]` : inner;
    }

    case "br":  return "\n";
    case "hr":  return "[hr]";

    case "center": return `[center]${children()}[/center]`;

    case "a": {
      const href = el.getAttribute("href") ?? "";
      // …and the matching zrl link wrapper around a photo (see the img case).
      const tag = el.classList.contains("zrl") ? "zrl" : "url";
      return `[${tag}=${href}]${children()}[/${tag}]`;
    }

    case "img": return imgBBCode(el);

    case "video":
    case "audio": return mediaBBCode(el);

    case "ul": {
      // [checklist] renders as a <ul class="checklist"> of disabled
      // checkboxes (bbcode.ts bbChecklist); the plain [list] case below would
      // swallow both the class and the checked state.
      if (el.classList?.contains("checklist")) {
        const items = Array.from(el.children)
          .filter((c) => c.tagName.toLowerCase() === "li")
          .map((li) => {
            const box = li.querySelector("input");
            return `${box?.hasAttribute("checked") ? "[x]" : "[]"}${nodeTobbcode(li)}`;
          })
          .join("\n");
        return `[checklist]\n${items}\n[/checklist]`;
      }
      const items = listItems(el);
      return `[list]\n${items}\n[/list]`;
    }
    case "ol": {
      const items = listItems(el);
      return `[list=${listMarker(el)}]\n${items}\n[/list]`;
    }
    case "li":  return children();

    // [dl terms="..."] — the term styles ride in the <dl>'s classes
    // (bbcode.ts bbDl), so they have to be read back off it.
    case "dl": {
      const terms = DL_TERM_CLASSES
        .filter(([, cls]) => el.classList?.contains(cls))
        .map(([letter]) => letter)
        .join("");
      const body = Array.from(el.children)
        .map((c) => {
          const t = c.tagName.toLowerCase();
          if (t === "dt") return `\n[*=${nodeTobbcode(c)}]`;
          return t === "dd" ? nodeTobbcode(c) : "";
        })
        .join("");
      return `[dl${terms ? ` terms="${terms}"` : ""}]${body}\n[/dl]`;
    }

    case "table": {
      const rows = Array.from(el.querySelectorAll("tr"));
      const rowsStr = rows.map(row => {
        const cells = Array.from(row.children).map(cell => {
          const ct = cell.tagName.toLowerCase() === "th" ? "th" : "td";
          return `[${ct}]${nodeTobbcode(cell)}[/${ct}]`;
        }).join("");
        return `[tr]${cells}[/tr]`;
      }).join("\n");
      return `[table]\n${rowsStr}\n[/table]`;
    }
    // tr/th/td handled inside "table" above; fall through to children() for orphans
    case "tr":
    case "th":
    case "td":  return children();

    case "details": {
      // <summary> serializes to "" (case below), so children() drops it for us
      // while still giving the body's block children their own lines.
      //
      // bbSpoilerTag() (bbcode.ts) wraps a spoiler's body in a <blockquote>
      // purely as presentation. Serializing that as an authored [quote] made
      // the tag pile up on every WYSIWYG round trip — the same failure the
      // summary label hit, see the comment above bbSpoilerTag().
      const wrapper = Array.from(el.children).find(
        (c) => c.tagName.toLowerCase() === "blockquote",
      );
      const bodyParts = wrapper && el.children.length === 2 ? joinChildren(wrapper) : children();
      const open = spoilerOpen(el);
      return `${open}${bodyParts}[/${open.slice(1).replace(/[=\]].*$/, "")}]`;
    }
    case "summary": return "";

    // <font> is what execCommand emits with styleWithCSS off (and <mark> what
    // the highlight button leaves behind) — both are the same four pickers.
    case "font":
    case "mark": return styleBBCode(el, children()) ?? children();

    case "span": {
      // The label in front of a named blockquote is consumed by that
      // blockquote's own case — emitting it too would duplicate the author.
      if (isQuoteLabel(el)) return "";
      return styleBBCode(el, children()) ?? children();
    }

    case "body": return children();
    default:     return children();
  }
}
