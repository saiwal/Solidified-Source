// node --experimental-strip-types src/shared/editor/core/autoFormat.test.ts
//
// The trigger rules — what converts and, as importantly, what stays literal.
import assert from "node:assert";
import { registerHooks } from "node:module";
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith(".") && !/\.[a-z]+$/i.test(spec) ? next(`${spec}.ts`, ctx) : next(spec, ctx);
  },
});
const { blockTrigger, inlineTrigger } = await import("./autoFormat.ts");

assert.deepEqual(blockTrigger("- "), { cmd: "insertUnorderedList" });
assert.deepEqual(blockTrigger("* "), { cmd: "insertUnorderedList" });
assert.deepEqual(blockTrigger("1. "), { cmd: "insertOrderedList" });
assert.deepEqual(blockTrigger("## "), { cmd: "formatBlock", value: "h2" });
assert.deepEqual(blockTrigger("> "), { cmd: "formatBlock", value: "blockquote" });
assert.deepEqual(blockTrigger("``` "), { cmd: "formatBlock", value: "pre" });
assert.deepEqual(blockTrigger("[] "), { cmd: "checklist" });
assert.deepEqual(blockTrigger("[ ] "), { cmd: "checklist" });
for (const lit of ["-", " - ", "a - ", "#### ", "2. ", "#hashtag "]) assert.equal(blockTrigger(lit), null, lit);

const hit = (s: string) => inlineTrigger(s);
assert.deepEqual(hit("say **hi**"), { tag: "b", start: 4, inner: "hi" });
assert.deepEqual(hit("**two words**"), { tag: "b", start: 0, inner: "two words" });
assert.deepEqual(hit("an *em*"), { tag: "i", start: 3, inner: "em" });
assert.deepEqual(hit("(~~gone~~"), { tag: "s", start: 1, inner: "gone" });
assert.deepEqual(hit("run `npm i`"), { tag: "code", start: 4, inner: "npm i" });
// First closing * of a bold must not fire italic.
assert.equal(hit("**hi*"), null);
// Literal: maths, mid-word, spaces inside markers, empty marks.
for (const lit of ["2*3*", "a*b*", "snake*case*", "* x*", "*x *", "**", "****", "``", "x~~y~~"]) {
  assert.equal(hit(lit), null, lit);
}

console.log("autoFormat: ok");
