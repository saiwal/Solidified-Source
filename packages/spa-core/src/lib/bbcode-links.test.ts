// node --experimental-strip-types packages/spa-core/src/lib/bbcode-links.test.ts
import assert from "node:assert";
import { bbcodeToHtml } from "./bbcode.ts";

const href = (bb: string) => bbcodeToHtml(bb).match(/href="([^"]*)"/)?.[1];

// Schemeless URLs are relative, not dangerous — keep them.
assert.equal(href("[url=en.wikipedia.org/wiki/Alysa_Liu]x[/url]"), "en.wikipedia.org/wiki/Alysa_Liu");
assert.equal(href("[url=/local/path]x[/url]"), "/local/path");
assert.equal(href("[url=#anchor]x[/url]"), "#anchor");
assert.equal(href("[url=https://e.org/a]x[/url]"), "https://e.org/a");
assert.equal(href("[url=mailto:a@e.org]x[/url]"), "mailto:a@e.org");
// A colon *after* a slash is still a relative path, not a scheme.
assert.equal(href("[url=a/b:c]x[/url]"), "a/b:c");
// Unwhitelisted schemes are still blanked.
assert.equal(href("[url=javascript:alert(1)]x[/url]"), "");
assert.equal(href("[url=data:text/html,<script>]x[/url]"), "");
assert.equal(href("[url=vbscript:foo]x[/url]"), "");
console.log("ok");

// [embed] the resolver doesn't play becomes an a.oembed-embed for useEmbeds()
// to hydrate, and a quote in the URL can't break out of its href.
{
  const out = bbcodeToHtml("[embed]https://tube.example/w/a?x=1&y=2[/embed]");
  assert.match(out, /<a class="oembed-embed" href="https:\/\/tube\.example\/w\/a\?x=1&(amp;)?y=2"/);
  assert.ok(!bbcodeToHtml('[embed]https://e.org/"onmouseover="x[/embed]').includes('"onmouseover'));
}
