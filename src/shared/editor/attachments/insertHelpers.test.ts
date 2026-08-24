// node --experimental-strip-types src/shared/editor/attachments/insertHelpers.test.ts
//
// Alt text has to survive two parsers: this editor's WYSIWYG round-trip
// (htmlToSource → bbcodeToHtml) and core's bb_imgoptions() on the server.
// Core only reads alt='…' / alt=&quot;…&quot;, so bbAlt() emits &quot; — a
// raw alt="…" was dropped server-side and grew literal quotes on each
// round-trip here.
import assert from "node:assert";

const { bbAlt, readAlt, bbcodeToInsert, patchInsertedAlt } = await import("./insertHelpers.ts");
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

console.log("insertHelpers: ok");
