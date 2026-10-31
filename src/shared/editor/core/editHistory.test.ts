// node --experimental-strip-types src/shared/editor/core/editHistory.test.ts
import assert from "node:assert";
import { createEditHistory, type Snapshot } from "./editHistory.ts";

const s = (body: string): Snapshot => ({ body, mode: "source", sel: null });

// Typing within the pause window is one step; a pause starts a new one.
let h = createEditHistory();
h.change(s(""), true, 0);
h.change(s("a"), true, 100);
h.change(s("ab"), true, 200);
h.change(s("abc"), true, 2000); // paused > 700ms
assert.equal(h.undo(s("abcd"))?.body, "abc");
assert.equal(h.undo(s("abc"))?.body, "");
assert.equal(h.undo(s("")), null);
assert.equal(h.redo(s(""))?.body, "abc");
assert.equal(h.redo(s("abc"))?.body, "abcd");
assert.equal(h.canRedo(), false);

// A non-typing change (toolbar, insert) is always its own step, and breaks a burst.
h = createEditHistory();
h.change(s(""), true, 0);
h.change(s("x"), false, 50);
h.change(s("[b]x[/b]"), true, 100);
assert.equal(h.undo(s("[b]x[/b]y"))?.body, "[b]x[/b]");
assert.equal(h.undo(s("[b]x[/b]"))?.body, "x");
assert.equal(h.undo(s("x"))?.body, "");

// A long unbroken burst is still split.
h = createEditHistory();
for (let t = 0; t <= 4000; t += 100) h.change(s(String(t)), true, t);
assert.ok(h.undo(s("end"))?.body !== "0", "burst capped");

// A new change after undo drops the redo branch.
h = createEditHistory();
h.change(s("a"), false, 0);
h.undo(s("b"));
h.change(s("a"), false, 10);
assert.equal(h.canRedo(), false);

// Limit.
h = createEditHistory({ limit: 3 });
for (let i = 0; i < 10; i++) h.change(s(String(i)), false, i);
let n = 0;
while (h.undo(s("cur"))) n++;
assert.equal(n, 3);

console.log("editHistory: ok");
