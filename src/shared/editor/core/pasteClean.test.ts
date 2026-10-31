// node --experimental-strip-types src/shared/editor/core/pasteClean.test.ts
//
// What a paste from the usual sources leaves behind, and what that saves as.
// domino stands in for the DOM, as in htmlToSource.test.ts.
import assert from "node:assert";
import { createRequire, registerHooks } from "node:module";

const domino = createRequire(import.meta.url)("@mixmark-io/domino");
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith(".") && !/\.[a-z]+$/i.test(spec) ? next(`${spec}.ts`, ctx) : next(spec, ctx);
  },
});
(globalThis as any).document = domino.createDocument("<body></body>");
(globalThis as any).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
(globalThis as any).DOMParser = class {
  parseFromString(html: string) { return domino.createDocument(html); }
};

const { cleanPastedHtml, isInternalPaste } = await import("./pasteClean.ts");
const { htmlToSource } = await import("./htmlToSource.ts");

const CASES: Record<string, [string, string]> = {
  "google docs wrapper + span bold": [
    '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38"><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:700">Bold</span><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:400"> plain</span></p></b>',
    "<p><b>Bold</b> plain</p>",
  ],
  "styled spans unwrapped, colour dropped": [
    '<span style="color: rgb(230, 230, 230); font-family: Inter">dark-theme text</span>',
    "dark-theme text",
  ],
  "style marks": [
    '<span style="font-style:italic;text-decoration:underline">x</span><span style="text-decoration-line: line-through">y</span><span style="vertical-align:super">2</span>',
    "<i><u>x</u></i><s>y</s><sup>2</sup>",
  ],
  "no double bold in a heading": ['<h2 style="font-weight:700" class="x">T</h2>', "<h2>T</h2>"],
  "word junk": [
    '<html><head><style>p{}</style></head><body><!--[if gte mso 9]><xml></xml><![endif]--><p class=MsoNormal><span style="mso-list:Ignore">·</span>item<o:p></o:p></p></body></html>',
    "<p>item</p>",
  ],
  "hard-wrapped text": ["<p>one\n  two</p>", "<p>one two</p>"],
  "pre keeps newlines": ["<pre><code>a\n  b</code></pre>", "<pre><code>a\n  b</code></pre>"],
  "safe link kept, attrs dropped": ['<a href="https://x.org" class="c" target="_blank">x</a>', '<a href="https://x.org">x</a>'],
  "javascript link unwrapped": ['<a href="javascript:alert(1)"><b>x</b></a>', "<b>x</b>"],
  "data image dropped, http kept": ['<img src="data:image/png;base64,AA"><img src="https://x.org/a.png" alt="A" width="9">', '<img src="https://x.org/a.png" alt="A">'],
  "script/handlers gone": ['<p onclick="x()">a<script>evil()</script></p>', "<p>a</p>"],
  "lists + table": [
    '<ul style="margin:0"><li class="li">a<ol start="3"><li>b</li></ol></li></ul><table border="1"><tbody><tr><td style="x">c</td></tr></tbody></table>',
    '<ul><li>a<ol start="3"><li>b</li></ol></li></ul><table><tbody><tr><td>c</td></tr></tbody></table>',
  ],
};
for (const [name, [input, want]] of Object.entries(CASES)) {
  assert.equal(cleanPastedHtml(input), want, name);
}

// What actually reaches the body: the Docs paste as bbcode and markdown.
const docs = cleanPastedHtml(CASES["google docs wrapper + span bold"][0]);
assert.equal(htmlToSource(docs, "text/bbcode"), "[b]Bold[/b] plain");
assert.equal(htmlToSource(docs, "text/markdown").trim(), "**Bold** plain");

assert.ok(isInternalPaste('<div data-bb-raw="x"></div>'));
assert.ok(!isInternalPaste("<p>x</p>"));

console.log(`pasteClean: ok (${Object.keys(CASES).length} cases)`);
