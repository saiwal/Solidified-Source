// node --experimental-strip-types packages/spa-core/src/lib/dialog-mode.test.ts
import assert from "node:assert";
import { createDialogMode, type DialogLike } from "./dialog-mode.ts";

// A <dialog> stand-in that reproduces the one detail that matters: close()
// returns immediately and the `close` event arrives on a later task.
function fakeDialog() {
  const queue: (() => void)[] = [];
  let open = false;
  let onClose = () => {};
  const d = {
    get open() { return open; },
    close() { open = false; queue.push(() => onClose()); },
    show() { open = true; },
    showModal() { open = true; },
    modal: false,
  };
  d.show = () => { open = true; d.modal = false; };
  d.showModal = () => { open = true; d.modal = true; };
  return {
    d: d as DialogLike & { modal: boolean },
    setOnClose: (fn: () => void) => { onClose = fn; },
    /** Let every queued close event fire, as the event loop would. */
    flush: () => { while (queue.length) queue.shift()!(); },
    /** A dismissal the user caused: Escape, backdrop, a close button. */
    userClose: () => { open = false; queue.push(() => onClose()); },
  };
}

let dismissed = 0;
const { d, setOnClose, flush, userClose } = fakeDialog();
const m = createDialogMode(() => d, () => { dismissed++; });
setOnClose(() => m.handleClose());

// opens non-modal (the composer's docked mode)
m.sync(false);
assert.equal(d.open, true);
assert.equal(d.modal, false);
flush();
assert.equal(dismissed, 0, "opening is not a dismissal");

// docked -> modal: the close event lands a task later and must not dismiss
m.sync(true);
assert.equal(d.open, true, "still open after the switch");
assert.equal(d.modal, true, "now modal");
flush();
assert.equal(dismissed, 0, "switching modality is not a dismissal");

// same modality twice is a no-op, so no stray close is queued
m.sync(true);
flush();
assert.equal(dismissed, 0);
assert.equal(d.open, true);

// modal -> non-modal and straight back, before any event fires: the count,
// not a boolean, is what keeps both of them from reading as dismissals
m.sync(false);
m.sync(true);
flush();
assert.equal(dismissed, 0, "rapid switches all suppressed");
assert.equal(d.open, true);

// a real dismissal still gets through
userClose();
flush();
assert.equal(dismissed, 1, "Escape/backdrop/close button dismisses");

// unmount while open is not a dismissal either
m.sync(true);
flush();
m.teardown();
flush();
assert.equal(dismissed, 1, "unmount is not a dismissal");

console.log("dialog-mode: ok");
