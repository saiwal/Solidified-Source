// node --experimental-strip-types src/modules/inbox/query.test.ts
import assert from "node:assert";
import {
  parseQuery, hasOperator, toggleOperator,
  setOperator, operatorValue, trailingOperator, completeTrailing,
} from "./query.ts";

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

// ── hasOperator / toggleOperator ────────────────────────────────────────────
assert.equal(hasOperator("from:bob is:unread", "is:unread"), true);
assert.equal(hasOperator("from:bob", "is:unread"), false);
assert.equal(hasOperator("has:attachment", "has:attachment"), true);

assert.equal(toggleOperator("", "is:unread"), "is:unread");
assert.equal(toggleOperator("is:unread", "is:unread"), "");
assert.equal(toggleOperator("from:bob hello", "is:starred"), "from:bob hello is:starred");
assert.equal(toggleOperator("from:bob is:starred hello", "is:starred"), "from:bob hello");

// Toggling a value operator replaces the existing one for the same param
// rather than leaving two that contradict each other.
assert.equal(toggleOperator("in:work", "in:personal"), "in:personal");
assert.equal(toggleOperator("is:direct", "is:dm"), "", "an alias toggles its own param off");

// Round trip: whatever the pills produce must still parse.
const round = toggleOperator(toggleOperator("weekly", "is:unread"), "has:attachment");
assert.deepEqual(parseQuery(round).params, {
  search: "weekly", unread: "1", has: "attachment",
});

// ── contains: ───────────────────────────────────────────────────────────────
// An explicit spelling of what bare words do, so it joins the free text rather
// than fighting it for the `search` param.
assert.deepEqual(p("contains:budget"), { search: "budget" });
assert.deepEqual(p('contains:"weekly report" notes'), { search: "weekly report notes" });
assert.deepEqual(p("from:bob contains:invoice"), { author: "bob", search: "invoice" });

// ── setOperator / operatorValue (the date inputs) ───────────────────────────
assert.equal(setOperator("from:bob", "after", "2026-01-01"), "from:bob after:2026-01-01");
assert.equal(
  setOperator("from:bob after:2025-01-01", "after", "2026-01-01"),
  "from:bob after:2026-01-01",
  "replaces rather than appending a second one",
);
assert.equal(setOperator("from:bob after:2025-01-01", "after", ""), "from:bob",
  "an empty value clears the operator");
assert.equal(setOperator("", "before", ""), "");
assert.equal(operatorValue("after:2026-01-01 hi", "after"), "2026-01-01");
assert.equal(operatorValue("hi", "after"), "");

// ── trailingOperator / completeTrailing (the dropdown) ──────────────────────
assert.equal(trailingOperator("from:bob is:")?.info.key, "is");
assert.equal(trailingOperator("from:bob is:un")?.value, "un");
assert.equal(trailingOperator("from:bob ")?.info.key, undefined);
assert.equal(trailingOperator("nonsense:x"), null, "unknown operators have no hint");
assert.equal(completeTrailing("from:bob is:", "unread"), "from:bob is:unread ");
assert.equal(completeTrailing("from:bob is:un", "unread"), "from:bob is:unread ");

console.log("inbox query: ok");
