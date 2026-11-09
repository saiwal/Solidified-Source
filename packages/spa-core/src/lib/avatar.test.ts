// node --experimental-strip-types packages/spa-core/src/lib/avatar.test.ts
import assert from "node:assert";

const { initials, avatarHue } = await import("./avatar.ts");

assert.equal(initials("Ada Lovelace"), "AL");
assert.equal(initials("ada lovelace byron"), "AL", "two initials at most, upper-cased");
assert.equal(initials("  Cher  "), "C", "stray whitespace makes no empty initial");
assert.equal(initials(""), "");
assert.equal(initials("#video-calls (Element Call)"), "VE", "sigils and brackets are skipped");
assert.equal(initials("@alice:matrix.org"), "A");
assert.equal(initials("- Ü -"), "Ü", "punctuation-only words are skipped, non-ASCII letters kept");
assert.equal(initials("🎉"), "🎉", "no letters: first symbol, whole code point");
assert.equal(avatarHue("Ada"), avatarHue("Ada"), "the same name always gets the same hue");
assert.notEqual(avatarHue("Ada"), avatarHue("Bob"));
assert(avatarHue("x".repeat(500)) >= 0 && avatarHue("x".repeat(500)) < 360);

console.log("avatar: ok");
