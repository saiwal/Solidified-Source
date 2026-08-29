// Cross-column pointer drag for the kanban board.
//
// spa-core's createDragReorder is the same technique (a drag handle, window-
// level pointer listeners so the drag survives leaving the element, rect
// hit-testing rather than HTML5 drag events so touch works) but it reorders ONE
// flat list and commits one key order. A kanban move changes which list an item
// is in, so this keeps its own grouped state.
//
// The live grouping is exposed as `display()`; render from that, not from the
// source grouping, or the card won't follow the pointer.

import { createSignal, createMemo, onCleanup } from "solid-js";

export interface Column<T> {
  key: string;
  items: T[];
}

export interface KanbanDragApi<T> {
  display: () => Column<T>[];
  draggingKey: () => string | null;
  /** Ref for a column's card container. */
  registerColumn: (key: string) => (el: HTMLElement) => void;
  /** Ref for a rendered card. */
  registerCard: (key: string) => (el: HTMLElement) => void;
  /** onPointerDown for a card's drag handle — starts dragging immediately. */
  onHandlePointerDown: (item: T) => (e: PointerEvent) => void;
}

export function createKanbanDrag<T>(
  columns: () => Column<T>[],
  getKey: (item: T) => string,
  onCommit: (item: T, columnKey: string, index: number) => void,
): KanbanDragApi<T> {
  const [dragCols, setDragCols] = createSignal<Column<T>[] | null>(null);
  const [draggingKey, setDraggingKey] = createSignal<string | null>(null);
  const columnEls = new Map<string, HTMLElement>();
  const cardEls = new Map<string, HTMLElement>();
  let activeCleanup: (() => void) | null = null;
  onCleanup(() => activeCleanup?.());

  const display = createMemo(() => dragCols() ?? columns());

  const registerColumn = (key: string) => (el: HTMLElement) => { columnEls.set(key, el); };
  const registerCard = (key: string) => (el: HTMLElement) => { cardEls.set(key, el); };

  function columnAt(x: number, y: number): string | null {
    return columnKeyAt(
      [...columnEls].map(([key, el]) => ({ key, rect: el.getBoundingClientRect() })),
      x, y,
    );
  }

  function indexAt(items: T[], y: number): number {
    return insertIndex(items.map((it) => cardEls.get(getKey(it))?.getBoundingClientRect()), y);
  }

  function beginDrag(item: T) {
    const key = getKey(item);
    setDragCols(columns().map((c) => ({ key: c.key, items: [...c.items] })));
    setDraggingKey(key);
    document.body.style.userSelect = "none";

    let landing: { columnKey: string; index: number } | null = null;

    const onMove = (ev: PointerEvent) => {
      const current = dragCols();
      if (!current) return;
      const targetCol = columnAt(ev.clientX, ev.clientY);
      if (targetCol === null) return;

      const stripped = current.map((c) => ({
        key: c.key,
        items: c.items.filter((it) => getKey(it) !== key),
      }));
      const col = stripped.find((c) => c.key === targetCol)!;
      const index = indexAt(col.items, ev.clientY);
      col.items.splice(index, 0, item);
      landing = { columnKey: targetCol, index };

      const same = stripped.every((c, i) =>
        c.items.map(getKey).join(" ") === current[i].items.map(getKey).join(" "));
      if (!same) setDragCols(stripped);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
      activeCleanup = null;
      setDraggingKey(null);
      setDragCols(null);
      if (landing) onCommit(item, landing.columnKey, landing.index);
    };

    activeCleanup = onUp;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // A dedicated handle rather than dragging the whole card: the handle can
  // carry `touch-none` on its own, so a touch drag on the board still scrolls
  // the page everywhere else. Same reason NavItem has a grip.
  const onHandlePointerDown = (item: T) => (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    beginDrag(item);
  };

  return { display, draggingKey, registerColumn, registerCard, onHandlePointerDown };
}

// ── Pure geometry, split out so it can be tested without a DOM ────────────────

export interface Rect { left: number; right: number; top: number; height: number; width: number }

/** How far above/below a column still counts as being over it. */
const COLUMN_SLACK_PX = 80;

/** The column under the pointer, else the horizontally nearest one. */
export function columnKeyAt(
  cols: { key: string; rect: Rect }[],
  x: number,
  y: number,
): string | null {
  let nearest: string | null = null;
  let nearestDist = Infinity;
  for (const { key, rect: r } of cols) {
    if (x >= r.left && x <= r.right &&
        y >= r.top - COLUMN_SLACK_PX && y <= r.top + r.height + COLUMN_SLACK_PX) return key;
    const d = Math.abs(x - (r.left + r.width / 2));
    if (d < nearestDist) { nearestDist = d; nearest = key; }
  }
  return nearest;
}

/**
 * Insertion index: before the first card whose centre is below y. Cards with no
 * measured rect (never rendered, or mid-transition) count as passed rather than
 * stopping the scan, so a stale ref can't pin every drop to index 0.
 */
export function insertIndex(rects: (Rect | undefined)[], y: number): number {
  let index = 0;
  for (const r of rects) {
    if (r && y < r.top + r.height / 2) break;
    index++;
  }
  return index;
}
