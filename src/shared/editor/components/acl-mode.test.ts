/**
 * Round-trip guard for the ACL mode helpers.
 *   node --experimental-strip-types src/shared/editor/components/acl-mode.test.ts
 *
 * "Only me" is not a stored state: the server expands scope "private" into
 * allow_cid = [the owner's own hash]. Getting that back out is what these
 * helpers do, and getting it wrong shows the user "Custom" with a chip they
 * can't remove.
 */
import assert from "node:assert/strict";
import { aclModeToScope, aclModeFrom, aclEntryKeys, aclIsRestricted, entryKey } from "./acl-mode.ts";

const ME = "zTgMRO7W4dTOself";
const OTHER = "lNWu3pydOther";

assert.equal(entryKey({ type: "c", xid: ME } as never), `c:${ME}`);

// The write side, and its exact inverse.
assert.equal(aclModeToScope("me"), "private");
assert.equal(aclModeFrom({ allow_cid: [ME] }, ME), "me");
// ...and no chip is seeded for it, or the owner's own hash sits in the picker
// as an entry that /acl can never resolve to a name.
assert.deepEqual(aclEntryKeys({ allow_cid: [ME] }, "me"), {
  allow: new Set(),
  deny: new Set(),
});

// No viewer hash yet (nav still loading): degrade to the old reading, never throw.
assert.equal(aclModeFrom({ allow_cid: [ME] }, undefined), "custom");

// Lockview's guest grant appends, giving <self><guest>. Stays custom, keeps both.
const mixed = { allow_cid: [ME, OTHER] };
assert.equal(aclModeFrom(mixed, ME), "custom");
assert.deepEqual(aclEntryKeys(mixed, "custom").allow, new Set([`c:${ME}`, `c:${OTHER}`]));

// Someone else's single-contact ACL is not "me".
assert.equal(aclModeFrom({ allow_cid: [OTHER] }, ME), "custom");
// Self plus anything else is a genuine custom ACL.
assert.equal(aclModeFrom({ allow_cid: [ME], allow_gid: ["g1"] }, ME), "custom");
assert.equal(aclModeFrom({ allow_cid: [ME], deny_cid: [OTHER] }, ME), "custom");

// public_policy wins over the columns.
assert.equal(aclModeFrom({ public_policy: "contacts", allow_cid: [ME] }, ME), "connections");

// Empty is public; a deny-only ACL is still a restriction and must not be
// downgraded to public, or the next save silently drops the deny list.
assert.equal(aclModeFrom({}, ME), "public");
assert.equal(aclModeFrom({ deny_cid: [OTHER] }, ME), "custom");
assert.deepEqual(aclEntryKeys({ deny_cid: [OTHER] }, "custom").deny, new Set([`c:${OTHER}`]));

// ── "Connections" on a row with no public_policy column (attach/photo) ───────
// It is written as the channel's default ACL, byte-identical to picking that
// group by hand, so only a match against the default can name it.
const FRIENDS = { allow_gid: ["friends-group-hash"] };

assert.equal(aclModeFrom(FRIENDS, ME), "custom", "no default given: unchanged");
assert.equal(aclModeFrom(FRIENDS, ME, FRIENDS), "connections");
// ...and no chips, so the group isn't offered for removal under a mode that
// doesn't own it.
assert.deepEqual(aclEntryKeys(FRIENDS, "connections"), { allow: new Set(), deny: new Set() });

// Order must not matter.
assert.equal(
  aclModeFrom({ allow_cid: [ME, OTHER] }, undefined, { allow_cid: [OTHER, ME] }),
  "connections",
);

// A different group is still custom.
assert.equal(aclModeFrom({ allow_gid: ["other-group"] }, ME, FRIENDS), "custom");
// A superset of the default is custom, not connections.
assert.equal(aclModeFrom({ allow_gid: ["friends-group-hash"], allow_cid: [OTHER] }, ME, FRIENDS), "custom");

// An EMPTY default must never swallow public — otherwise every public file on a
// channel with no default privacy group would read as "Connections".
const NO_DEFAULT = { allow_cid: [], allow_gid: [], deny_cid: [], deny_gid: [] };
assert.equal(aclModeFrom({}, ME, NO_DEFAULT), "public");
// "Only me" still wins over a default that happens to equal it.
assert.equal(aclModeFrom({ allow_cid: [ME] }, ME, { allow_cid: [ME] }), "me");

assert.equal(aclIsRestricted({}), false);
assert.equal(aclIsRestricted({ deny_gid: ["g"] }), true);

console.log("acl-mode: all assertions passed");
