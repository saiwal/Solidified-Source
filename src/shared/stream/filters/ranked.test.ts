// node --experimental-strip-types src/shared/stream/filters/ranked.test.ts
import assert from "node:assert";
import {
  RANGE_AWARE, RANKED_ORDERS, DEFAULT_RANGE, resolveRange, rangeToDbegin,
} from "./ranked.ts";

const now = Date.parse("2026-03-15T12:00:00Z");

assert.equal(rangeToDbegin(undefined, now), undefined, "no range → no dbegin");
assert.equal(rangeToDbegin("all", now), undefined, "all time → no dbegin");
assert.equal(rangeToDbegin("day", now), "2026-03-14");
assert.equal(rangeToDbegin("week", now), "2026-03-08");
assert.equal(rangeToDbegin("year", now), "2025-03-15");

// hot is ranked (poll must be off) but not range-aware (its decay IS the range)
assert.ok(RANKED_ORDERS.includes("hot"));
assert.ok(!RANGE_AWARE.includes("hot"));
// every range-aware order must also be ranked, or the poll would run on it
for (const o of RANGE_AWARE) assert.ok(RANKED_ORDERS.includes(o), o);
// chronological orders must not be ranked
for (const o of ["created", "commented", "unthreaded"]) assert.ok(!RANKED_ORDERS.includes(o), o);

// A range-aware order with nothing in the URL falls back to the default,
// which must be a real bounded window — an unbounded default is the expensive
// query we're trying not to run by accident.
assert.equal(resolveRange("top", undefined), DEFAULT_RANGE);
assert.notEqual(DEFAULT_RANGE, "all");
assert.ok(rangeToDbegin(DEFAULT_RANGE, now), "default range must bound the window");

// ...but "all" stays reachable when written explicitly, which only works
// because absent and "all" are now different states.
assert.equal(resolveRange("top", "all"), "all");
assert.equal(rangeToDbegin(resolveRange("top", "all"), now), undefined);

// Orders that take no range never get one, default or otherwise.
assert.equal(resolveRange("hot", undefined), undefined);
assert.equal(resolveRange("created", "week"), undefined);

console.log("ok");
