/**
 * markdownProtect.ts
 *
 * Keeps bbcode intact across a markdown WYSIWYG round trip.
 *
 * With the "Markdown" feature on, a post body is markdown but still
 * carries bbcode: AttachmentBar inserts [img]/[zmg]/[zrl], the card picker
 * inserts [card=<id>], and the submit path appends [attachment] tags. Handed
 * straight to marked → turndown, all of that is destroyed — turndown
 * backslash-escapes brackets ("[b]x[/b]" becomes "\[b\]x\[/b\]") and eats
 * [img]/[zrl] into mangled links.
 *
 * So each bbcode block is swapped for a sentinel before marked runs, then
 * re-emitted afterwards as a non-editable embed carrying its own source in a
 * data-bb-raw attribute. htmlToSource's turndown rule reads that attribute back
 * verbatim (a rule's return value bypasses turndown's escaping), so the bbcode
 * survives byte-for-byte.
 *
 * Mirrors the [share]/[card]/LaTeX protection the bbcode path already does in
 * sourceToHtml.ts — same idea, applied to every bbcode tag.
 *
 * Deliberately free of DOMPurify/bbcode/solid imports so the round trip stays
 * testable in bare node — see markdown-roundtrip.test.ts. The renderer is
 * injected for the same reason.
 */

/**
 * Tags treated as bbcode. A whitelist, never a generic `[x]…[/x]` match: a
 * markdown link is `[text](url)` and must not be mistaken for a bbcode tag.
 * Kept in sync with the tags bbcode.ts actually renders.
 */
export const BB_TAGS = [
  "b", "i", "u", "s", "hl", "mark", "code", "quote", "url", "zrl", "img", "zmg",
  "list", "table", "tr", "th", "td", "h1", "h2", "h3", "h4", "h5", "h6",
  "center", "color", "size", "font", "spoiler", "summary", "share", "card",
  "crypt", "embed", "observer", "noparse", "nobb", "pre", "map", "video",
  "audio", "attachment",
] as const;

/**
 * Tags whose rendered form is block-level. They get a <div> wrapper; everything
 * else gets a <span>, so the embed doesn't sit as a block inside a <p>.
 */
const BLOCK_TAGS = new Set([
  "quote", "list", "table", "tr", "code", "pre", "center", "share", "card",
  "video", "audio", "map", "h1", "h2", "h3", "h4", "h5", "h6",
]);

const OPEN_RE = new RegExp(`\\[(${BB_TAGS.join("|")})(?:[=\\s][^\\]]*)?\\]`, "gi");

/**
 * End offset (exclusive) of the balanced `[tag]…[/tag]` block opening at
 * `start`, or -1 if unclosed.
 *
 * Depth-aware rather than a non-greedy regex, for the same reason
 * findShareEnd() in sourceToHtml.ts is: a nested same-tag block
 * ("[quote]a [quote]b[/quote] c[/quote]") would otherwise match the first
 * closer, splitting the block and leaving a stray "[/quote]" as loose text —
 * which turndown then escapes. That is exactly the corruption this module
 * exists to prevent.
 */
function findTagEnd(s: string, start: number, tag: string): number {
  const tokRe = new RegExp(`\\[${tag}(?:[=\\s][^\\]]*)?\\]|\\[\\/${tag}\\]`, "gi");
  tokRe.lastIndex = start;
  let depth = 0;
  let t: RegExpExecArray | null;
  while ((t = tokRe.exec(s))) {
    if (t[0].toLowerCase() === `[/${tag}]`) {
      depth--;
      if (depth <= 0) return t.index + t[0].length;
    } else {
      depth++;
    }
  }
  return -1;
}

/** The sentinel marked sees. \x01 survives marked untouched, headings included. */
const sentinel = (i: number) => `\x01BB:${i}\x01`;

export interface Protected {
  /** Markdown with every bbcode block replaced by a sentinel. */
  src: string;
  /** The removed blocks, indexed by their sentinel number. */
  raws: string[];
}

/** Replace every balanced bbcode block in `md` with a sentinel. */
export function protectBbcode(md: string): Protected {
  const raws: string[] = [];
  let out = "";
  let cursor = 0;

  OPEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN_RE.exec(md))) {
    // A tag opening inside a block already claimed by an earlier match.
    if (m.index < cursor) continue;

    const tag = m[1].toLowerCase();
    const end = findTagEnd(md, m.index, tag);
    // Unclosed — leave it as literal text rather than swallowing the rest of
    // the document. Only reachable from hand-typed source, where no round trip
    // runs anyway.
    if (end < 0) continue;

    out += md.slice(cursor, m.index) + sentinel(raws.length);
    raws.push(md.slice(m.index, end));
    cursor = end;
    OPEN_RE.lastIndex = end;
  }
  out += md.slice(cursor);

  return { src: out, raws };
}

/** True when this block should be wrapped in a <div> rather than a <span>. */
export function isBlockBbcode(raw: string): boolean {
  const m = /^\[([a-z0-9]+)/i.exec(raw);
  return !!m && BLOCK_TAGS.has(m[1].toLowerCase());
}

/**
 * Swap the sentinels in marked's HTML output back for embeds.
 *
 * `renderEmbed` builds the actual element — sourceToHtml passes the real one
 * (routing compact [share=<id>]/[card=<id>] tokens through the existing
 * shareEmbed/cardEmbed helpers so hydrateShareEmbeds/hydrateCardEmbeds pick
 * them up), the round-trip test passes a stub.
 */
export function restoreBbcode(
  html: string,
  raws: string[],
  renderEmbed: (raw: string) => string,
): string {
  return html.replace(/\x01BB:(\d+)\x01/g, (_m, i: string) => {
    const raw = raws[Number(i)];
    return raw === undefined ? "" : renderEmbed(raw);
  });
}

/** Attribute-safe encoding of a bbcode block for the data-bb-raw round trip. */
export const encodeRaw = (raw: string) => encodeURIComponent(raw);

/**
 * Whether the line just finished with Enter can safely be re-rendered on its
 * own, without waiting for blur.
 *
 * Two things must hold. The construct has to be *complete* at end of line — a
 * list item, blockquote, table row or code fence all continue on the next
 * line, and rendering one in isolation would split it into separate blocks.
 * And it has to be worth doing: a plain line with no markup would re-render to
 * itself, so the DOM churn buys nothing.
 *
 * `precedingSource` is everything before this line, used only to notice an
 * unclosed ``` fence — inside one, nothing is markup and nothing is complete.
 */
export function completesMarkdownBlock(line: string, precedingSource = ""): boolean {
  if ((precedingSource.match(/^```/gm) ?? []).length % 2 === 1) return false;

  const text = line.trim();
  if (!text) return false;

  // Continues on the next line.
  if (/^([-*+]\s|\d+[.)]\s|>|\||```|:{3})/.test(text)) return false;

  // An ATX heading is complete at end of line…
  if (/^#{1,6}\s/.test(text)) return true;

  // …as is a line carrying inline markup. Paired delimiters only, so a stray
  // asterisk or underscore mid-sentence does not trigger a pointless re-render.
  return (
    /\*\*[^*]+\*\*/.test(text) ||
    /__[^_]+__/.test(text) ||
    /~~[^~]+~~/.test(text) ||
    /`[^`]+`/.test(text) ||
    /\[[^\]]*\]\([^)]*\)/.test(text) ||
    /(^|\s)\*[^*\s][^*]*\*(\s|$)/.test(text) ||
    /(^|\s)_[^_\s][^_]*_(\s|$)/.test(text)
  );
}
