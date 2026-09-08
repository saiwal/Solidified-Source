// node --experimental-strip-types src/shared/editor/core/htmlToSource.test.ts
//
// Guards the bbcode WYSIWYG round trip. RichEditor re-serializes the whole
// surface through htmlToSource() on every keystroke and re-renders it through
// bbcodeToHtml() on every blur, so two properties matter:
//
//   1. Contenteditable's line shapes map to the right number of newlines.
//      Chrome wraps lines in <div>s (often leaving the first one unwrapped)
//      and marks an empty line as "<div><br></div>"; Firefox uses bare <br>.
//      Serializing those wrong either merges two lines or doubles a blank one.
//   2. bbcode → html → bbcode is a fixed point. It isn't a one-off conversion:
//      the blur pass runs it again on its own output, so anything that grows
//      keeps growing.
//
// htmlToSource needs a DOM; @mixmark-io/domino is already here as a turndown
// dependency, so the shim below is cheaper than adding jsdom.
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

const doc = domino.createDocument("<body></body>");
(globalThis as any).document = doc;
(globalThis as any).Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
(globalThis as any).DOMParser = class {
  parseFromString(html: string) {
    return domino.createDocument(`<body>${html}</body>`);
  }
};

const { htmlToSource } = await import("./htmlToSource.ts");
const { bbcodeToHtml } = await import("@utsukta/spa-core/lib/bbcode");

const bb = (html: string) => htmlToSource(html, "text/bbcode");

// ── Contenteditable line shapes ─────────────────────────────────────────────
const SHAPES: Record<string, [string, string]> = {
  // Chrome leaves the first line as a bare text node until you edit it again.
  "chrome, first line unwrapped": ["a<div>b</div>", "a\nb"],
  "chrome, both wrapped":         ["<div>a</div><div>b</div>", "a\nb"],
  // The <br> is filler keeping the empty block visible — one line, not two.
  "chrome, blank line":           ["<div>a</div><div><br></div><div>b</div>", "a\n\nb"],
  "paragraphs, blank line":       ["<p>a</p><p><br></p><p>b</p>", "a\n\nb"],
  "firefox, br":                  ["a<br>b", "a\nb"],
  "firefox, blank line":          ["a<br><br>b", "a\n\nb"],
  "trailing filler br":           ["<div>a</div><div>b<br></div>", "a\nb"],
  "nested divs":                  ["<div><div>a</div><div>b</div></div>", "a\nb"],
};

// Blocks get their own line on both sides — the old code only emitted one
// after, so text following a quote/table ran onto its closing line.
const BLOCKS: Record<string, [string, string]> = {
  "hr":         ["<div>a</div><hr><div>b</div>", "a\n[hr]\nb"],
  "blockquote": ["<div>a</div><blockquote>q</blockquote><div>b</div>", "a\n[quote]q[/quote]\nb"],
  "heading":    ["<div>a</div><h2>t</h2><div>b</div>", "a\n[h2]t[/h2]\nb"],
  "pre":        ["<div>a</div><pre>x</pre><div>b</div>", "a\n[code]x[/code]\nb"],
  "list":       ["<div>a</div><ul><li>x</li><li>y</li></ul><div>b</div>",
                 "a\n[list]\n[*]x\n[*]y\n[/list]\nb"],
  // Legacy <font>, which is what execCommand emits with styleWithCSS off.
  "font tag":   ['<font color="#ef4444" face="serif" size="5">x</font>',
                 "[color=#ef4444][font=serif][size=x-large]x[/size][/font][/color]"],
  "quote label": ['<span class="bb-quote">Jane wrote:</span><blockquote>hi</blockquote>',
                 "[quote=Jane]hi[/quote]"],
  // Chrome's shape when a line below an unwrapped first line is turned into a
  // heading. The <br> terminates the line — the block boundary is the break —
  // so counting it too grew a blank line above the heading on every Enter.
  "br before block": ["a<br><h3>t</h3>b", "a\n[h3]t[/h3]\nb"],
  // An authored blank line there is marked (bbcodeToHtml's newline pass) and
  // does count: the HTML is otherwise identical to the shape above.
  "blank before block": ['a<br class="bb-blank" /><h3>t</h3>b', "a\n\n[h3]t[/h3]\nb"],
  "table":      ["<div>a</div><table><tr><td>x</td></tr></table><div>b</div>",
                 "a\n[table]\n[tr][td]x[/td][/tr]\n[/table]\nb"],
};

for (const [name, [html, want]] of Object.entries({ ...SHAPES, ...BLOCKS })) {
  assert.equal(bb(html), want, `${name}: ${JSON.stringify(bb(html))} !== ${JSON.stringify(want)}`);
}

// ── Fixed point: bbcode → html → bbcode ─────────────────────────────────────
const CORPUS = [
  "hello",
  "one\ntwo",
  "one\n\ntwo",
  "one\n\n\ntwo",
  "[b]bold[/b] and [i]italic[/i]",
  "before\n[hr]\nafter",
  "[quote]quoted[/quote]",
  "[h2]Title[/h2]\nbody",
  "[list]\n[*]one\n[*]two\n[/list]",
  "[list=a]\n[*]one\n[*]two\n[/list]",
  "[code]x = 1[/code]",
  "[img]https://x/1.jpg[/img]",
  "[url=https://x/]link[/url]",
  "para one\n\n[quote]q[/quote]\n\npara two",
  "[table]\n[tr][th]H[/th][/tr]\n[tr][td]c[/td][/tr]\n[/table]",
  "[spoiler=Why]hidden[/spoiler]",
  "[center]middle[/center]",
  // The appearance pickers. [mark=…] used to come back as a bare [mark]:
  // htmlToSource's <mark> case never read the colour back off the style,
  // so every WYSIWYG blur reset a highlight to the default.
  "[mark=yellow]hl[/mark]",
  "[mark]hl[/mark]",
  "[color=#ff0000]red[/color]",
  "[size=large]big[/size]",
  "[font=serif]g[/font]",
  "[u]under[/u]",
  // The attribution sits in a sibling span, so it used to serialize as loose
  // text and the author was lost on the first round trip.
  "[quote=Jane]hi[/quote]",
  "[video]https://x/a.mp4[/video]",
  "[audio]https://x/a.mp3[/audio]",
  "[img width='400' alt=&quot;cat&quot;]https://x/a.png[/img]",
  // A blank line either side of a block, for every block shape. These used to
  // collapse (after a block) or double (before one) on each round trip.
  "a\n\n[h3]t[/h3]\n\nb",
  "a\n\n[hr]\n\nb",
  "a\n\n[quote]q[/quote]\n\nb",
  "a\n\n[code]x\ny[/code]\n\nb",
  "a\n\n[list]\n[*]x\n[/list]\n\nb",
  "a\n\n[table]\n[tr][td]c[/td][/tr]\n[/table]\n\nb",
];

for (const src of CORPUS) {
  const once = bb(bbcodeToHtml(src));
  assert.equal(once, src, `round trip: ${JSON.stringify(src)} -> ${JSON.stringify(once)}`);
  assert.equal(bb(bbcodeToHtml(once)), once, `not a fixed point: ${JSON.stringify(src)}`);
}

console.log("htmlToSource: ok");
