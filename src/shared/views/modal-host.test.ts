// node --experimental-strip-types src/shared/editor/store/modal-host.test.ts
import assert from "node:assert/strict";

const store = await import("./modal-host.ts");
const { findByScope, enforceModeRules, isExpanded, MAX_DOCKED } = store;
type Mode = import("./modal-host.ts").ComposerMode;
type Holder = import("./modal-host.ts").ModeHolder;

function holder(id: string, scope: string, start: Mode): Holder {
  let m = start;
  return { id, scope, mode: () => m, setMode: (next) => void (m = next) };
}

// ── findByScope: one composer per draft scope ────────────────────────────────
const list = [holder("a", "post:new", "modal"), holder("b", "article:x1", "dock")];
assert.equal(findByScope(list, "article:x1")?.id, "b");
assert.equal(findByScope(list, "post:reply:7"), undefined);

// ── enforceModeRules: modal/page are exclusive, docks coexist ───────────────
const post = holder("a", "post:new", "modal");
const article = holder("b", "article:x1", "page");
const note = holder("c", "note:new", "min");
enforceModeRules([post, article, note], "b");

assert.equal(article.mode(), "page", "the changed entry is untouched");
assert.equal(post.mode(), "min", "a screen-filling mode evicts every sibling");
assert.equal(post.restoreTo, "modal", "…and a pill click returns it to modal");
assert.equal(note.mode(), "min");
assert.equal(note.restoreTo, undefined, "an already-minimized entry is not re-stamped");

// A docked panel tolerates another dock but still evicts modal/page.
const d1 = holder("d1", "post:new", "dock");
const d2 = holder("d2", "dm:new", "dock");
const big = holder("m", "card:new", "modal");
enforceModeRules([d1, big, d2], "d2");
assert.equal(d1.mode(), "dock", "two docks sit side by side");
assert.equal(d2.mode(), "dock");
assert.equal(big.mode(), "min", "a modal is not allowed beside a dock");

// A third dock pushes the oldest off the rail.
assert.equal(MAX_DOCKED, 2);
const d3 = holder("d3", "note:new", "dock");
enforceModeRules([d1, d2, d3], "d3");
assert.deepEqual(
  [d1, d2, d3].filter((e) => e.mode() === "dock").map((e) => e.id),
  ["d2", "d3"],
  "the newest MAX_DOCKED survive",
);
assert.equal(d1.restoreTo, "dock");

// Evicting works even when the entry that changed is the oldest one.
const o1 = holder("o1", "a", "dock");
const o2 = holder("o2", "b", "dock");
const o3 = holder("o3", "c", "dock");
enforceModeRules([o1, o2, o3], "o1");
assert.deepEqual(
  [o1, o2, o3].filter((e) => e.mode() === "dock").map((e) => e.id),
  ["o1", "o3"],
);

// Enforcing around a minimized entry changes nothing — it is not competing for
// the screen, so it has no claim to press.
enforceModeRules([post, article, note], "c");
assert.equal(article.mode(), "page");
assert.deepEqual(
  [post, article, note].filter((e) => isExpanded(e.mode())).map((e) => e.id),
  ["b"],
);

// ── The live registry (same module; it imports solid-js only) ────────────────
const spec = (scope: string) => ({
  kind: "post" as const,
  scope,
  title: scope,
  props: {},
});

const idA = store.openComposer(spec("post:new"));
assert.equal(store.composerEntries().length, 1);
assert.equal(store.composerEntries()[0].mode(), "modal");

const idB = store.openComposer(spec("article:x1"));
const byId = (id: string) => store.composerEntries().find((e) => e.id === id)!;
assert.equal(byId(idA).mode(), "min", "opening a second composer minimizes the first");
assert.equal(byId(idB).mode(), "modal");

// Reopening a live scope must not create a second composer on the same
// draft:<scope> IDB key — it surfaces the existing one.
assert.equal(store.openComposer(spec("post:new")), idA);
assert.equal(store.composerEntries().length, 2);
assert.equal(byId(idA).mode(), "modal", "…restored to whatever it was before");
assert.equal(byId(idB).mode(), "min");

// Reopening an expanded composer brings it forward without changing its mode.
store.setComposerMode(idA, "dock");
assert.equal(store.openComposer(spec("post:new")), idA);
assert.equal(byId(idA).mode(), "dock");

// Two docks share the rail, and minimizing one demotes nobody.
store.setComposerMode(idB, "dock");
assert.equal(byId(idA).mode(), "dock", "both stay docked, side by side");
store.setComposerMode(idB, "min");
assert.equal(byId(idA).mode(), "dock", "minimizing one leaves the other docked");
store.restoreComposer(idB);
assert.equal(byId(idB).mode(), "dock", "a pill returns to the mode it was docked in");

// Escape on a pill (ComposerModal binds one per mounted composer) must not
// overwrite what that pill restores to.
store.setComposerMode(idB, "min");
assert.equal(byId(idB).restoreTo, "dock");

// The load-bearing invariant: a mode change must not replace the entry object,
// or <For> (keyed on identity) remounts the composer and the editor state dies.
const ref = byId(idA);
store.setComposerMode(idA, "page");
assert.equal(byId(idA), ref, "entry identity survives a mode change");

store.closeComposer(idA);
assert.deepEqual(store.composerEntries().map((e) => e.id), [idB]);
// idB was demoted to a pill when idA went to "page", and closing idA does not
// promote anybody — the dock is left as the user last saw it.
assert.equal(byId(idB).mode(), "min");
assert.equal(byId(idB).restoreTo, "dock", "…but it still remembers its mode");

// ── openPost: one viewer per post, opened in the post pref, not the composer's ──
store.setDefaultComposerMode("modal");
store.setDefaultPostMode("dock");
const p1 = store.openPost("u1");
assert.equal(store.openPost("u1"), p1, "reopening a post focuses the live viewer");
assert.equal(byId(p1).kind, "thread");
assert.equal(byId(p1).mode(), "dock", "a post follows defaultPostMode");
store.closeComposer(p1);

console.log("modal-host: ok");
