// node --experimental-strip-types src/modules/inbox/query.test.ts
import assert from "node:assert";
import { parseQuery } from "./query.ts";

const p = (s: string) => parseQuery(s).params;

// Plain text is a body/title search.
assert.deepEqual(p("budget report"), { search: "budget report" });
assert.deepEqual(p("   "), {});

// Field operators.
assert.deepEqual(p("from:alice"), { author: "alice" });
assert.deepEqual(p('from:"alice smith"'), { author: "alice smith" });
assert.deepEqual(p("after:2026-01-01 before:2026-02-01"), {
  dbegin: "2026-01-01", dend: "2026-02-01",
});
assert.deepEqual(p('in:"folder 1"'), { file: "folder 1" });

// is: / has: flags.
assert.deepEqual(p("is:unread"), { unread: "1" });
assert.deepEqual(p("is:starred is:dm"), { star: "1", dm: "1" });
assert.deepEqual(p("is:direct"), { dm: "1" }, "aliases collapse to one param");
assert.deepEqual(p("has:attachment"), { has: "attachment" });

// Operators and free text together — the words are what's left over.
assert.deepEqual(p("from:bob is:unread quarterly numbers"), {
  author: "bob", unread: "1", search: "quarterly numbers",
});

// #tag shorthand, but only as a bare word.
assert.deepEqual(p("#release"), { tag: "release" });
assert.deepEqual(p('"#release"'), { search: "#release" }, "quoted is literal text");

// Unknown operators stay searchable rather than vanishing — a pasted URL is
// the common case, and silently dropping half a query is worse than a miss.
const url = parseQuery("https://example.com/item/1");
assert.deepEqual(url.params, { search: "https://example.com/item/1" });
assert.deepEqual(url.unknown, ["https://example.com/item/1"]);
assert.deepEqual(p("is:nonsense"), { search: "is:nonsense" });

// A space after the colon is what people actually type.
assert.deepEqual(p("from: alice"), { author: "alice" });
assert.deepEqual(p("has: attachment"), { has: "attachment" });
assert.deepEqual(p('in: "folder 1"'), { file: "folder 1" });
assert.deepEqual(p("from: bob unpaid invoice"), { author: "bob", search: "unpaid invoice" });
// …but a dangling operator with no value is still just text.
assert.deepEqual(p("from:"), { search: "from:" });
assert.deepEqual(p("budget from:"), { search: "budget from:" });

// Case-insensitive keys and values.
assert.deepEqual(p("From:Alice IS:UNREAD"), { author: "Alice", unread: "1" });

console.log("inbox query: ok");
