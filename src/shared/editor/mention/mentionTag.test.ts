// node --experimental-strip-types src/shared/editor/mention/mentionTag.test.ts
import assert from "node:assert";
import { mentionQueryAt, mentionTag } from "./mentionTag.ts";

// query extraction — the webbie case is the one that regressed
assert.equal(mentionQueryAt("hi @ali"), "ali");
assert.equal(mentionQueryAt("@ali"), "ali");
assert.equal(mentionQueryAt("hi @alice@hub.tld"), "alice@hub.tld");
assert.equal(mentionQueryAt("hi @alice@hub.tld "), null);     // closed by space
assert.equal(mentionQueryAt("mail me at bob@hub.tld"), null); // not a mention
assert.equal(mentionQueryAt("no at sign"), null);

// caret sits right after the "@": popup opens, MIN_CHARS gates the search
assert.equal(mentionQueryAt("hi @"), "");

// deleting query.length + 1 chars must land exactly on the "@"
const before = "hi @alice@hub.tld";
assert.equal(before.length - mentionQueryAt(before)!.length - 1, before.indexOf("@"));

// insertion is core's braced form (handle_tag's whole-xchan branch)
assert.equal(
  mentionTag({ nick: "alice", name: "Alice", addr: "alice@hub.tld" }),
  "@{alice@hub.tld}",
);
assert.equal(
  mentionTag({ nick: "", name: "Bob", addr: "https://ap.example/users/bob" }),
  "@{https://ap.example/users/bob}",
);

console.log("mentionTag: ok");
