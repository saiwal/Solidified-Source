// node --experimental-strip-types src/shared/editor/core/markup.test.ts
//
// The toolbar used to insert bbcode whatever the body's format was. Core's
// prepare_text() renders text/html untouched, text/plain through escape_tags()
// and text/markdown through MarkdownExtra alone — no bbcode pass — so the two
// invariants worth pinning are: (1) a post/comment (bbcodeFallback) still gets
// byte-identical markup to before, and (2) nothing bbcode-shaped leaks into a
// format that would render it literally.
import assert from "node:assert";

const { spell, bbcodeTokensWork, linkText } = await import("./markup.ts");

type Kind = Parameters<typeof spell>[0];
const KINDS: Kind[] = [
  "b", "i", "u", "s", "mark", "markClear", "color", "font", "size",
  "code", "codeblock", "quote", "quoteAuthor", "h", "hr",
  "url", "img", "video", "audio", "table", "spoiler",
];

const flat = (s: ReturnType<typeof spell>): string | null =>
  s === null ? null
  : "text" in s ? s.text
  : "prefix" in s ? s.prefix
  : s.open + s.close;

const at = (kind: Kind, mime: string, fb: boolean, arg = "") =>
  flat(spell(kind, mime as never, fb, arg));

// ── bbcode: exactly what the toolbar always emitted ──────────────────────────
assert.equal(at("b", "text/bbcode", false), "[b][/b]");
assert.equal(at("u", "text/bbcode", false), "[u][/u]");
assert.equal(at("mark", "text/bbcode", false, "#ff0"), "[mark=#ff0][/mark]");
assert.equal(at("h", "text/bbcode", false, "h3"), "[h3][/h3]");
assert.equal(at("hr", "text/bbcode", false), "[hr]\n");
assert.equal(at("url", "text/bbcode", false, "u"), "[url=u][/url]");
assert.equal(at("img", "text/bbcode", false, "u"), "[img]u[/img]");
assert.equal(at("spoiler", "text/bbcode", false, ""), "[spoiler][/spoiler]");
assert.equal(at("spoiler", "text/bbcode", false, "Why"), "[spoiler=Why][/spoiler]");
assert.equal(at("quoteAuthor", "text/bbcode", false, "Ann"), "[quote=Ann][/quote]");
assert.ok(at("table", "text/bbcode", false, "2x1")!.startsWith("[table border=1]\n[tr][th]Header 1"));

// ── markdown WITH the bbcode fallback (posts, comments, DMs) ─────────────────
// Markdown's own spellings, and bbcode for everything markdown cannot say —
// which is exactly what the pre-markup.ts toolbar did, so posts are unchanged.
assert.equal(at("b", "text/markdown", true), "****");
assert.equal(at("i", "text/markdown", true), "**");
assert.equal(at("s", "text/markdown", true), "~~~~");
assert.equal(at("code", "text/markdown", true), "``");
assert.equal(at("codeblock", "text/markdown", true), "```\n\n```");
assert.equal(at("quote", "text/markdown", true), "> ");
assert.equal(at("h", "text/markdown", true, "h2"), "## ");
assert.equal(at("url", "text/markdown", true, "u"), "[](u)");
assert.equal(at("img", "text/markdown", true, "u"), "![](u)");
for (const k of ["u", "mark", "markClear", "color", "font", "size", "hr", "video", "audio", "spoiler", "quoteAuthor"] as Kind[]) {
  assert.equal(at(k, "text/markdown", true, "x"), at(k, "text/bbcode", false, "x"),
    `${k}: markdown-with-fallback must match the bbcode spelling`);
}

// ── markdown WITHOUT it (articles, cards, webpages, blocks, wiki, notes) ─────
// MarkdownExtra passes raw HTML through, so the gaps fall back to HTML — and
// never to bbcode, which would render literally.
for (const k of KINDS) {
  const out = at(k, "text/markdown", false, "x");
  assert.ok(out !== null, `${k} must have a markdown spelling`);
  assert.ok(!/\[\/?[a-z]/.test(out!) || k === "url" || k === "img",
    `${k} leaked bbcode into stored markdown: ${out}`);
}
assert.equal(at("u", "text/markdown", false), "<u></u>");
assert.equal(at("color", "text/markdown", false, "red"), '<span style="color:red"></span>');
assert.equal(at("b", "text/markdown", false), "****"); // md's own still wins

// ── html ────────────────────────────────────────────────────────────────────
for (const k of KINDS) {
  const out = at(k, "text/html", false, "h1");
  assert.ok(out !== null && !/\[\/?[a-z]/.test(out), `${k} leaked bbcode into html: ${out}`);
}
assert.equal(at("b", "text/html", false), "<strong></strong>");
assert.equal(at("h", "text/html", false, "h4"), "<h4></h4>");
assert.equal(at("quoteAuthor", "text/html", false, "Ann"),
  '<span class="bb-quote">Ann wrote:</span><blockquote></blockquote>');
assert.ok(at("table", "text/html", false, "1x1")!.startsWith('<table border="1"><tr><th>'));

// ── plain: only the URL inserts survive, everything else hides ──────────────
for (const k of KINDS) {
  const out = at(k, "text/plain", true, "https://x/y.jpg");
  if (["url", "img", "video", "audio"].includes(k)) {
    assert.ok(out !== null && !/[[<]/.test(out), `${k} must be bare in plain text: ${out}`);
  } else {
    assert.equal(out, null, `${k} must hide in plain text`);
  }
}

// An empty mimetype is bbcode (item.mimetype defaults to '' — normalizeMime).
assert.equal(at("b", "", false), "[b][/b]");
assert.equal(at("b", undefined as never, false), "[b][/b]");

// ── raw bbcode tokens (latex image, [card=…], [map=…], excalidraw) ──────────
assert.equal(bbcodeTokensWork("text/bbcode" as never, false), true);
assert.equal(bbcodeTokensWork("text/markdown" as never, true), true);
assert.equal(bbcodeTokensWork("text/markdown" as never, false), false);
assert.equal(bbcodeTokensWork("text/html" as never, true), false);
assert.equal(bbcodeTokensWork("text/plain" as never, true), false);

// ── a standalone link, where there is no bbcode preview block to build ──────
assert.equal(linkText("https://x", "text/markdown" as never, false), "[https://x](https://x)");
assert.equal(linkText("https://x", "text/html" as never, false), '<a href="https://x">https://x</a>');
assert.equal(linkText("https://x", "text/plain" as never, false), "https://x");

console.log("markup.test.ts OK");
