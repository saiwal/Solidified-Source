/**
 * The extended-Markdown constructs marked doesn't ship
 * (https://www.markdownguide.org/cheat-sheet/): ==highlight==, ~sub~, ^sup^
 * and footnotes.
 *
 * Everything else on that cheat sheet already works end to end: tables, fenced
 * code, strikethrough, task lists and autolinks come from marked's GFM
 * defaults here and from ContentTypes::gfmToBbcode on save; footnotes,
 * definition lists and heading IDs are MarkdownExtra syntax, which the server
 * handles in markdown_to_bb() — but MarkdownExtra runs on *save*, so a
 * footnote showed up in the composer as literal "[^1]" text until posted.
 * It is rendered here, and left exactly as typed on the way back out.
 *
 * Importing this module registers them on the shared `marked` singleton —
 * side-effecting on purpose, since every caller wants the same dialect.
 * The bbcode equivalents ([mark]/[sub]/[sup], include/bbcode.php) are what the
 * server stores, so what the composer renders is what the post shows.
 */
import { marked, type TokenizerAndRendererExtension, type Tokens } from "marked";

type MarkToken = Tokens.Generic & { text: string; tokens: Tokens.Generic[] };

/**
 * `delim` is matched literally at both ends. Each pattern refuses a repeat of
 * its own delimiter at the open — "~~struck~~" has to stay strikethrough, and
 * "==" must not eat the "=" of a longer run — and the two single-character
 * marks refuse whitespace inside, or "a ^ b ^ c" in running prose turns into a
 * superscript. They also refuse brackets, so the "^" of a footnote reference
 * ("[^a][^b]" side by side) can't be read as a superscript delimiter.
 */
function inlineMark(
  name: string,
  tag: "mark" | "sub" | "sup",
  start: string,
  rule: RegExp,
): TokenizerAndRendererExtension {
  return {
    name,
    level: "inline",
    start: (src: string) => src.indexOf(start),
    tokenizer(src: string) {
      const m = rule.exec(src);
      if (!m) return undefined;
      return {
        type: name,
        raw: m[0],
        text: m[1],
        tokens: this.lexer.inlineTokens(m[1]),
      } as MarkToken;
    },
    renderer(token) {
      return `<${tag}>${this.parser.parseInline((token as MarkToken).tokens)}</${tag}>`;
    },
  };
}

/**
 * Footnotes, rendered where they were typed.
 *
 * A composer is not a page: moving the definitions to the bottom and
 * renumbering them (what MarkdownExtra does on save) would be editing the
 * author's text under them. Both halves render in place, labelled as written.
 *
 * Both are emitted as `data-bb-raw` embeds — the same non-editable carrier
 * markdownProtect uses for bbcode — so markdownTurndown's `bbraw` rule hands
 * back the source byte for byte when the surface re-serializes. Without that
 * the reference would come back as a bare "1" and the definition as its own
 * prose line, i.e. the footnote would quietly dissolve as you typed.
 */
const ZWSP = "\u200B";

/** A label as the author wrote it: "[^1]" -> "1", "[^note]" -> "note". */
const fnEmbed = (raw: string, tag: "sup" | "div", cls: string, inner: string) =>
  `${ZWSP}<${tag} class="${cls}" data-bb-raw="${encodeURIComponent(raw)}" contenteditable="false">${inner}</${tag}>${ZWSP}`;

const footnoteRef: TokenizerAndRendererExtension = {
  name: "hzFootnoteRef",
  level: "inline",
  start: (src: string) => src.indexOf("[^"),
  tokenizer(src: string) {
    // Not a definition — those start a line and are claimed by the block
    // tokenizer below; the negative lookahead keeps a stray one out of here
    // rather than rendering a reference and leaving the ":" behind.
    const m = /^\[\^([^\]\s]+)\](?!:)/.exec(src);
    if (!m) return undefined;
    return { type: "hzFootnoteRef", raw: m[0], text: m[1] };
  },
  renderer: (token) =>
    fnEmbed(token.raw, "sup", "md-fnref", escapeHtml(token.text as string)),
};

const footnoteDef: TokenizerAndRendererExtension = {
  name: "hzFootnoteDef",
  level: "block",
  start: (src: string) => src.search(/^\[\^/m),
  tokenizer(src: string) {
    // The label line plus any indented continuation lines, which is how a
    // multi-paragraph footnote is written.
    const m = /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*(?:\n(?:[ \t]+[^\n]*|[ \t]*(?=\n[ \t]+\S))?)*)/.exec(src);
    if (!m) return undefined;
    return {
      type: "hzFootnoteDef",
      raw: m[0],
      text: m[1],
      tokens: this.lexer.inlineTokens(m[2].trim()),
    } as Tokens.Generic;
  },
  renderer(token) {
    const label = escapeHtml(token.text as string);
    const body = this.parser.parseInline(token.tokens ?? []);
    return fnEmbed(token.raw, "div", "md-fndef", `<sup>${label}</sup> ${body}`);
  },
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

marked.use({
  extensions: [
    // Footnotes first: "[^a][^b]" must be claimed here, never read as a
    // superscript pair.
    footnoteDef,
    footnoteRef,
    inlineMark("hzHighlight", "mark", "==", /^==(?!=)([^\n]+?)==(?!=)/),
    inlineMark("hzSubscript", "sub", "~", /^~(?!~)([^\s~\[\]]+)~(?!~)/),
    inlineMark("hzSuperscript", "sup", "^", /^\^([^\s^\[\]]+)\^/),
  ],
});
