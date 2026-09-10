// node --experimental-strip-types src/modules/bookmarks/candidates.test.ts
import assert from "node:assert";

const { linkCandidates, injectBookmarkButtons } = await import("./candidates.ts");

// How bbcode.ts renders #^[url=…] — the marked link keeps its plain anchor plus a
// sibling marker span, so it is indistinguishable from an ordinary link in the
// body. The marked set therefore has to come from the terms, not the HTML.
const marked = [{ url: "https://hub.example/doc", title: "The doc" }];
const body = `
  <span class="bookmark-identifier">#^</span><a class="bookmark" href="https://hub.example/doc">The doc</a>
  <a href="https://example.com/article">Some article</a>
  <a class="zrl" href="https://hub.example/search?tag=solid">#solid</a>
  <a class="zrl" href="https://hub.example/channel/bob">@Bob</a>
  <a href="mailto:x@example.com">mail me</a>
  <a href="/cloud/sk/file.pdf">local file</a>
  <a href="https://example.com/img"><img src="x.png"> &amp;  spaced  label </a>
`;

const c = linkCandidates(body, marked);
const urls = c.map((x) => x.url);

// Marked links come first and are flagged, so the UI can pre-select them.
assert.deepStrictEqual(c[0], { url: "https://hub.example/doc", title: "The doc", marked: true });

// The plain link core would never offer is offered here, unmarked.
assert.deepStrictEqual(c[1], { url: "https://example.com/article", title: "Some article", marked: false });

// Hashtags and mentions render as links too; offering them would bury the real ones.
assert(!urls.includes("https://hub.example/search?tag=solid"));
assert(!urls.includes("https://hub.example/channel/bob"));

// Only http(s): mailto/relative hrefs are not bookmarkable URLs.
assert(!urls.some((u) => u.startsWith("mailto:")));
assert(!urls.includes("/cloud/sk/file.pdf"));

// Anchor text is flattened to a usable title.
assert.strictEqual(c.find((x) => x.url === "https://example.com/img")!.title, "& spaced label");

// The marked link appears once, not twice, even though it is also in the body.
assert.strictEqual(urls.filter((u) => u === "https://hub.example/doc").length, 1);

// No links at all is an empty list, not a throw.
assert.deepStrictEqual(linkCandidates("<p>nothing here</p>"), []);

// An &-bearing query string renders as &amp; but the server checks the URL against
// the stored bbcode body, which holds a plain & — so the href must be decoded.
assert.strictEqual(
  linkCandidates('<a href="https://x.example/p?a=1&amp;b=2">Two params</a>')[0].url,
  "https://x.example/p?a=1&b=2");

// An anchor with no text falls back to its URL rather than an empty title.
assert.strictEqual(linkCandidates('<a href="https://a.example/x"></a>')[0].title,
  "https://a.example/x");

// Single-quoted href (sanitisers emit either form).
assert.strictEqual(linkCandidates("<a href='https://b.example/y'>Y</a>")[0].url,
  "https://b.example/y");

// ── injectBookmarkButtons ───────────────────────────────────────────────────

const html = injectBookmarkButtons(body, c, "Bookmark this link");

// One button per bookmarkable link, and none for the tag, mention, mailto or
// relative links that linkCandidates() already excluded.
assert.strictEqual(html.match(/class="bm-add"/g)!.length, c.length);
assert.strictEqual(c.length, 3);

// The button goes immediately *before* its link, not after.
assert.match(html, /<button[^>]*data-bm-url="https:\/\/example\.com\/article"[^>]*>.*?<\/button><a href="https:\/\/example\.com\/article">/s);

// The anchor keeps its .bookmark class, which is all that marks it in running
// text now that renderBody() strips the literal #^ before display.
assert(html.includes('<a class="bookmark" href="https://hub.example/doc">'));

// The excluded links are untouched, buttons and all.
assert(html.includes('<a class="zrl" href="https://hub.example/search?tag=solid">#solid</a>'));
assert(html.includes('<a href="mailto:x@example.com">mail me</a>'));

// A URL with an & must survive into the attribute as a valid entity, and come
// back out of dataset.bmUrl decoded — so it still matches the stored body.
const amp = injectBookmarkButtons(
  '<a href="https://x.example/p?a=1&amp;b=2">Two</a>',
  linkCandidates('<a href="https://x.example/p?a=1&amp;b=2">Two</a>'),
  "Save");
assert(amp.includes('data-bm-url="https://x.example/p?a=1&amp;b=2"'));

// A quote in the label can't break out of the attribute it is written into.
const quoted = injectBookmarkButtons(
  '<a href="https://q.example/">Q</a>',
  linkCandidates('<a href="https://q.example/">Q</a>'),
  'He said "hi" <b>');
assert(!quoted.includes('title="He said "'));
assert(quoted.includes("&quot;hi&quot;"));
assert(!quoted.includes("<b>"));

// Nothing to offer: the body comes back byte-identical, so a post with no
// bookmarkable link renders exactly as before.
assert.strictEqual(injectBookmarkButtons(body, [], "Save"), body);

console.log("bookmarks/candidates: ok");
