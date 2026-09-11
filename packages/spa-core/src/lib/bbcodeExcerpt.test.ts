// node --experimental-strip-types packages/spa-core/src/lib/bbcodeExcerpt.test.ts
import assert from "node:assert";
import { bbcodeExcerpt } from "./bbcode.ts";

const long = "https://scroll.in/article/1092016/indias-forests-real-and-imagined-forests-as-literary-political-figures-across-three-millennia";
// A link card with a thumbnail: no tag, no image URL, whatever the URL's length.
assert.equal(
  bbcodeExcerpt(`[url=${long}][img]https://x.org/og.jpg[/img][/url]\n[url=${long}]Title here[/url]`),
  "Title here",
);
assert.equal(bbcodeExcerpt("[quote=me]hi[/quote]"), "hi");
// Prose brackets are not tags.
assert.equal(bbcodeExcerpt("see [note 1] below"), "see [note 1] below");
assert.equal(bbcodeExcerpt("abcdef", 3), "abc…");
console.log("ok");
