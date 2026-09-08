// node --experimental-strip-types src/shared/editor/attachments/insertHelpers.test.ts
//
// Alt text has to survive two parsers: this editor's WYSIWYG round-trip
// (htmlToSource → bbcodeToHtml) and core's bb_imgoptions() on the server.
// Core only reads alt='…' / alt=&quot;…&quot;, so bbAlt() emits &quot; — a
// raw alt="…" was dropped server-side and grew literal quotes on each
// round-trip here.
import assert from "node:assert";

const { bbAlt, readAlt, bbcodeToInsert, patchInsertedAlt, appendInsert } = await import("./insertHelpers.ts");
const { bbcodeToHtml } = await import("@utsukta/spa-core/lib/bbcode");

const att = (altText: string) =>
  ({ id: "1", source: "upload", status: "ready", progress: 100, filename: "cat.jpg",
     isImage: true, isVideo: false, isAudio: false, insertUrl: "https://x/1.jpg", altText }) as never;

// ── quoting ──────────────────────────────────────────────────────────────────
assert.equal(bbAlt("a cat's paw"), "alt=&quot;a cat's paw&quot;");
assert.equal(bbAlt(' the "big" [dog] \n bowl '), "alt=&quot;the 'big' dog bowl&quot;");

// every quoting form parses back, including the legacy raw-quote one
assert.equal(readAlt(bbAlt("a cat")), "a cat");
assert.equal(readAlt(`width='400' alt="a cat"`), "a cat");
assert.equal(readAlt(`alt='a cat' width='400'`), "a cat");
assert.equal(readAlt("width='400'"), "");

// ── renderer agrees (no quotes leaking into the alt attribute) ────────────────
const html = bbcodeToHtml(`[img width='400' ${bbAlt("a cat")}]https://x/1.jpg[/img]`);
assert.match(html, /alt="a cat"/);
assert.match(html, /width: 400px/);

// ── conversion to the other source formats ───────────────────────────────────
const bb = `[img ${bbAlt("a cat")}]https://x/1.jpg[/img]`;
assert.equal(bbcodeToInsert(bb, "text/markdown"), "![a cat](https://x/1.jpg)");
assert.equal(bbcodeToInsert(bb, "text/html"), '<img src="https://x/1.jpg" alt="a cat" />');
assert.equal(bbcodeToInsert("[img]https://x/1.jpg[/img]", "text/markdown"), "![](https://x/1.jpg)");

// ── editing the alt after insert patches the body in place ───────────────────
// width from the resize popup must survive; only alt is swapped.
assert.equal(
  patchInsertedAlt(`hi\n[img width='400' ${bbAlt("old")}]https://x/1.jpg[/img]`, att("new"), "text/bbcode"),
  "hi\n[img width='400' alt=&quot;new&quot;]https://x/1.jpg[/img]",
);
// a body still carrying the old raw-quoted form is upgraded, not duplicated
assert.equal(
  patchInsertedAlt(`[img alt="old"]https://x/1.jpg[/img]`, att("new"), "text/bbcode"),
  "[img alt=&quot;new&quot;]https://x/1.jpg[/img]",
);
// photo form: the [zmg] label doubles as alt text
assert.equal(
  patchInsertedAlt("[zrl=https://x/p][zmg=https://x/1.jpg]cat.jpg[/zmg][/zrl]", att("new"), "text/bbcode"),
  "[zrl=https://x/p][zmg=https://x/1.jpg]new[/zmg][/zrl]",
);
// only the matching image of several is touched
assert.equal(
  patchInsertedAlt(
    `[img ${bbAlt("one")}]https://x/1.jpg[/img]\n[img ${bbAlt("two")}]https://x/2.jpg[/img]`,
    att("ONE"), "text/bbcode"),
  "[img alt=&quot;ONE&quot;]https://x/1.jpg[/img]\n[img alt=&quot;two&quot;]https://x/2.jpg[/img]",
);
// a photo that went through the WYSIWYG comes back as the [zmg <attrs>] form
assert.equal(
  patchInsertedAlt(`[zrl=https://x/p][zmg width='400' ${bbAlt("old")}]https://x/1.jpg[/zmg][/zrl]`,
    att("new"), "text/bbcode"),
  "[zrl=https://x/p][zmg width='400' alt=&quot;new&quot;]https://x/1.jpg[/zmg][/zrl]",
);
assert.equal(patchInsertedAlt("![old](https://x/1.jpg)", att("new"), "text/markdown"), "![new](https://x/1.jpg)");

// ── the code button's block markup matches the renderer ─────────────────────
// EditorToolbar's code() inserts <pre><code>…</code></pre> for a multi-line
// selection. That has to stay the exact shape bbcodeToHtml produces for a
// [code] carrying newlines, or the editor markup and a reloaded post diverge
// and the WYSIWYG round trip stops being a fixed point.
assert.equal(bbcodeToHtml("[code]a\nb[/code]"), "<pre><code>a\nb</code></pre>");
// single-line [code] is inline instead — which is why code() branches on \n
assert.match(bbcodeToHtml("x [code]y[/code]"), /<code class="inline-code">y<\/code>/);

// ── inserting never leaves a leading blank line ──────────────────────────────
// A bare "\n" separator rendered as a <br> before the image, so inserting into
// an empty composer showed a blank line above it.
assert.equal(appendInsert("", "[zmg=u]c[/zmg]"), "[zmg=u]c[/zmg]");
assert.equal(appendInsert("hi", "[zmg=u]c[/zmg]"), "hi\n[zmg=u]c[/zmg]");
assert.equal(appendInsert("hi\n", "[zmg=u]c[/zmg]"), "hi\n[zmg=u]c[/zmg]");
// a deliberate paragraph break is the user's, and is left alone
assert.equal(appendInsert("hi\n\n", "[zmg=u]c[/zmg]"), "hi\n\n[zmg=u]c[/zmg]");
// no <br> ends up before the image for an empty body
assert.doesNotMatch(bbcodeToHtml(appendInsert("", "[zmg=https://x/1]c[/zmg]")), /^<br/);

// ── [zmg=] needs an absolute URL ─────────────────────────────────────────────
// Both this renderer (bbcode.ts) and core's include/bbcode.php match
// [zmg=http…] specifically. A relative URL falls through to the generic
// [img options] handler, which reads the *label* as the src — a broken image
// that looks perfectly fine in the post source. Anything building a [zmg=]
// must therefore emit an absolute URL (addCloudFiles learned this the hard
// way; the upload and Photos paths get theirs z_root()-prefixed by core).
assert.match(
  bbcodeToHtml("[zrl=https://x/p][zmg=https://x/photo/abc-1]cat.jpg[/zmg][/zrl]"),
  /src="https:\/\/x\/photo\/abc-1"/,
);
assert.doesNotMatch(
  bbcodeToHtml("[zrl=https://x/p][zmg=/photo/abc-1]cat.jpg[/zmg][/zrl]"),
  /src="\/photo\/abc-1"/,
);

console.log("insertHelpers: ok");
