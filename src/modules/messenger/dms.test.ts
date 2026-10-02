// node --experimental-strip-types src/modules/messenger/dms.test.ts
import assert from "node:assert";
import { groupThreads, groupMatches } from "./dms.ts";

const p = (hash: string, name = hash) => ({ hash, name, addr: `${name}@hub`, url: "", photo: "" });
const e = (b64mid: string, participants: any[] | undefined, unseen_count: any = "", unseen = false) =>
  ({ b64mid, participants, unseen_count, unseen, author_addr: "old@hub", author_name: "Old", author_img: "" }) as any;

const g = groupThreads([
  e("t1", [p("bob")], 2),
  e("t2", [p("ann")]),
  e("t3", [p("bob")], "&#8192;", true),     // second thread with bob
  e("t4", [p("bob"), p("ann")]),            // group DM: its own conversation
  e("t5", [p("ann"), p("bob")]),            // same people, other order
  e("t6", undefined),                       // pre-participants cache entry
  { ...e("t7", []), author_hash: "me" },    // DM to yourself
]);

assert.deepEqual(g.map((x) => x.key), ["bob", "ann", "ann,bob", "old@hub", "me"]);
assert.deepEqual(g[0].threads.map((t) => t.b64mid), ["t1", "t3"]);
assert.equal(g[0].unread, 3);
assert.equal(g[2].threads.length, 2);
assert.equal(g[3].people[0].name, "Old");

assert.ok(groupMatches(g[2], "BOB"));
assert.ok(!groupMatches(g[1], "bob"));
assert.ok(groupMatches(g[1], ""));
console.log("ok");
