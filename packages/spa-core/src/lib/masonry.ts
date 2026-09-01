import { createEffect, createSignal, onCleanup } from "solid-js";

/** Distributes items round-robin across n columns (item i -> column i % n).
 * Because the source order is preserved within each column, this reads
 * left-to-right, top-to-bottom across columns of uneven height, without a
 * height-measuring packing pass. */
export function splitIntoColumns<T>(items: T[], n: number): T[][] {
  const cols: T[][] = Array.from({ length: n }, () => []);
  items.forEach((item, i) => cols[i % n]!.push(item));
  return cols;
}

// Settings' "large"/"xl" font sizes (see typography.ts FONT_SIZES) are
// 18px/21px root; below that (small/medium, 14-16px) the container-width
// math alone decides. This is an explicit, predictable cap layered on top
// of it — rather than tuning minColumnRem until the width math happens to
// land on the desired count — so "3 columns at large, 2 at xl" holds on
// any screen width, not just the ones we tested.
function fontSizeColumnCap(rootPx: number, maxColumns: number): number {
  if (rootPx >= 21) return Math.min(maxColumns, 2);
  if (rootPx >= 18) return Math.min(maxColumns, 3);
  return maxColumns;
}

/** Reactive column count derived from an actual container element's width
 * via ResizeObserver — not window.innerWidth, which counts the nav/sidebar
 * chrome outside the container and so overestimates the space widgets
 * actually have. `minColumnRem` (multiplied by the current root font-size)
 * is the narrowest a column may get before the count drops further; on top
 * of that, larger font-size settings cap the count outright (see
 * `fontSizeColumnCap`). `el` may start out undefined (not yet mounted) —
 * the effect re-observes once it resolves. */
export function useColumnCount(
  el: () => HTMLElement | undefined,
  minColumnRem: number,
  maxColumns: number,
): () => number {
  const [count, setCount] = createSignal(1);
  createEffect(() => {
    const node = el();
    if (!node) return;
    const compute = (widthPx: number) => {
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const cap = fontSizeColumnCap(rootPx, maxColumns);
      const n = Math.floor(widthPx / (minColumnRem * rootPx));
      setCount(Math.max(1, Math.min(cap, n)));
    };
    compute(node.getBoundingClientRect().width);
    const obs = new ResizeObserver(([entry]) => compute(entry.contentRect.width));
    obs.observe(node);
    onCleanup(() => obs.disconnect());
  });
  return count;
}

/**
 * Tight (masonry) packing for the widget grid slots, as a Solid directive.
 *
 * A plain CSS grid makes every row as tall as its tallest cell, so a short
 * widget beside a tall one leaves a gap underneath it. The fix is the standard
 * grid-masonry technique: give the container 1px auto-rows and no row gap,
 * then have each item span as many rows as it is tall (plus the gap it owns as
 * a bottom margin). With `grid-auto-flow: dense` the browser then slots later
 * items up into those gaps, so columns pack independently the way the old
 * gridTop flex columns did — except this still honours an item's column span,
 * which flex columns could not.
 *
 * The row count is written as `--rows` on the element and consumed by the
 * `.slot-grid > *` rule in index.css. Measurement is a ResizeObserver, so it
 * re-packs on content changes, font-size changes and container resizes alike.
 *
 * ponytail: one observer per item. Slots hold well under a dozen widgets; if a
 * slot ever gets big, share a single observer across the grid's children.
 */
export function rowSpan(el: HTMLElement, accessor: () => number | undefined) {
  // Slots that aren't grids pass undefined — nothing to measure, and no
  // observer to pay for.
  const gap = accessor();
  if (gap === undefined) return;
  const measure = () => {
    // ceil so a fractional height never clips the last pixel of content
    const rows = Math.max(1, Math.ceil(el.getBoundingClientRect().height + gap));
    el.style.setProperty("--rows", String(rows));
  };
  const obs = new ResizeObserver(measure);
  obs.observe(el);
  onCleanup(() => obs.disconnect());
}

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      rowSpan: number | undefined;
    }
  }
}
