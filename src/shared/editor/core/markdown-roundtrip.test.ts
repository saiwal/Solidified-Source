// node --experimental-strip-types src/shared/editor/core/markdown-roundtrip.test.ts
//
// Guards the markdown WYSIWYG round trip. RichEditor re-serializes the whole
// document through this on every keystroke, so the property that actually
// matters is idempotency: whatever the first pass produces must be a fixed
// point, or a body degrades a little more with each character typed.
//
// Imports only marked + the two dependency-free modules under test (that is
// why they are separate from sourceToHtml.ts, which pulls in DOMPurify, KaTeX,
// apiFetch and the emoji stores). The embed renderer is stubbed, but emits the
// same shape the real one does — div/span by block-ness, contenteditable=false
// and the zero-width caret anchors — so the corpus exercises the real markup.
import assert from "node:assert";
import { marked } from "marked";
import {
  protectBbcode, restoreBbcode, isBlockBbcode, encodeRaw, completesMarkdownBlock,
} from "./markdownProtect.ts";
import { htmlToMarkdown } from "./markdownTurndown.ts";

const ZWSP = "\u200B";

function toHtml(md: string): string {
  const { src, raws } = protectBbcode(md);
  return restoreBbcode(marked.parse(src, { async: false }) as string, raws, (raw) => {
    const tag = isBlockBbcode(raw) ? "div" : "span";
    return `${ZWSP}<${tag} data-bb-raw="${encodeRaw(raw)}" contenteditable="false">bb</${tag}>${ZWSP}`;
  });
}

const trip = (md: string) => htmlToMarkdown(toHtml(md)).trim();

// ── Byte-identical: input must come back exactly ──────────────────────────
// The bbcode entries are the load-bearing ones. AttachmentBar inserts
// [img]/[zmg]/[zrl], the submit path appends [attachment], the card picker
// inserts [card=<id>] — all of which turndown destroys without protection.
const STABLE: Record<string, string> = {
  "atx heading":   "## Hello",
  "h1..h3":        "# a\n\n## b\n\n### c",
  "bullet list":   "- one\n- two",
  "nested list":   "- one\n  - nested\n- two",
  "ordered list":  "1. first\n2. second",
  "emphasis":      "*em* and **strong**",
  "inline code":   "use `npm run build` now",
  "fenced code":   "```js\nconst x = 1;\n```",
  "blockquote":    "> quoted line",
  "md link":       "See [the docs](https://example.com).",
  "md image":      "![alt text](https://x.com/a.png)",
  "table":         "| a | b |\n| --- | --- |\n| 1 | 2 |",
  "table align":   "| a | b |\n| :-- | --: |\n| 1 | 2 |",
  "hr":            "---",
  "paragraphs":    "one\n\ntwo\n\nthree",
  "bb bold":       "some [b]bold[/b] text",
  "bb img":        "[img]https://x.com/a.png[/img]",
  "bb attachment": "[attachment]abc123,0[/attachment]",
  "bb zmg/zrl":    "[zrl=https://x.com/a][zmg=https://x.com/b.png]l[/zmg][/zrl]",
  "bb share":      "[share=42][/share]",
  "bb card":       "[card=7][/card]",
  "bb in list":    "- item with [b]bb[/b]\n- plain",
  "hashtag":       "Hello #hashtag there",
  "mention":       "Hi @{Some Person}",
  "md + bb mixed": "**bold** and [b]bb[/b] and #tag",
  // GFM. marked parses both; turndown ships rules for neither, so without
  // markdownTurndown's own the "~~" and the checkboxes were silently dropped.
  "strikethrough": "~~struck~~",
  "strike inline": "a ~~b~~ c",
  "task list":     "- [ ] todo\n- [x] done",
  // Depth-aware scan: a non-greedy regex would stop at the inner closer and
  // leave a stray "[/quote]" behind for turndown to escape.
  "nested quote":  "[quote]a [quote]b[/quote] c[/quote]",
};

for (const [name, md] of Object.entries(STABLE)) {
  assert.equal(trip(md), md.trim(), `${name} must round-trip byte-for-byte`);
}

// ── Known normalizations: meaning preserved, asserted so a turndown bump
//    that changes them is caught rather than discovered in a post ───────────
assert.equal(trip("Hello\n====="), "# Hello");
assert.equal(
  trip("See [the docs][1].\n\n[1]: https://example.com"),
  "See [the docs](https://example.com).",
);

// ── Idempotency — the property that matters, since this runs per keystroke ──
for (const md of [...Object.values(STABLE), "Hello\n=====", "See [x][1].\n\n[1]: https://e.com"]) {
  const once = trip(md);
  assert.equal(trip(once), once, `not a fixed point: ${JSON.stringify(md)}`);
}

// ── Unclosed bbcode is left as literal text, not swallowed to end-of-body ──
// Only reachable from hand-typed source (where no round trip runs), but it
// must never eat the rest of the document.
{
  const { src, raws } = protectBbcode("before [b]dangling and more text");
  assert.equal(raws.length, 0);
  assert.equal(src, "before [b]dangling and more text");
}

// ── A markdown link must never be mistaken for bbcode ─────────────────────
{
  const { raws } = protectBbcode("See [the docs](https://example.com) and [x][1].");
  assert.equal(raws.length, 0, "markdown link syntax must not be protected");
}

// ── Markdown typed straight into the WYSIWYG surface must take effect ─────
// Turndown escapes metacharacters by default, so "**bold**" typed as literal
// text came back as "\\*\\*bold\\*\\*" — the blur re-render never made it bold and
// the posted body showed the asterisks. markdownTurndown disables that escape.
{
  const typed = "<p>some **bold** text</p>";
  assert.equal(htmlToMarkdown(typed).trim(), "some **bold** text");
  // …and the blur pass (htmlToSource -> sourceToHtml) then renders it bold.
  assert.match(toHtml(htmlToMarkdown(typed).trim()), /<strong>bold<\/strong>/);
  // Still a fixed point, so it does not keep changing as you type.
  const once = trip("some **bold** text");
  assert.equal(trip(once), once);
}

// ── Zero-width caret anchors must never reach the source ──────────────────
// sourceToHtml pads every non-editable embed with them; turndown treats them
// as ordinary text, so without stripping they accumulate invisibly per pass.
{
  const html = `<p>a ${ZWSP}<span data-bb-raw="${encodeRaw("[b]x[/b]")}" contenteditable="false">x</span>${ZWSP} b</p>`;
  assert.equal(htmlToMarkdown(html).trim(), "a [b]x[/b] b");
}

// ── Block vs inline wrapper, so an embed is not a block inside a <p> ───────
assert.equal(isBlockBbcode("[quote]x[/quote]"), true);
assert.equal(isBlockBbcode("[share=1][/share]"), true);
assert.equal(isBlockBbcode("[b]x[/b]"), false);
assert.equal(isBlockBbcode("[img]u[/img]"), false);

// ── Render-on-Enter predicate ─────────────────────────────────────────────
// Renders a finished line as you type. Must not fire on constructs that
// continue on the next line, or the block gets split in half.
for (const yes of [
  "# Heading", "###### Six", "some **bold** here", "an __underlined__ word",
  "with ~~strike~~", "call `npm run build`", "see [docs](https://x.com)",
  "an *em* word", "an _em_ word",
]) assert.equal(completesMarkdownBlock(yes), true, `should render: ${yes}`);

for (const no of [
  "- a list item", "* a list item", "+ a list item", "1. ordered", "2) ordered",
  "> a quote", "| a | b |", "```js", "plain text with no markup", "",
  "a stray * asterisk", "snake_case_word stays put", "#nohash",
]) assert.equal(completesMarkdownBlock(no), false, `should not render: ${no}`);

// Inside an unclosed fence nothing is markup, so nothing renders.
assert.equal(completesMarkdownBlock("some **bold**", "```\n"), false);
assert.equal(completesMarkdownBlock("some **bold**", "```\ncode\n```\n"), true);

// ── Render-on-Enter DOM surgery ───────────────────────────────────────────
// RichEditor replaces only the block *above* the caret, so the caret's own
// node is never touched and there is nothing to save and restore. Guard that
// with a real DOM. domino comes in with turndown; if it ever stops being
// resolvable, skip rather than fail — the predicate above is the core logic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let domino: any = null;
try {
  // Untyped: domino ships a .d.ts that is not a module.
  domino = (await import("@mixmark-io/domino" as string)).default;
} catch {
  console.log("  (skipped DOM check: @mixmark-io/domino not resolvable)");
}

if (domino) {
  const doc = domino.createDocument("<html><body></body></html>");
  const editor = doc.createElement("div");
  editor.innerHTML = `<div>intro line</div><div>some **bold** here</div><div><br></div>`;

  const caretBlock = editor.lastElementChild!;   // the fresh block Enter created
  const done = caretBlock.previousElementSibling!;
  const line = htmlToMarkdown(done.outerHTML).trim();

  assert.equal(line, "some **bold** here");
  assert.equal(completesMarkdownBlock(line, ""), true);

  const holder = doc.createElement("div");
  holder.innerHTML = marked.parse(line, { async: false }) as string;
  done.replaceWith(...Array.from(holder.childNodes));

  assert.match(editor.innerHTML, /<strong>bold<\/strong>/);
  // The caret's node must be the very same object, not a rebuilt equivalent.
  assert.equal(editor.lastElementChild, caretBlock, "caret block must be untouched");
  // And the surgery must not change what the body serializes back to.
  assert.equal(htmlToMarkdown(editor.innerHTML).trim(), "intro line\n\nsome **bold** here");
}

console.log(`markdown-roundtrip: ok (${Object.keys(STABLE).length} byte-identical, all idempotent)`);
