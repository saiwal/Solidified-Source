// node --experimental-strip-types src/modules/notify/rows.test.ts
import assert from "node:assert";
import {
  rowKey,
  stampRows,
  prependDeduped,
  normalise,
  displayKeys,
  supportsMarkRead,
  isFetchable,
  appendDeduped,
  applyFilters,
  formatCount,
  PAGE,
} from "./rows.ts";

// ── rowKey: one stable key per row shape ─────────────────────────────────────
assert.equal(rowKey({ b64mid: "abc", notify_id: 7 }), "abc");
assert.equal(rowKey({ notify_id: 7 }), "n7");
assert.equal(rowKey({ notify_id: 0 }), "n0"); // 0 is a real id, not "missing"
assert.equal(rowKey({ notify_link: "/connections#4", when: "t" }), "/connections#4|t");
// two mid-less intros rows must not collide
assert.notEqual(
  rowKey({ notify_link: "/connections#4", when: "t" }),
  rowKey({ notify_link: "/connections#5", when: "t" }),
);

// ── stampRows: idempotent, never re-stamps ───────────────────────────────────
const once = stampRows([{ b64mid: "a" }]);
assert.equal(once[0]._k, "a");
assert.equal(stampRows(once)[0], once[0]); // same reference => <For> keeps the row

// ── prependDeduped ───────────────────────────────────────────────────────────
const existing = stampRows([{ b64mid: "a" }, { b64mid: "b" }]);
// a row already held must not be re-prepended
assert.equal(prependDeduped(existing, stampRows([{ b64mid: "a" }])).length, 2);
// genuinely new rows go on top
assert.deepEqual(
  prependDeduped(existing, stampRows([{ b64mid: "c" }])).map((n) => n.b64mid),
  ["c", "a", "b"],
);
// the regression: mid-less rows were treated as always-fresh and duplicated
// on every push, each one firing its own desktop alert
const intros = stampRows([{ notify_link: "/connections#4", when: "t" }]);
assert.equal(prependDeduped(intros, stampRows([{ notify_link: "/connections#4", when: "t" }])).length, 1);
// growth is capped on the push path too, so length stops oscillating PAGE<->50
assert.equal(
  prependDeduped(existing, stampRows(Array.from({ length: 80 }, (_, i) => ({ b64mid: `x${i}` })))).length,
  PAGE,
);

// ── normalise ────────────────────────────────────────────────────────────────
const big = { count: 4000, notifications: Array.from({ length: 4000 }, (_, i) => ({ notify_id: i })) };
const out = normalise({
  notify: big,
  forum_12: { count: 3, notifications: [] },
  forum_99: { count: 2, notifications: [] },
  forum: { count: 0, notifications: [] }, // core's empty-case key, not a forum
  notice: { notifications: [{ message: "hi" }] },
  bogus: { count: 9, notifications: [] },
});
// core's bs_notify() has no LIMIT; the list is capped but the badge is honest
assert.equal(out.buckets.notify.notifications.length, PAGE);
assert.equal(out.buckets.notify.count, 4000);
assert.ok(out.buckets.notify.notifications.every((n) => n._k));
// forum_<id> keys are collected; the bare `forum` key is not one
assert.deepEqual(out.forumKeys.sort(), ["forum_12", "forum_99"]);
// each forum is its own bucket, not one aggregate — core only ever fills the
// selected forum, so collapsing them meant one request per forum on open
assert.equal(out.buckets.forum_12.count, 3);
assert.equal(out.buckets.forum_99.count, 2);
assert.equal(out.buckets.forums, undefined);
assert.equal(out.buckets.forum, undefined);
// unknown keys and the notice/info channels stay out of the buckets
assert.equal(out.buckets.bogus, undefined);
assert.equal(out.buckets.notice, undefined);
// the offset sentinel survives instead of being dropped
assert.equal(normalise({ network: { count: 1, notifications: [], offset: 30 } }).buckets.network.offset, 30);
assert.equal(out.buckets.network.offset, -1);

// a push is a delta: only the keys it carried may be acted on, so a bucket the
// push omitted is not in `present` and must be left alone rather than zeroed
assert.deepEqual(out.present.sort(), ["forum_12", "forum_99", "notify"]);
assert.deepEqual(normalise({ network: { count: 1, notifications: [] } }).present, ["network"]);
// the buckets map is still fully populated — absence is what `present` encodes
assert.equal(normalise({ network: { count: 1, notifications: [] } }).buckets.dm.count, 0);

// ── displayKeys: forums splice in after intros, order otherwise fixed ────────
const keys = displayKeys(["forum_12", "forum_99"]);
assert.equal(keys[keys.indexOf("intros") + 1], "forum_12");
assert.equal(keys[keys.indexOf("intros") + 2], "forum_99");
assert.equal(keys[keys.indexOf("intros") + 3], "pubs");
assert.deepEqual(displayKeys([]).filter((k) => k.startsWith("forum")), []);
assert.equal(new Set(keys).size, keys.length); // no key listed twice

// ── capability predicates ────────────────────────────────────────────────────
// core's Notifications switch handles forum_* by prefix
assert.ok(supportsMarkRead("forum_12"));
assert.ok(supportsMarkRead("network"));
// these three fall through its default and clear nothing
assert.ok(!supportsMarkRead("intros"));
assert.ok(!supportsMarkRead("files"));
assert.ok(!supportsMarkRead("register"));
// rows for these come from GET /sse_bs/<key>; the rest arrive inline
assert.ok(isFetchable("pubs"));
assert.ok(isFetchable("forum_12"));
assert.ok(!isFetchable("notify"));

// ── appendDeduped: paging grows the tail, never re-adds a page ──────────────
const page1 = stampRows([{ b64mid: "a" }, { b64mid: "b" }]);
const page2 = stampRows([{ b64mid: "b" }, { b64mid: "c" }]); // overlap after a mark-seen
assert.deepEqual(appendDeduped(page1, page2).map((n) => n.b64mid), ["a", "b", "c"]);
assert.equal(appendDeduped(page1, page1)[0], page1[0]); // identities survive

// ── applyFilters ─────────────────────────────────────────────────────────────
const mixed: any[] = [
  { name: "Alice", addr: "alice@hub.tld", thread_top: true },
  { name: "Bob", addr: "bob@other.tld", thread_top: false },
  { name: "Carol", addr: "carol@hub.tld" }, // no thread_top at all
];
assert.equal(applyFilters(mixed, "", false), mixed); // no filters => same array
assert.deepEqual(applyFilters(mixed, "ali", false).map((n) => n.name), ["Alice"]);
assert.deepEqual(applyFilters(mixed, "hub.tld", false).map((n) => n.name), ["Alice", "Carol"]);
assert.deepEqual(applyFilters(mixed, "ALICE", false).map((n) => n.name), ["Alice"]); // case-insensitive
// only an explicit false is hidden — core's selector is [data-thread_top="false"]
assert.deepEqual(applyFilters(mixed, "", true).map((n) => n.name), ["Alice", "Carol"]);
assert.deepEqual(applyFilters(mixed, "hub", true).map((n) => n.name), ["Alice", "Carol"]);

// ── formatCount: core's saturation rule, not a hardcoded 99+ ────────────────
assert.equal(formatCount(4, 100), "4");
assert.equal(formatCount(99, 100), "99");
assert.equal(formatCount(100, 100), "99+"); // saturated: the query LIMITed here
assert.equal(formatCount(20, 20), "19+");   // a hub that lowered the pconfig
assert.equal(formatCount(5, 0), "5");       // limit unset => never saturate

console.log("notify/rows: ok");
