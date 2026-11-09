// node --experimental-strip-types packages/spa-core/src/lib/chat-links.test.ts
import assert from "node:assert";
import { normalizeChat, classifyChat } from "./chat-links.ts";

assert.equal(normalizeChat("matrix", " @a.b:matrix.org ")?.href, "https://matrix.to/#/@a.b:matrix.org");
assert.equal(normalizeChat("matrix", "https://matrix.to/#/@a:b.org")?.value, "@a:b.org");
assert.equal(normalizeChat("matrix", "matrix:u/a:b.org?action=chat")?.value, "@a:b.org");
assert(normalizeChat("matrix", "@a:b.org:8448"));
assert.equal(normalizeChat("matrix", "@a@b.org"), null); // fediverse handle
assert.equal(normalizeChat("matrix", '@a:b.org"><script>'), null);
assert.equal(normalizeChat("deltachat", "mailto:a@b.org")?.href, "mailto:a@b.org");
assert.equal(normalizeChat("deltachat", "https://i.delta.chat/#ABC&a=x%40y.org")?.type, "deltachat");
assert.equal(normalizeChat("deltachat", "javascript:alert(1)"), null);
assert.equal(normalizeChat("xmpp", "a@b.org"), null);
assert.equal(classifyChat("Delta Chat", "a@b.org")?.type, "deltachat");
assert.equal(classifyChat("", "@a:b.org")?.type, "matrix");
assert.equal(classifyChat("home", "a@b.org"), null);

console.log("chat-links: ok");
