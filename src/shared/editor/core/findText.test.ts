// node --experimental-strip-types src/shared/editor/core/findText.test.ts
//
// Matching for find & replace: one string over the surface's text, so a phrase
// split by formatting still matches, and non-editable embeds are left out.
import assert from "node:assert";
import { createRequire } from "node:module";

const domino = createRequire(import.meta.url)("@mixmark-io/domino");
const doc = domino.createDocument("<body></body>");
(globalThis as any).document = doc;
(globalThis as any).NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };

const { textIndex, findAll } = await import("./findText.ts");

assert.deepEqual(findAll("Cat cat CAT", "cat", false), [0, 4, 8]);
assert.deepEqual(findAll("Cat cat CAT", "cat", true), [4]);
assert.deepEqual(findAll("aaaa", "aa", false), [0, 2], "non-overlapping");
assert.deepEqual(findAll("abc", "", false), []);

const root = doc.createElement("div");
root.innerHTML = 'hello <b>wor</b>ld <div contenteditable="false">world inside embed</div> world';
const { text, segs } = textIndex(root);
assert.equal(text, "hello world  world", "embed text skipped");
assert.equal(segs.length, 4);
assert.deepEqual(findAll(text, "hello world", false), [0], "matches across <b>");
assert.equal(findAll(text, "world", false).length, 2);

console.log("findText: ok");
