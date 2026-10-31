// node --experimental-strip-types src/shared/editor/core/listIndent.test.ts
//
// Tab/Shift+Tab list nesting must keep nested lists *inside* an <li>, the
// only shape htmlToSource and turndown serialize. domino stands in for the DOM
// (a turndown dependency, see htmlToSource.test.ts).
import assert from "node:assert";
import { createRequire } from "node:module";
import { indentListItem, outdentListItem } from "./listIndent.ts";

const domino = createRequire(import.meta.url)("@mixmark-io/domino");
const root = (html: string) => domino.createDocument(`<body><div>${html}</div></body>`).body.firstChild;
const li = (r: any, text: string) => Array.from(r.querySelectorAll("li") as ArrayLike<any>).find((l: any) => l.firstChild.data === text);

const r = root("<ul><li>a</li><li>b</li><li>c</li></ul>");
assert.equal(indentListItem(li(r, "a")), false, "first item can't indent");
assert.ok(indentListItem(li(r, "b")));
assert.equal(r.innerHTML, "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
assert.ok(indentListItem(li(r, "c")), "joins the existing sub-list");
assert.equal(r.innerHTML, "<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>");

assert.ok(outdentListItem(li(r, "b")), "items below become children");
assert.equal(r.innerHTML, "<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>");
assert.equal(outdentListItem(li(r, "a")), false, "top level can't outdent");
assert.ok(outdentListItem(li(r, "c")));
assert.equal(r.innerHTML, "<ul><li>a</li><li>b</li><li>c</li></ul>", "empty sub-list removed");

// Ordered levels alternate 1. → a. → 1., like a word processor.
const o = root('<ol><li>a</li><li>b</li><li>c</li></ol>');
indentListItem(li(o, "b"));
assert.equal(o.innerHTML, '<ol><li>a<ol class="listloweralpha" style="list-style-type: lower-alpha;"><li>b</li></ol></li><li>c</li></ol>', "numbered → lettered");
indentListItem(li(o, "c"));
assert.equal(li(o, "c").parentNode.className, "listloweralpha", "joins the existing lettered level");
const o2 = root('<ol class="listloweralpha" style="list-style-type: lower-alpha;"><li>a</li><li>b</li></ol>');
indentListItem(li(o2, "b"));
assert.equal(li(o2, "b").parentNode.className, "listdecimal", "lettered → numbered");
// Bullets stay bullets.
const u = root("<ul><li>a</li><li>b</li></ul>");
indentListItem(li(u, "b"));
assert.equal(u.innerHTML, "<ul><li>a<ul><li>b</li></ul></li></ul>");

console.log("listIndent: ok");
