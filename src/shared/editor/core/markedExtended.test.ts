// node --experimental-strip-types src/shared/editor/core/markedExtended.test.ts
//
// The collisions are the whole point: ~sub~ lives inside ~~strike~~'s
// delimiter, and == inside a longer run of =. Assert both dialects survive.
import assert from "node:assert";
import { marked } from "marked";
import "./markedExtended.ts";

const md = (s: string) => marked.parseInline(s) as string;

assert.equal(md("==lit=="), "<mark>lit</mark>");
assert.equal(md("H~2~O"), "H<sub>2</sub>O");
assert.equal(md("X^2^"), "X<sup>2</sup>");

// Strikethrough must still win over subscript.
assert.equal(md("~~gone~~"), "<del>gone</del>");
assert.equal(md("~~a~~ and ~b~"), "<del>a</del> and <sub>b</sub>");

// Nested inline markup inside a mark still parses.
assert.equal(md("==**x**=="), "<mark><strong>x</strong></mark>");

// Running prose is left alone: spaces inside the single-char marks, and a
// lone delimiter, are not marks.
assert.equal(md("a ~ b ~ c"), "a ~ b ~ c");
assert.equal(md("2 ^ 3 = 8"), "2 ^ 3 = 8");
assert.equal(md("a == b"), "a == b");

console.log("markedExtended: ok");

// ── Footnotes ────────────────────────────────────────────────────────────────
// Both halves are raw-carrying embeds, so what matters is (a) they render and
// (b) the data-bb-raw round-trips the source exactly — markdownTurndown's
// bbraw rule decodes it straight back.
const block = (s: string) => marked.parse(s) as string;

const ref = md("see [^1]");
assert.match(ref, /<sup class="md-fnref" data-bb-raw="%5B%5E1%5D" contenteditable="false">1<\/sup>/);
assert.equal(decodeURIComponent(/data-bb-raw="([^"]+)"/.exec(ref)![1]), "[^1]");

const def = block("[^1]: the note");
assert.match(def, /<div class="md-fndef" data-bb-raw="[^"]+" contenteditable="false"><sup>1<\/sup> the note<\/div>/);
assert.equal(decodeURIComponent(/data-bb-raw="([^"]+)"/.exec(def)![1]), "[^1]: the note");

// A definition is never read as a reference (which would strand the ":").
assert.doesNotMatch(def, /md-fnref/);

// Named labels, and inline markup inside the note.
assert.match(block("[^note]: with **bold**"), /<sup>note<\/sup> with <strong>bold<\/strong>/);

// Adjacent references are two footnotes, not a superscript — the collision the
// tightened ^sup^ class exists for.
const two = md("[^a][^b]");
assert.equal((two.match(/md-fnref/g) ?? []).length, 2);
assert.doesNotMatch(two, /<sup>a\]\[<\/sup>/);

console.log("markedExtended footnotes: ok");
