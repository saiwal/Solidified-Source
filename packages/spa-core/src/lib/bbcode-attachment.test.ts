// node --experimental-strip-types packages/spa-core/src/lib/bbcode-attachment.test.ts
//
// Friendica sends link previews as [attachment type='link' url=… title=… image=…].
// The SPA had no handler, so the whole block rendered as literal text in the
// post body. Core degrades it to [url]/[img]/text before rendering; so do we.
import assert from "node:assert";
import { bbcodeToHtml } from "./bbcode.ts";

// The reported post, trimmed to the attributes that matter.
const friendica =
  "[attachment type='link' url='https://www.heise.de/news/x-1145.html'" +
  " title='Google warnt: KI-Agenten im Smart Home'" +
  " publisher_name='heise online'" +
  " image='https://heise.cloudimg.io/v7/opengraph.png?width=1200']" +
  "Google öffnet sein Smart Home für KI-Agenten.[/attachment]";

const html = bbcodeToHtml(friendica);

assert.ok(!html.includes("[attachment"), "tag leaked into output: " + html);
assert.ok(html.includes('href="https://www.heise.de/news/x-1145.html"'), html);
assert.ok(html.includes("Google warnt: KI-Agenten im Smart Home"), html);
assert.ok(html.includes('src="https://heise.cloudimg.io/v7/opengraph.png?width=1200"'), html);
assert.ok(html.includes("Google öffnet sein Smart Home für KI-Agenten."), html);

// Entity-quoted attributes are the other spelling core accepts.
const entity = bbcodeToHtml(
  "[attachment type=&quot;link&quot; url=&quot;https://e.x/a&quot; title=&quot;Ent&quot;]t[/attachment]",
);
assert.ok(entity.includes('href="https://e.x/a"'), entity);
assert.ok(entity.includes("Ent"), entity);

// A remote title is untrusted input: a "$1"/"$&" in it must not be read as a
// replacement pattern, and a bracket must not open a bbcode tag. (A *closing*
// bracket can't get this far -- the attribute list ends at the first one, in
// core too.)
const hostile = bbcodeToHtml(
  "[attachment type='link' url='https://e.x/$&' title='$1 [i']body[/attachment]",
);
assert.ok(hostile.includes("$1"), hostile);
assert.ok(hostile.includes("&#91;i"), hostile);
assert.ok(hostile.includes("https://e.x/$&"), hostile);

// Hubzilla's own file-attachment tag is a different animal — leave it alone.
// (It has no type=, and the API strips it at save time.)
assert.equal(bbcodeToHtml("[attachment]abc123,0[/attachment]"), "[attachment]abc123,0[/attachment]");
assert.equal(
  bbcodeToHtml("[attachment type='unknown' url='https://e.x/a']t[/attachment]"),
  "[attachment type='unknown' url='https://e.x/a']t[/attachment]",
);

// Core parses only the first attachment and then overwrites every one of them
// with it; each must carry its own data.
const two = bbcodeToHtml(
  "[attachment type='link' url='https://a.x/1' title='One']first[/attachment]" +
  "[attachment type='link' url='https://b.x/2' title='Two']second[/attachment]",
);
assert.ok(two.includes('href="https://a.x/1"') && two.includes("One"), two);
assert.ok(two.includes('href="https://b.x/2"') && two.includes("Two"), two);
assert.ok(two.includes("first") && two.includes("second"), two);

console.log("bbcode-attachment: ok");
