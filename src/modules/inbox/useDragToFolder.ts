// One pointer gesture on an inbox row, two outcomes: drag it onto a folder in
// the sidebar, or swipe it sideways for trash/star on a phone. Same listeners,
// the axis of the first 8px decides which.
//
// Native pointer events rather than HTML5 drag-and-drop, for the same reason as
// useDragReorder/useKanbanDrag: HTML5 DnD does not fire on touch.
//
// The drop targets are sidebar items rendered by InboxView, while the drag
// starts in MessageList - two components with no shared ancestor that accepts
// refs (SubPageLayout has no per-item ref API). Hence a module-level registry
// rather than prop drilling.
import { createSignal, onCleanup } from "solid-js";

export const DRAG_THRESHOLD_PX = 8;
/** How far a row must travel sideways before the swipe commits. */
export const SWIPE_COMMIT_PX = 80;

export interface Rect {
  left: number; top: number; width: number; height: number;
}

const targets = new Map<string, HTMLElement>();

/** The folder row the pointer is currently over, for the sidebar highlight. */
export const [hoverFolder, setHoverFolder] = createSignal<string | null>(null);

/** What to draw under the cursor while dragging, and where. Module-level
 *  because the chip is rendered by InboxView (a <Portal mount={topLayer()}>, so it isn't clipped
 *  by the list's own scroll container) while the drag starts in MessageList. */
export interface DragPreview { label: string; count: number; x: number; y: number }
export const [dragPreview, setDragPreview] = createSignal<DragPreview | null>(null);

/** Ref callback factory for a folder drop target. Returns its own cleanup. */
export function registerDropTarget(name: string, el: HTMLElement): () => void {
  targets.set(name, el);
  return () => {
    if (targets.get(name) === el) targets.delete(name);
  };
}

/**
 * Which target contains the point, or null. Strict containment on purpose -
 * useKanbanDrag's columnKeyAt falls back to the nearest column because a card
 * must always land somewhere, but a message dropped in empty space must not be
 * filed into whichever folder happened to be closest.
 */
export function dropTargetAt(
  rects: { name: string; rect: Rect }[], x: number, y: number,
): string | null {
  for (const { name, rect: r } of rects) {
    if (x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height) return name;
  }
  return null;
}

export interface RowDragOptions {
  /** Dropped on a folder. */
  onDropFolder: (name: string, id: string) => void;
  /** Label + how many rows the drag is carrying, for the cursor chip. */
  describe?: (id: string) => { label: string; count: number };
  /** Swiped far enough left (trash) / right (star). Omit to disable swiping. */
  onSwipeLeft?: (id: string) => void;
  onSwipeRight?: (id: string) => void;
  swipeEnabled?: () => boolean;
}

export function createRowDrag(opts: RowDragOptions) {
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [hoverTarget, setHoverTarget] = createSignal<string | null>(null);
  const [swipe, setSwipe] = createSignal<{ id: string; dx: number } | null>(null);
  // A gesture that moved must not also fire the row's click handler. Cleared on
  // the next pointerdown rather than on a timer.
  let moved = false;
  let cleanup: (() => void) | null = null;
  onCleanup(() => cleanup?.());

  function onRowPointerDown(id: string) {
    return (e: PointerEvent) => {
      // Let buttons inside the row (star, trash, checkbox) work normally.
      if (e.button !== 0 || (e.target as HTMLElement).closest("button,a,input")) return;
      moved = false;
      const startX = e.clientX;
      const startY = e.clientY;
      let axis: "x" | "y" | null = null;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!axis) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          axis = Math.abs(dx) > Math.abs(dy) && (opts.swipeEnabled?.() ?? false) ? "x" : "y";
          moved = true;
          if (axis === "y") {
            setDraggingId(id);
            document.body.style.userSelect = "none";
            const d = opts.describe?.(id);
            setDragPreview({ label: d?.label ?? "", count: d?.count ?? 1, x: ev.clientX, y: ev.clientY });
          }
        }
        if (axis === "x") {
          setSwipe({ id, dx });
        } else {
          const rects = [...targets].map(([name, el]) => ({ name, rect: el.getBoundingClientRect() }));
          const hit = dropTargetAt(rects, ev.clientX, ev.clientY);
          setHoverTarget(hit);
          setHoverFolder(hit);
          setDragPreview((p) => (p ? { ...p, x: ev.clientX, y: ev.clientY } : p));
        }
      };

      const onUp = () => {
        end();
        if (axis === "x") {
          const dx = swipe()?.dx ?? 0;
          if (dx <= -SWIPE_COMMIT_PX) opts.onSwipeLeft?.(id);
          else if (dx >= SWIPE_COMMIT_PX) opts.onSwipeRight?.(id);
        } else if (axis === "y") {
          const target = hoverTarget();
          if (target) opts.onDropFolder(target, id);
        }
        setSwipe(null);
        setDraggingId(null);
        setHoverTarget(null);
        setHoverFolder(null);
        setDragPreview(null);
      };

      function end() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.userSelect = "";
        cleanup = null;
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      cleanup = end;
    };
  }

  return {
    onRowPointerDown,
    draggingId,
    hoverTarget,
    /** Live horizontal offset for the swiped row, 0 for every other row. */
    swipeOffset: (id: string) => (swipe()?.id === id ? swipe()!.dx : 0),
    /** True when the gesture that just ended was a drag rather than a tap —
     *  reading it clears the flag, so the click it suppresses is the one that
     *  browsers fire immediately after the drag's pointerup. */
    takeDragFlag: () => {
      const was = moved;
      moved = false;
      return was;
    },
  };
}
