// node --experimental-strip-types src/modules/inbox/useDragToFolder.test.ts
import assert from "node:assert";
import { dropTargetAt, DRAG_THRESHOLD_PX, SWIPE_COMMIT_PX, type Rect } from "./useDragToFolder.ts";

const r = (left: number, top: number, width = 180, height = 32): Rect =>
  ({ left, top, width, height });

const targets = [
  { name: "Work",    rect: r(0, 100) },
  { name: "Receipts", rect: r(0, 140) },
  { name: "Trash",   rect: r(0, 180) },
];

// Inside a target.
assert.equal(dropTargetAt(targets, 90, 110), "Work");
assert.equal(dropTargetAt(targets, 90, 150), "Receipts");
assert.equal(dropTargetAt(targets, 0, 180), "Trash", "edges are inclusive");
assert.equal(dropTargetAt(targets, 180, 212), "Trash", "far edges are inclusive");

// Outside every target → null, NOT the nearest one. Dropping a message in empty
// space must file it nowhere; this is the whole reason columnKeyAt isn't reused.
assert.equal(dropTargetAt(targets, 90, 135), null, "gap between targets");
assert.equal(dropTargetAt(targets, 400, 110), null, "right of the sidebar");
assert.equal(dropTargetAt(targets, 90, 10), null, "above every target");
assert.equal(dropTargetAt([], 90, 110), null, "no folders registered");

// A tap must stay a tap: the threshold has to be large enough to absorb the
// jitter of a finger press but small enough to feel like a drag.
assert.ok(DRAG_THRESHOLD_PX >= 4 && DRAG_THRESHOLD_PX <= 16);
assert.ok(SWIPE_COMMIT_PX > DRAG_THRESHOLD_PX, "a swipe must outlive the threshold");

console.log("useDragToFolder: ok");
