// node --experimental-strip-types packages/spa-core/src/lib/filter-dsl.test.ts
import assert from "node:assert";
import { parse, compile, type FilterRules } from "./filter-dsl.ts";

const rt = (s: string) => {
  const r = parse(s);
  assert(r, `failed to parse: ${JSON.stringify(s)}`);
  assert.equal(compile(r), s, `round-trip changed: ${JSON.stringify(s)}`);
  return r;
};

// Every rule form core's MessageFilterTest exercises must survive parse → compile
// unchanged, or we would silently rewrite a filter the user already relies on.
for (const s of [
  "summer",
  "/ hopper/",
  "lang=en",
  "lang!=en",
  "until=2025-04-18 20:49:00",
  "#grasshopper",
  "#*",
  "#>1",
  "@someone",
  "@*",
  "@>3",
  "$Politics",
  "$*",
  "?body ~= hopper",
  "?verb == Announce",
  "?item_thread_top == 1",
  "?+type == Note",
  "?+!sensitive",
]) rt(s);

// Field/op classification
assert.deepEqual(parse("#>1")!.conds[0], { field: "hashtag", op: "count", value: "1" });
assert.deepEqual(parse("#*")!.conds[0], { field: "hashtag", op: "any", value: "" });
assert.deepEqual(parse("lang!=de")!.conds[0], { field: "lang", op: "not", value: "de" });
assert.deepEqual(parse("?verb == Announce")!.conds[0],
  { field: "raw", op: "is", value: "?verb == Announce" });
// `$` has no count form in MessageFilter — `$>2` is a literal category name
assert.deepEqual(parse("$>2")!.conds[0], { field: "category", op: "is", value: ">2" });
// nor does a non-numeric `#>` — that is a tag search for ">x"
assert.deepEqual(parse("#>x")!.conds[0], { field: "hashtag", op: "is", value: ">x" });

// Joiners: newline is an implicit OR, " && " an AND, and a box holds one of them
assert.equal(parse("summer\nwinter")!.join, "any");
assert.equal(parse("summer && winter")!.join, "all");
assert.equal(parse("a || b")!.join, "any");
// ...mixing them is a precedence trap we refuse to render structurally
assert.equal(parse("a\nb && c"), null);
// A lone phrase has no joiner; default "any" keeps adding a second row safe
assert.equal(parse("summer")!.join, "any");
// Blank input is valid and empty, not a parse failure
assert.deepEqual(parse("  "), { join: "any", conds: [] });
// Blank lines are not joiners
assert.equal(parse("summer\n\nwinter")!.conds.length, 2);
assert.equal(parse("summer\n\nwinter")!.join, "any");

// compile()
assert.equal(compile({ join: "all", conds: [
  { field: "hashtag", op: "is", value: "politics" },
  { field: "lang", op: "not", value: "en" },
] } as FilterRules), "#politics && lang!=en");
// A bare word in a regex row is wrapped rather than shipped as a body substring
assert.equal(compile({ join: "any", conds: [{ field: "regex", op: "is", value: "hop+er" }] }),
  "/hop+er/");
assert.equal(compile({ join: "any", conds: [{ field: "regex", op: "is", value: "/x/i" }] }), "/x/i");
// Empty rows are dropped, so a half-filled builder never emits a stray joiner
assert.equal(compile({ join: "all", conds: [
  { field: "text", op: "is", value: "summer" },
  { field: "text", op: "is", value: "  " },
] }), "summer");

console.log("filter-dsl: ok");
