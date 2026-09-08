/**
 * elementBBCode.ts
 *
 * The element → bbcode conversions that BOTH serializers have to agree on.
 *
 * bbcode is what Hubzilla actually stores and federates; markdown is an
 * optional input layer that is converted to bbcode on save. So every construct
 * markdown cannot spell — colour, highlight, font, size, underline, spoiler,
 * centre, media, lettered lists, sized images — has to come back as bbcode from
 * htmlToSource (bbcode mode) *and* from markdownTurndown (markdown mode).
 *
 * Those were two hand-written mirrors, and they drifted: the markdown side
 * dropped styling entirely, wrote `alt='…'` where core only reads
 * `alt=&quot;…&quot;`, and neither side read a highlight's colour back off a
 * <mark>. One implementation instead — the caller supplies the already
 * serialized children, which is the only thing the two paths do differently.
 *
 * Deliberately free of app imports and of DOM globals beyond the Element
 * methods, so the markdown round trip stays testable in bare node against
 * turndown's own DOM.
 */

/** Reads one declaration out of an inline style attribute. */
export function getStyle(el: Element, prop: string): string {
  const style = el.getAttribute("style") ?? "";
  const m = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i"));
  return m ? m[1].trim() : "";
}

const px = (el: Element, prop: string) =>
  parseInt(getStyle(el, prop) || el.getAttribute(prop) || "", 10);

/**
 * bbcode alt attribute, in the ONLY double-quoted form core understands:
 * bb_imgoptions() (include/bbcode.php) reads alt='…' or alt=&quot;…&quot; and
 * silently drops a raw alt="…". Mirrors insertHelpers.bbAlt(), which this
 * module can't import without dragging the app tree into turndown.
 */
function bbAlt(alt: string): string {
  const clean = alt.replace(/[[\]]/g, "").replace(/&quot;|"/g, "'").replace(/\s+/g, " ").trim();
  return `alt=&quot;${clean}&quot;`;
}

// execCommand's legacy 1-7 scale, the same vocabulary SIZE_OPTIONS offers.
const FONT_SIZES: Record<string, string> = {
  "1": "xx-small", "2": "small", "3": "medium",
  "4": "large", "5": "x-large", "6": "xx-large", "7": "xx-large",
};

/**
 * The toolbar's four appearance pickers, from a <span style>, a <mark> or a
 * legacy <font> (which is what execCommand emits with styleWithCSS off).
 *
 * Returns null when the element carries none of them, so the caller falls
 * through to its own handling — a <span> is otherwise transparent.
 */
export function styleBBCode(el: Element, content: string): string | null {
  const tag = el.tagName?.toLowerCase();
  if (tag !== "span" && tag !== "font" && tag !== "mark") return null;

  const bg = getStyle(el, "background-color");
  const size = getStyle(el, "font-size") || FONT_SIZES[el.getAttribute("size") ?? ""];
  const family = getStyle(el, "font-family") || el.getAttribute("face");
  const color = getStyle(el, "color") || el.getAttribute("color");

  let out = content;
  // A <mark> is a highlight even with no colour on it — that is what it means.
  if (bg && bg !== "transparent") out = `[mark=${bg}]${out}[/mark]`;
  else if (tag === "mark") out = `[mark]${out}[/mark]`;
  if (size) out = `[size=${size}]${out}[/size]`;
  if (family) out = `[font=${family}]${out}[/font]`;
  if (color) out = `[color=${color}]${out}[/color]`;

  return out === content ? null : out;
}

/**
 * An <img>, as [img]/[zmg] — or as its own :shortname: when it is an emoji
 * chip (see sourceToHtml's emojify pass).
 *
 * class="zrl" marks an image that came from [zmg] (a hub-hosted photo) and has
 * to go back out as [zmg]: the class is what carries magic-auth to the remote
 * hub, so a private photo stops loading for remote viewers without it.
 */
export function imgBBCode(el: Element): string {
  if (el.classList.contains("emoji")) return el.getAttribute("alt") ?? "";

  const src = el.getAttribute("src") ?? "";
  const tag = el.classList.contains("zrl") ? "zmg" : "img";
  // "Image/photo" is the default alt bbcodeToHtml stamps on images that had
  // none — writing it back would grow every round trip.
  const alt0 = el.getAttribute("alt") ?? "";
  const alt = alt0 === "Image/photo" ? "" : alt0;

  // Core bbcode.php (bb_imgoptions) format: [img width='400']url[/img], px
  // units, single-quoted. Width alone keeps the aspect ratio; height is only
  // carried through when it was already in the source.
  const attrs: string[] = [];
  if (px(el, "width") > 0) attrs.push(`width='${px(el, "width")}'`);
  if (px(el, "height") > 0) attrs.push(`height='${px(el, "height")}'`);
  // Marks a LaTeX-equation image (see LatexComposerModal.tsx) so it keeps
  // rendering inline (not Tailwind preflight's block default) after a round
  // trip through this editor — preserved, not just stamped once on insert.
  if (el.classList.contains("bb-latex-img")) attrs.push("class='bb-latex-img'");
  if (alt) attrs.push(bbAlt(alt));

  return attrs.length ? `[${tag} ${attrs.join(" ")}]${src}[/${tag}]` : `[${tag}]${src}[/${tag}]`;
}

/** <video>/<audio> — inserted as real elements so the surface can play them. */
export function mediaBBCode(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const src = el.getAttribute("src") ?? "";
  return `[${tag}]${src}[/${tag}]`;
}

/**
 * The [list=…] marker for an <ol>. bbcode.ts's sourceToHtml stamps
 * [list=a]/[list=A]/[list=i]/[list=I] as list-style-type (its listloweralpha /
 * upperalpha / lowerroman / upperroman classes) — read it back the same way so
 * a lettered or roman list round-trips instead of collapsing to [list=1].
 */
export function listMarker(el: Element): string {
  const type = getStyle(el, "list-style-type");
  return type === "lower-alpha" ? "a"
    : type === "upper-alpha" ? "A"
    : type === "lower-roman" ? "i"
    : type === "upper-roman" ? "I"
    : "1";
}

/**
 * The opening tag for a <details>, which bbcode.ts renders both [open] and
 * [spoiler] into (told apart by class). The default summary is generated, not
 * authored, so it must not come back as an explicit =title.
 */
export function spoilerOpen(el: Element): string {
  const tag = el.classList.contains("bb-open") ? "open" : "spoiler";
  const text = el.querySelector("summary")?.textContent?.trim() ?? "";
  const label = text === "Spoiler" || text === "Click to open/close" ? "" : text;
  return label ? `[${tag}=${label}]` : `[${tag}]`;
}

/**
 * The author of a quote, from the "<span class="bb-quote">X wrote:</span>"
 * label the toolbar puts in front of a named blockquote. It is a sibling, not
 * a wrapper — <blockquote> can't carry the attribution itself — so both
 * serializers read it off previousElementSibling and drop the span.
 */
export function quoteAuthor(el: Element): string {
  const prev = el.previousElementSibling;
  if (!prev || !prev.classList.contains("bb-quote")) return "";
  return (prev.textContent ?? "").replace(/\s*wrote:\s*$/i, "").trim();
}

/** True for the label span quoteAuthor() consumed, which must not be emitted. */
export function isQuoteLabel(el: Element): boolean {
  return (
    el.classList.contains("bb-quote") &&
    el.nextElementSibling?.tagName?.toLowerCase() === "blockquote"
  );
}
