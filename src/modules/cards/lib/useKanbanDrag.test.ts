// node --experimental-strip-types src/modules/cards/lib/useKanbanDrag.test.ts
import assert from "node:assert";
import { columnKeyAt, insertIndex, type Rect } from "./useKanbanDrag.ts";

const r = (left: number, top: number, width = 100, height = 200): Rect =>
  ({ left, right: left + width, top, width, height });

// ── columnKeyAt ──────────────────────────────────────────────────────────────
const cols = [
  { key: "todo",  rect: r(0, 100) },
  { key: "doing", rect: r(120, 100) },
  { key: "done",  rect: r(240, 100) },
];
assert.equal(columnKeyAt(cols, 50, 150), "todo");
assert.equal(columnKeyAt(cols, 160, 150), "doing");
// Just above/below a column still counts as over it (drag toward the header).
assert.equal(columnKeyAt(cols, 160, 40), "doing");
// In the gutter between columns → nearest by x, not null.
assert.equal(columnKeyAt(cols, 110, 150), "todo");
assert.equal(columnKeyAt(cols, 235, 150), "done");
// Far below every column → still the nearest one, so a drop never vanishes.
assert.equal(columnKeyAt(cols, 250, 900), "done");
assert.equal(columnKeyAt([], 0, 0), null);

// ── insertIndex ──────────────────────────────────────────────────────────────
// Three stacked cards, 50px tall, at y = 0 / 50 / 100.
const stack = [r(0, 0, 100, 50), r(0, 50, 100, 50), r(0, 100, 100, 50)];
assert.equal(insertIndex(stack, 10), 0);   // above the first centre
assert.equal(insertIndex(stack, 30), 1);   // below the first centre
assert.equal(insertIndex(stack, 80), 2);
assert.equal(insertIndex(stack, 999), 3);  // past the end
assert.equal(insertIndex([], 42), 0);      // empty column
// An unmeasured card counts as passed, never as a wall that pins the drop to 0.
assert.equal(insertIndex([undefined, r(0, 100, 100, 50)], 200), 2);
assert.equal(insertIndex([undefined, r(0, 100, 100, 50)], 110), 1);

console.log("useKanbanDrag geometry ok");
