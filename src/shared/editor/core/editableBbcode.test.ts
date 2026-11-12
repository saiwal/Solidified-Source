// node --experimental-strip-types src/shared/editor/core/editableBbcode.test.ts
//
// Markdown mode's WYSIWYG surface: bbcode formatting markdown can't spell
// (underline, colour, size, …) renders as editable formatting rather than a
// locked embed, and must come back as the same bbcode on every pass — the blur
// pass re-renders the surface from its own output. Plus the trailing caret
// line RichEditor adds after a final block, which must serialize to nothing.
//
// Same domino shim as htmlToSource.test.ts; DOMPurify needs a window too.
import assert from "node:assert";
import { createRequire, registerHooks } from "node:module";

// createRequire, not an import: domino ships no module type declarations.
const domino = createRequire(import.meta.url)("@mixmark-io/domino");

// htmlToSource.ts and its imports use extensionless relative specifiers (Vite
// resolves them); node's type stripping wants the real filename.
registerHooks({
  resolve(spec, ctx, next) {
    return spec.startsWith(".") && !/\.[a-z]+$/i.test(spec)
      ? next(`${spec}.ts`, ctx)
      : next(spec, ctx);
  },
});

const win = domino.createWindow("<body></body>");
(globalThis as any).window = win;
const doc = win.document;
(globalThis as any).document = doc;
(globalThis as any).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
(globalThis as any).DOMParser = class {
  parseFromString(html: string) {
    return domino.createDocument(`<body>${html}</body>`);
  }
};



const { sourceToHtml, padTrailingBlock } = await import("./sourceToHtml.ts");
const { htmlToMarkdown } = await import("./markdownTurndown.ts");

// Markdown mode: formatting markdown can't spell renders editable (no
// contenteditable=false), and comes back as the same bbcode, pass after pass.
const EDITABLE: Record<string, string> = {
  underline: "a [u]x **b**[/u] c",
  color:     "[color=#ef4444]red[/color]",
  size:      "[size=x-large]big[/size]",
  font:      "[font=serif]f[/font]",
  mark:      "[mark]m[/mark]",
  nested:    "[color=red][u]x[/u][/color]",
  center:    "a\n\n[center]x[/center]\n\nb",
  spoiler:   "[spoiler=S]hidden **b**[/spoiler]",
  sizedImg:  "[img width='100']https://e/x.png[/img]",
};
for (const [name, md] of Object.entries(EDITABLE)) {
  const html = sourceToHtml(md, "text/markdown");
  assert.ok(!html.includes('contenteditable="false"'), `${name} locked: ${html}`);
  const once = htmlToMarkdown(html);
  assert.equal(htmlToMarkdown(sourceToHtml(once, "text/markdown")), once, `${name} drifts: ${JSON.stringify(once)}`);
  assert.equal(once.replace(/\s+/g, " "), md.replace(/\s+/g, " "), `${name}: ${JSON.stringify(once)}`);
}

// Embeds stay locked.
for (const md of ["[quote=Jane]hi[/quote]", "[img]https://e/x.png[/img]", "[hl]h[/hl]", "> a [center]x[/center]"]) {
  assert.ok(sourceToHtml(md, "text/markdown").includes('contenteditable="false"'), `${md} should stay locked`);
}

// A trailing block gets a caret line that serializes back to nothing.
assert.equal(padTrailingBlock("<ul><li>x</li></ul>"), "<ul><li>x</li></ul><p><br></p>");
assert.equal(padTrailingBlock("a<br>"), "a<br>");
assert.equal(htmlToMarkdown(padTrailingBlock("<blockquote>q</blockquote>")), "> q");

console.log("editableBbcode: ok");
