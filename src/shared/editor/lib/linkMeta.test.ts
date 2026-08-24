// node --experimental-strip-types src/shared/editor/lib/linkMeta.test.ts
//
// linkMetaToHtml (WYSIWYG tab) and linkMetaToBbcode (source tab) must agree:
// htmlToSource maps <a>/<img>/<blockquote> back to [url]/[img]/[quote], so
// inserting in one tab and switching to the other must not change the body.
import assert from "node:assert";

const { linkMetaToBbcode, linkMetaToHtml } = await import("./linkMeta.ts");

const URL_ = "https://example.org/a";
const full = { title: "On Habit", text: "A short summary.", image: "https://example.org/og.png" };

// ── full preview ─────────────────────────────────────────────────────────────
assert.equal(
  linkMetaToBbcode(URL_, full),
  "[url=https://example.org/a][img]https://example.org/og.png[/img][/url]\n" +
  "[url=https://example.org/a]On Habit[/url]\n" +
  "[quote]A short summary.[/quote]",
);

// The HTML form must use exactly the tags htmlToSource round-trips.
const html = linkMetaToHtml(URL_, full);
assert.ok(html.includes(`<a href="https://example.org/a"><img src="https://example.org/og.png" alt=""></a>`));
assert.ok(html.includes(`<a href="https://example.org/a">On Habit</a>`));
assert.ok(html.includes(`<blockquote>A short summary.</blockquote>`));

// ── degrades cleanly when the scrape fails or is partial ─────────────────────
// No meta at all → the plain link the button always produced.
assert.equal(linkMetaToBbcode(URL_, null), `[url=${URL_}]${URL_}[/url]`);
assert.equal(linkMetaToHtml(URL_, null), `<a href="${URL_}">${URL_}</a><br>`);
// Title only → no empty [img]/[quote] lines.
assert.equal(
  linkMetaToBbcode(URL_, { title: "On Habit", text: "", image: "" }),
  `[url=${URL_}]On Habit[/url]`,
);
// Missing title falls back to the URL as the label, never an empty one.
assert.equal(
  linkMetaToBbcode(URL_, { title: "", text: "Note.", image: "" }),
  `[url=${URL_}]${URL_}[/url]\n[quote]Note.[/quote]`,
);

// ── remote text is untrusted ─────────────────────────────────────────────────
// Brackets in a scraped title would close the [url] tag early.
assert.equal(
  linkMetaToBbcode(URL_, { title: "Evil[/url][b]hi", text: "", image: "" }),
  `[url=${URL_}]Evil/urlbhi[/url]`,
);
// ...and markup in one must not be injected into the contenteditable.
// The invariant is that the ONLY tags in the output are the ones we emit;
// everything scraped is escaped text. (Checking for "onerror=" would be wrong
// — it appears harmlessly inside the escaped &lt;img …&gt; run.)
const evil = linkMetaToHtml(URL_, {
  title: '<img src=x onerror=alert(1)>',
  text: '</blockquote><script>alert(1)</script>',
  image: "",
});
const stray = evil.replace(/<\/?(?:a|img|blockquote|br)\b[^>]*>/gi, "");
assert.ok(!stray.includes("<"), `unescaped markup survived: ${stray}`);
assert.ok(evil.includes("&lt;img src=x onerror=alert(1)&gt;"));
assert.ok(evil.includes("&lt;/blockquote&gt;&lt;script&gt;"));

console.log("linkMeta: all assertions passed");
