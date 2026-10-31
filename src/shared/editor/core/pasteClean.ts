/**
 * Clipboard HTML → the structural subset the composer actually means.
 *
 * Left to itself, a paste lands every inline style of its source in the
 * surface, and elementBBCode's styleBBCode faithfully turns each one into
 * [color=rgb(…)][font=Arial][size=11pt] — black text that vanishes on a dark
 * theme, from a page that never meant to set a colour. So paste is rebuilt
 * from an allow-list: structure and the four basic marks survive, every
 * class/id/style and wrapper element goes.
 *
 * Styles that *are* the formatting are read first, because that is how Google
 * Docs spells it: bold is `<span style="font-weight:700">`, and the whole
 * clipboard sits in a `<b style="font-weight:normal">` that would otherwise
 * bold the entire paste.
 *
 * ponytail: Word's pseudo-lists (paragraphs with mso-list styles) arrive as
 * plain paragraphs with their bullet text dropped, not as real lists.
 */

const KEEP = new Set([
  "p", "div", "br", "b", "strong", "i", "em", "u", "s", "strike", "del", "sub", "sup",
  "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
  "table", "thead", "tbody", "tr", "td", "th", "hr", "img",
]);
/** Dropped with everything inside them. */
const DROP = new Set(["script", "style", "meta", "link", "title", "head", "template", "o:p", "svg", "button", "input", "select", "textarea"]);
const BOLD = new Set(["b", "strong", "h1", "h2", "h3", "h4", "h5", "h6", "th"]);
const SAFE_HREF = /^(https?:|mailto:)/i;
const SAFE_SRC = /^https?:/i;

/** Pasted from this editor itself: embeds and protected bbcode must survive as-is. */
export const isInternalPaste = (html: string) =>
  /data-bb-raw|bb-share-embed|bb-card-embed/.test(html);

export function cleanPastedHtml(html: string): string {
  const src = new DOMParser().parseFromString(html, "text/html");
  const out = document.createElement("div");
  for (const n of Array.from(src.body.childNodes)) clean(n, out, false);
  return out.innerHTML;
}

function clean(node: Node, into: Node, inPre: boolean): void {
  if (node.nodeType === 3) {
    // Source HTML is hard-wrapped (Word especially); outside <pre> a newline
    // is just a space, and left in it would become a line break in bbcode.
    const text = inPre ? node.textContent ?? "" : (node.textContent ?? "").replace(/\s*\n\s*/g, " ");
    if (text) into.appendChild(document.createTextNode(text));
    return;
  }
  if (node.nodeType !== 1) return; // comments, Word's conditional blocks
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const style = el.getAttribute("style") ?? "";
  if (DROP.has(tag) || /mso-list:\s*ignore/i.test(style)) return;

  let target: Node = into;
  if (KEEP.has(tag)) {
    // Docs' outer <b style="font-weight:normal"> is a wrapper, not bold.
    const notBold = (tag === "b" || tag === "strong") && /font-weight:\s*(normal|[1-5]00)\b/i.test(style);
    // A link that can't be followed safely keeps its text, unlinked.
    const badLink = tag === "a" && !SAFE_HREF.test(el.getAttribute("href") ?? "");
    if (!notBold && !badLink) {
      const copy = keepElement(el, tag);
      if (!copy) return;
      into.appendChild(copy);
      target = copy;
      if (tag === "img" || tag === "br" || tag === "hr") return;
    }
  }

  // Marks carried by style, outermost first. Skipped where the element
  // already says it (a <b>, a heading) so nothing doubles up.
  const weight = /font-weight:\s*(bold|[6-9]00)\b/i.test(style);
  const marks = [
    weight && !BOLD.has(tag) && "b",
    /font-style:\s*italic/i.test(style) && tag !== "i" && tag !== "em" && "i",
    /text-decoration[^;]*underline/i.test(style) && tag !== "u" && tag !== "a" && "u",
    /text-decoration[^;]*line-through/i.test(style) && tag !== "s" && tag !== "del" && "s",
    /vertical-align:\s*super/i.test(style) && tag !== "sup" && "sup",
    /vertical-align:\s*sub\b/i.test(style) && tag !== "sub" && "sub",
  ].filter(Boolean) as string[];
  for (const m of marks) target = target.appendChild(document.createElement(m));

  const pre = inPre || tag === "pre";
  for (const c of Array.from(el.childNodes)) clean(c, target, pre);
}

/** A bare copy of a kept element: only the attributes that mean something. */
function keepElement(el: HTMLElement, tag: string): HTMLElement | null {
  if (tag === "img") {
    const src = el.getAttribute("src") ?? "";
    if (!SAFE_SRC.test(src)) return null; // data:/file: images from Word or a screenshot
    const img = document.createElement("img");
    img.setAttribute("src", src);
    const alt = el.getAttribute("alt");
    if (alt) img.setAttribute("alt", alt);
    return img;
  }
  const copy = document.createElement(tag);
  if (tag === "a") copy.setAttribute("href", el.getAttribute("href")!);
  if (tag === "ol" && el.getAttribute("start")) copy.setAttribute("start", el.getAttribute("start")!);
  return copy;
}
