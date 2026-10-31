/**
 * The composer's own undo/redo stack.
 *
 * The browser's native undo can't serve here: the source tab's toolbar
 * actions assign the textarea's value, the WYSIWYG surface is re-rendered
 * from the body on blur and on every external change (attachment insert,
 * draft load), and either one wipes the native history. So RichEditor records
 * the *body* — the one thing that survives all of those — plus where the
 * caret was, and restores both.
 *
 * Typing coalesces: a run of changes with no pause longer than `pauseMs`
 * (and no longer than `burstMs` in total) is one undo step. Anything that
 * isn't typing — a toolbar action, an insert, a list Tab — is always its own.
 */

export interface Snapshot {
  body: string;
  /** Which surface the caret offsets belong to; a mismatch drops them. */
  mode: "wysiwyg" | "source";
  /** Text offsets (WYSIWYG) or textarea selection (source); null = end. */
  sel: [number, number] | null;
}

export function createEditHistory(opts: { limit?: number; pauseMs?: number; burstMs?: number } = {}) {
  const limit = opts.limit ?? 100;
  const pauseMs = opts.pauseMs ?? 700;
  const burstMs = opts.burstMs ?? 3000;
  const past: Snapshot[] = [];
  let future: Snapshot[] = [];
  let lastChange = -Infinity;
  let burstStart = -Infinity;

  return {
    /**
     * The body changed from `prev`. Pushes `prev` as an undo step unless this
     * change continues the current typing burst.
     */
    change(prev: Snapshot, typing: boolean, now = Date.now()) {
      const continues = typing && now - lastChange < pauseMs && now - burstStart < burstMs;
      if (!continues) {
        if (past[past.length - 1]?.body !== prev.body) {
          past.push(prev);
          if (past.length > limit) past.shift();
        }
        burstStart = now;
      }
      lastChange = typing ? now : -Infinity;
      future = [];
    },
    /** Step back from `cur`; null when there is nothing to undo. */
    undo(cur: Snapshot): Snapshot | null {
      const s = past.pop();
      if (!s) return null;
      future.push(cur);
      lastChange = -Infinity;
      return s;
    },
    redo(cur: Snapshot): Snapshot | null {
      const s = future.pop();
      if (!s) return null;
      past.push(cur);
      lastChange = -Infinity;
      return s;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}

export type EditHistory = ReturnType<typeof createEditHistory>;
