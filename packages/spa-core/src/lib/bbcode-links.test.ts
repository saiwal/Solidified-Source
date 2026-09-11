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
