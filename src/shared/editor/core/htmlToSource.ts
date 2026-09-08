import type { MimeType } from "../types/editor.types";
import { bbAlt } from "../attachments/insertHelpers";
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

function getStyle(el: Element, prop: string): string {
  const style = el.getAttribute("style") ?? "";
  const m = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i"));
  return m ? m[1].trim() : "";
}

// Block-level tags, for the line-joining rule in joinChildren(). Everything
// else is inline and simply concatenates.
//
// li/tr/th/td are absent on purpose: their parent's case walks them directly
// and supplies its own separators.
const BLOCK_TAGS =
  /^(?:div|p|h[1-6]|blockquote|pre|ul|ol|table|hr|details|center)$/;

const isBlockNode = (n: Node | undefined) =>
  n?.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.test((n as Element).tagName.toLowerCase());

const isBrNode = (n: Node) =>
  n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName.toLowerCase() === "br";

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
    // A <br> touching a block is that block's own line break, not content.
    // bbcodeToHtml turns "a\n[hr]\nb" into "a<br><hr><br>b", so counting
    // those <br>s as newlines too gave back "a\n\n[hr]\n\nb" — which
    // renders as two <br>s next time, and grew by a line on every blur.
    if (isBrNode(child) && (isBlockNode(nodes[i - 1]) || isBlockNode(nodes[i + 1]))) continue;
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
    case "s":
    case "strike":
    case "del":         return `[s]${children()}[/s]`;
    case "mark":        return `[mark]${children()}[/mark]`;
    case "code":        return `[code]${children()}[/code]`;
    case "pre":         return `[code]${el.textContent ?? ""}[/code]`;
    case "blockquote":  return `[quote]${children()}[/quote]`;
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

    case "img": {
      // Emoji images (see sourceToHtml.ts's emojify() pass) round-trip back
      // to their plain :shortname: text, not an [img] bbcode tag.
      if (el.classList.contains("emoji")) return el.getAttribute("alt") ?? "";

      const src = el.getAttribute("src") ?? "";
      // class="zrl" marks an image that came from [zmg] (a hub-hosted photo).
      // It has to go back out as [zmg], not [img]: the zrl class is what
      // carries magic-auth to the remote hub, so a private photo would stop
      // loading for remote viewers after one WYSIWYG round-trip.
      const tag = el.classList.contains("zrl") ? "zmg" : "img";
      // "Image/photo" is the default alt bbcodeToHtml stamps on images that
      // had none — writing it back would grow every round-trip.
      const alt0 = el.getAttribute("alt") ?? "";
      const alt = alt0 === "Image/photo" ? "" : alt0;
      // Core bbcode.php (bb_imgoptions) format: [img width='400']url[/img],
      // px units, single-quoted. Width alone keeps the aspect ratio; height
      // is only carried through when it was already in the source.
      const width = parseInt(getStyle(el, "width") || el.getAttribute("width") || "", 10);
      const height = parseInt(getStyle(el, "height") || el.getAttribute("height") || "", 10);
      const attrs: string[] = [];
      if (width > 0) attrs.push(`width='${width}'`);
      if (height > 0) attrs.push(`height='${height}'`);
      // Marks a LaTeX-equation image (see LatexComposerModal.tsx) so it keeps
      // rendering inline (not Tailwind preflight's block default) after a
      // round-trip through this editor — must be preserved, not just
      // stamped once on insert.
      if (el.classList.contains("bb-latex-img")) attrs.push(`class='bb-latex-img'`);
      if (alt) attrs.push(bbAlt(alt));
      return attrs.length ? `[${tag} ${attrs.join(" ")}]${src}[/${tag}]` : `[${tag}]${src}[/${tag}]`;
    }

    case "video": {
      const src = el.getAttribute("src") ?? "";
      return `[video]${src}[/video]`;
    }

    case "audio": {
      const src = el.getAttribute("src") ?? "";
      return `[audio]${src}[/audio]`;
    }

    case "ul": {
      const items = listItems(el);
      return `[list]\n${items}\n[/list]`;
    }
    case "ol": {
      const items = listItems(el);
      // bbcode.ts's sourceToHtml stamps [list=a]/[list=A]/[list=i]/[list=I]
      // as list-style-type on the <ol> (see its listloweralpha/upperalpha/
      // lowerroman/upperroman classes) — read it back the same way so a
      // lettered/roman list round-trips instead of collapsing to [list=1].
      const styleType = getStyle(el, "list-style-type");
      const marker =
        styleType === "lower-alpha" ? "a" :
        styleType === "upper-alpha" ? "A" :
        styleType === "lower-roman" ? "i" :
        styleType === "upper-roman" ? "I" :
        "1";
      return `[list=${marker}]\n${items}\n[/list]`;
    }
    case "li":  return children();

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
      // bbcode.ts renders [open] and [spoiler] both as <details>, told apart
      // by class; the default summary is generated, not authored, so it must
      // not come back as an explicit =title.
      const tag = el.classList.contains("bb-open") ? "open" : "spoiler";
      const text = el.querySelector("summary")?.textContent?.trim() ?? "";
      const summary = text === "Spoiler" || text === "Click to open/close" ? "" : text;
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
      return summary
        ? `[${tag}=${summary}]${bodyParts}[/${tag}]`
        : `[${tag}]${bodyParts}[/${tag}]`;
    }
    case "summary": return "";

    // <font> produced by older execCommand paths (non-Chrome)
    case "font": {
      let result = children();
      const size = el.getAttribute("size");
      const face = el.getAttribute("face");
      const color = el.getAttribute("color");
      if (size) {
        const sizeMap: Record<string, string> = {
          "1": "xx-small", "2": "small", "3": "medium",
          "4": "large",    "5": "x-large","6": "xx-large", "7": "xx-large",
        };
        result = `[size=${sizeMap[size] ?? "medium"}]${result}[/size]`;
      }
      if (face) result = `[font=${face}]${result}[/font]`;
      if (color) result = `[color=${color}]${result}[/color]`;
      return result;
    }

    // <span style="color:…; font-family:…; font-size:…; background-color:…">
    case "span": {
      let result = children();
      const bgColor = getStyle(el, "background-color");
      const fontSize = getStyle(el, "font-size");
      const fontFamily = getStyle(el, "font-family");
      const color = getStyle(el, "color");
      if (bgColor && bgColor !== "transparent") result = `[mark=${bgColor}]${result}[/mark]`;
      if (fontSize) result = `[size=${fontSize}]${result}[/size]`;
      if (fontFamily) result = `[font=${fontFamily}]${result}[/font]`;
      if (color) result = `[color=${color}]${result}[/color]`;
      return result;
    }

    case "body": return children();
    default:     return children();
  }
}
