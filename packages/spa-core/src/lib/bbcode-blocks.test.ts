// node --experimental-strip-types packages/spa-core/src/lib/bbcode-blocks.test.ts
//
// A newline next to a block boundary must not become a <br />: HTML already
// breaks there, and converting it put a blank line above every code block and
// inside the top and bottom of every quote. Blank lines the author actually
// typed *between* two lines of text still have to survive.
import assert from "node:assert";
import { bbcodeToHtml } from "./bbcode.ts";

const html = bbcodeToHtml(
  "before\n[code]line1\nline2[/code]\nafter\n[quote]\nquoted one\n\nquoted two\n[/quote]\nend",
);

assert.equal(
  html,
  "before<pre><code>line1\nline2</code></pre>after" +
    "<blockquote>quoted one<br /><br />quoted two</blockquote>end",
);

// Plain prose keeps every break it was given.
assert.equal(bbcodeToHtml("a\n\nb\nc"), "a<br /><br />b<br />c");

// The block's own padding goes; the first line's indentation is content (the
// nbsp is the earlier double-space pass, which core's bbcode does too).
assert.equal(
  bbcodeToHtml("[code]  indented\n    more\n[/code]"),
  "<pre><code>&nbsp;&nbsp;indented\n&nbsp;&nbsp;&nbsp;&nbsp;more</code></pre>",
);

// The first newline at a block boundary is the boundary itself; the rest are
// blank lines the author typed, and they are marked so htmlToSource can tell
// them from the identical shape a browser writes for a line that simply ends
// in front of a block (see htmlToSource's joinChildren).
assert.equal(bbcodeToHtml("a\n[h3]t[/h3]\nb"), "a<h3>t</h3>b");
assert.equal(
  bbcodeToHtml("a\n\n[h3]t[/h3]\n\nb"),
  'a<br class="bb-blank" /><h3>t</h3><br class="bb-blank" />b',
);
// After a list and a table too — their own "[/list]\n" / "[/table]\n" strips
// used to eat the newline before the counting pass ever saw it.
assert.equal(
  bbcodeToHtml("[list]\n[*]x\n[/list]\n\nb"),
  '<ul class="listbullet"><li>x</ul><br class="bb-blank" />b',
);
assert.equal(
  bbcodeToHtml("[table]\n[tr][td]c[/td][/tr]\n[/table]\n\nb"),
  '<table><tr><td>c</td></tr></table><br class="bb-blank" />b',
);

console.log("bbcode-blocks: ok");
