import { normalizeMime } from "@utsukta/spa-core/lib/mimetypes";
import type { MimeType } from "../types/editor.types";

/**
 * What each toolbar button spells in each content format.
 *
 * The toolbar used to know one format — bbcode — plus a handful of `isMd()`
 * branches. That is right for posts and comments, whose Markdown body is
 * converted to bbcode on save (see docs/dev/en/markdown.md), so bbcode mixed
 * into the source survives. It is wrong everywhere the body is stored as
 * typed: core's prepare_text() renders text/html untouched, text/plain through
 * escape_tags() and text/markdown through MarkdownExtra *alone* — no bbcode
 * pass — so a `[b]` spliced into any of those three is shown literally.
 *
 * The resolution rule lives here, once:
 *
 *   bbcode    → the bbcode spelling
 *   html      → the HTML spelling
 *   markdown  → markdown's own spelling where it has one, else
 *               bbcodeFallback ? bbcode : HTML   (raw HTML passes through
 *               both marked and MarkdownExtra, so it renders either way)
 *   plain     → null, i.e. "hide this button", except the URL inserts
 *
 * `bbcodeFallback` is the "this body is converted to bbcode on save" bit —
 * EditorCapabilities.bbcodeFallback. With it on, every markdown answer here is
 * byte-identical to what the toolbar emitted before this file existed.
 *
 * Same problem and same shape as attachments/insertHelpers.ts (bbcodeToInsert),
 * which does this for attachment inserts; the HTML spellings are lifted from
 * the toolbar's own WYSIWYG branches so the two tabs keep agreeing.
 */

export type Kind =
  | "b" | "i" | "u" | "s"
  | "mark" | "markClear" | "color" | "font" | "size"
  | "code" | "codeblock"
  | "quote" | "quoteAuthor" | "h" | "hr"
  | "url" | "img" | "video" | "audio"
  | "table" | "spoiler";

export type Spelling =
  /** Wrap the selection. */
  | { open: string; close: string }
  /** Prefix every selected line (markdown's block constructs). */
  | { prefix: string }
  /** Splice in at the caret. */
  | { text: string };

type Gen = (arg: string) => Spelling;
/** `md` omitted = markdown has no spelling of its own; see the rule above. */
type Row = { bb: Gen; md?: Gen; html: Gen; plain?: Gen };

const w = (open: string, close: string): Gen => () => ({ open, close });
const tag = (name: string): Gen => () => ({ open: `<${name}>`, close: `</${name}>` });
const style = (css: string): Gen => (a) => ({ open: `<span style="${css}:${a}">`, close: "</span>" });
const bare: Gen = (a) => ({ text: a });

/** "colsxrows", clamped by the caller. */
const grid = (arg: string) => {
  const [cols, rows] = arg.split("x").map(Number);
  return { cols: cols || 2, rows: rows || 2 };
};
const cells = <T,>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));

const TABLE: Record<Kind, Row> = {
  b:    { bb: w("[b]", "[/b]"), md: w("**", "**"), html: tag("strong") },
  i:    { bb: w("[i]", "[/i]"), md: w("*", "*"),   html: tag("em") },
  // Markdown has no underline (`__x__` is bold), so this one always falls back.
  u:    { bb: w("[u]", "[/u]"), html: tag("u") },
  s:    { bb: w("[s]", "[/s]"), md: w("~~", "~~"), html: tag("s") },

  mark:      { bb: (a) => ({ open: `[mark=${a}]`, close: "[/mark]" }),
               html: (a) => ({ open: `<mark style="background-color:${a}">`, close: "</mark>" }) },
  markClear: { bb: w("[mark]", "[/mark]"), html: tag("mark") },
  color:     { bb: (a) => ({ open: `[color=${a}]`, close: "[/color]" }), html: style("color") },
  font:      { bb: (a) => ({ open: `[font=${a}]`, close: "[/font]" }), html: style("font-family") },
  size:      { bb: (a) => ({ open: `[size=${a}]`, close: "[/size]" }), html: style("font-size") },

  code:      { bb: w("[code]", "[/code]"), md: w("`", "`"), html: tag("code") },
  codeblock: { bb: w("[code]", "[/code]"), md: w("```\n", "\n```"),
               html: w("<pre><code>", "</code></pre>") },

  quote:       { bb: w("[quote]", "[/quote]"), md: () => ({ prefix: "> " }), html: tag("blockquote") },
  // Markdown's ">" carries no attribution, so a *named* quote has no markdown
  // spelling — the same split markdownTurndown's bbQuote rule makes.
  quoteAuthor: { bb: (a) => ({ open: `[quote=${a}]`, close: "[/quote]" }),
                 html: (a) => ({ open: `<span class="bb-quote">${a} wrote:</span><blockquote>`,
                                 close: "</blockquote>" }) },
  h:           { bb: (a) => ({ open: `[${a}]`, close: `[/${a}]` }),
                 md: (a) => ({ prefix: "#".repeat(Number(a[1]) || 1) + " " }),
                 html: (a) => ({ open: `<${a}>`, close: `</${a}>` }) },
  // No md spelling on purpose: turndown emits [hr] for a rule, so a markdown
  // post keeps spelling it the way its WYSIWYG tab does.
  hr:          { bb: () => ({ text: "[hr]\n" }), html: () => ({ text: "<hr>\n" }) },

  url:   { bb: (a) => ({ open: `[url=${a}]`, close: "[/url]" }),
           md: (a) => ({ open: "[", close: `](${a})` }),
           html: (a) => ({ open: `<a href="${a}">`, close: "</a>" }),
           plain: (a) => ({ open: "", close: ` ${a}` }) },
  img:   { bb: (a) => ({ text: `[img]${a}[/img]` }), md: (a) => ({ text: `![](${a})` }),
           html: (a) => ({ text: `<img src="${a}" />` }), plain: bare },
  video: { bb: (a) => ({ text: `[video]${a}[/video]` }),
           html: (a) => ({ text: `<video src="${a}" controls preload="none" style="max-width:100%"></video>` }),
           plain: bare },
  audio: { bb: (a) => ({ text: `[audio]${a}[/audio]` }),
           html: (a) => ({ text: `<audio src="${a}" controls preload="none"></audio>` }),
           plain: bare },

  table: {
    bb: (arg) => {
      const { cols, rows } = grid(arg);
      const head = "[tr]" + cells(cols, (i) => `[th]Header ${i + 1}[/th]`).join("") + "[/tr]";
      const body = cells(rows, (r) =>
        "[tr]" + cells(cols, (c) => `[td]Cell ${r + 1}-${c + 1}[/td]`).join("") + "[/tr]").join("\n");
      return { text: `[table border=1]\n${head}\n${body}\n[/table]\n` };
    },
    // GFM, which is what the WYSIWYG tab's table rule emits.
    md: (arg) => {
      const { cols, rows } = grid(arg);
      const row = (c: string[]) => `| ${c.join(" | ")} |`;
      return { text: [
        row(cells(cols, (i) => `Header ${i + 1}`)),
        row(cells(cols, () => "---")),
        ...cells(rows, (r) => row(cells(cols, (c) => `Cell ${r + 1}-${c + 1}`))),
      ].join("\n") + "\n" };
    },
    html: (arg) => {
      const { cols, rows } = grid(arg);
      const head = "<tr>" + cells(cols, (i) => `<th>Header ${i + 1}</th>`).join("") + "</tr>";
      const body = cells(rows, (r) =>
        "<tr>" + cells(cols, (c) => `<td>Cell ${r + 1}-${c + 1}</td>`).join("") + "</tr>").join("");
      return { text: `<table border="1">${head}${body}</table>\n` };
    },
  },
  spoiler: { bb: (a) => ({ open: a ? `[spoiler=${a}]` : "[spoiler]", close: "[/spoiler]" }),
             html: (a) => ({ open: `<details><summary>${a || "Spoiler"}</summary><div>`,
                             close: "</div></details>" }) },
};

/** null = this format cannot express it; the caller hides the button. */
export function spell(
  kind: Kind,
  mime: MimeType | undefined,
  bbcodeFallback: boolean,
  arg = "",
): Spelling | null {
  const row = TABLE[kind];
  switch (normalizeMime(mime)) {
    case "text/plain":    return row.plain ? row.plain(arg) : null;
    case "text/html":     return row.html(arg);
    case "text/markdown": return (row.md ?? (bbcodeFallback ? row.bb : row.html))(arg);
    default:              return row.bb(arg);
  }
}

/**
 * Whether a raw bbcode token (the LaTeX image insert, [card=…], an Excalidraw
 * [attachment], [map=…]) would still be expanded. Those have no HTML or
 * markdown spelling at all — they are bbcode features — so the buttons hide
 * rather than inserting something that renders as literal text.
 */
export const bbcodeTokensWork = (mime: MimeType | undefined, bbcodeFallback: boolean): boolean => {
  const m = normalizeMime(mime);
  return m === "text/bbcode" || (m === "text/markdown" && bbcodeFallback);
};

/**
 * A standalone link — the URL as its own label — for the formats with no
 * bbcode link-preview block to fall back on. Plain text gets the bare URL.
 */
export function linkText(url: string, mime: MimeType | undefined, bbcodeFallback: boolean): string {
  const s = spell("url", mime, bbcodeFallback, url);
  if (!s || !("open" in s)) return url;
  return s.open === "" ? url : s.open + url + s.close;
}
