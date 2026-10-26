import { createSignal, onCleanup } from "solid-js";
import { computePosition, autoUpdate, flip, shift, offset, size } from "@floating-ui/dom";
import type { Placement, ReferenceElement } from "@floating-ui/dom";

export interface UseFloatingOptions {
  placement?: Placement;
  /** Gap between reference and floating element in px. Default: 8 */
  offset?: number;
}

/**
 * Solid composable that positions a floating element relative to a reference.
 *
 * Usage:
 *   const { x, y, placement, positioned, mount, unmount } = useFloating({ placement: "top" });
 *
 *   // Call mount() once both elements are in the DOM:
 *   mount(referenceEl, floatingEl);
 *
 *   // Apply position (visibility guards the pre-placement frame):
 *   style={{
 *     position: "fixed", top: `${y()}px`, left: `${x()}px`,
 *     visibility: positioned() ? "visible" : "hidden",
 *   }}
 */
export function useFloating(options: UseFloatingOptions = {}) {
  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(0);
  const [placement, setPlacement] = createSignal<Placement>(
    options.placement ?? "bottom",
  );
  // computePosition is async, so x/y are still 0,0 for the frame after mount().
  // Anything rendered in that frame flashes at the top-left of the viewport —
  // hide the floating element (visibility, not display, so it stays
  // measurable) until this turns true.
  const [positioned, setPositioned] = createSignal(false);

  let stopUpdate: (() => void) | undefined;

  // A virtual reference ({ getBoundingClientRect }) anchors to a point — ContextMenu.
  function mount(reference: ReferenceElement, floating: HTMLElement) {
    stopUpdate?.();
    setPositioned(false);
    stopUpdate = autoUpdate(reference, floating, async () => {
      const pos = await computePosition(reference, floating, {
        placement: options.placement ?? "bottom",
        middleware: [
          offset(options.offset ?? 8), flip(), shift({ padding: 8 }),
          // Exposes the room left on the chosen side so a tall panel (a menu
          // with many channels) can cap itself and scroll instead of running
          // off-screen: max-h-(--float-max-h).
          size({
            padding: 8,
            apply: ({ availableHeight, elements }) =>
              elements.floating.style.setProperty("--float-max-h", `${availableHeight}px`),
          }),
        ],
      });
      setX(pos.x);
      setY(pos.y);
      setPlacement(pos.placement);
      setPositioned(true);
    });
  }

  function unmount() {
    stopUpdate?.();
    stopUpdate = undefined;
    setPositioned(false);
  }

  onCleanup(unmount);
  return { x, y, placement, positioned, mount, unmount };
}
