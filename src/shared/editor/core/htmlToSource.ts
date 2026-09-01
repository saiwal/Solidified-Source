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

  const children = () => Array.from(el.childNodes).map(nodeTobbcode).join("");
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
    case "h1":          return `[h1]${children()}[/h1]\n`;
    case "h2":          return `[h2]${children()}[/h2]\n`;
    case "h3":          return `[h3]${children()}[/h3]\n`;
    case "h4":          return `[h4]${children()}[/h4]\n`;
    case "h5":          return `[h5]${children()}[/h5]\n`;
    case "h6":          return `[h6]${children()}[/h6]\n`;

    case "p": {
      const align = getStyle(el, "text-align");
      const inner = children();
      return align === "center" ? `[center]${inner}[/center]\n` : `${inner}\n`;
    }

    case "br":  return "\n";
    case "hr":  return "\n[hr]\n";

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
      const items = Array.from(el.querySelectorAll(":scope > li"))
        .map(li => `[*]${nodeTobbcode(li)}`)
        .join("\n");
      return `[list]\n${items}\n[/list]\n`;
    }
    case "ol": {
      const items = Array.from(el.querySelectorAll(":scope > li"))
        .map(li => `[*]${nodeTobbcode(li)}`)
        .join("\n");
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
      return `[list=${marker}]\n${items}\n[/list]\n`;
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
      return `[table]\n${rowsStr}\n[/table]\n`;
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
      const bodyParts = Array.from(el.childNodes)
        .filter(n => (n as Element).tagName?.toLowerCase() !== "summary")
        .map(nodeTobbcode)
        .join("");
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

    case "div": {
      const align = getStyle(el, "text-align");
      const result = children();
      return align === "center" ? `[center]${result}[/center]\n` : `${result}\n`;
    }

    case "body": return children();
    default:     return children();
  }
}
