import { createSignal, createEffect, onCleanup, type JSX } from "solid-js";
import { useFloating } from "./useFloating";
import type { Placement, ReferenceElement } from "@floating-ui/dom";

// Open/close state + placement for a dropdown panel. Shared by SortSelect and
// ViewSwitcher, which both collapse into one on narrow screens.
//
// The panel is meant to render inside a <Portal mount={topLayer()}>, so it escapes the toolbar's
// `overflow-x-auto` and can flip/shift near the viewport edge instead of being
// clipped — @floating-ui does the positioning, same as Tooltip.tsx.
//
// Usage:
//   const pop = createPopover({ placement: "bottom-end" });
//   <div ref={pop.ref}> <button onClick={() => pop.setOpen(!pop.open())}/> </div>
//   <Show when={pop.open()}><Portal mount={topLayer()}>
//     <div ref={pop.floating} style={pop.style()}>…</div>
//   </Portal></Show>
export function createPopover(options: { placement?: Placement } = {}) {
  const [open, setOpen] = createSignal(false);
  const { x, y, positioned, mount, unmount } = useFloating({
    placement: options.placement ?? "bottom-start",
    offset: 4,
  });

  // The anchor doubles as the dismissal boundary; the portalled panel lives
  // outside it, so clicks in there have to be excluded separately.
  // A virtual anchor (a point) has no area, so every click outside the panel dismisses.
  let anchorEl: ReferenceElement | undefined;
  let floatEl: HTMLElement | undefined;

  const onPointer = (e: PointerEvent) => {
    const target = e.target as Node;
    if ((anchorEl instanceof Node && anchorEl.contains(target)) || floatEl?.contains(target)) return;
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };

  // SSR-safe: the primitive is renderable in the ui.check fixture, which has
  // no document. The client path is unchanged.
  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    });
  }

  // Solid runs render effects (the panel's ref) before user effects, so
  // floatEl is assigned by the time this fires after open() flips true.
  createEffect(() => {
    if (open() && anchorEl && floatEl) mount(anchorEl, floatEl);
    else unmount();
  });

  // Entrance on the rising edge of `positioned` — the panel is hidden until
  // then, so animating from mount would play most of it invisibly.
  createEffect(() => {
    if (!positioned() || !floatEl || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    floatEl.animate(
      [{ opacity: 0, transform: "scale(0.95)" }, { opacity: 1, transform: "scale(1)" }],
      { duration: 150, easing: "ease-out" },
    );
  });

  const style = (): JSX.CSSProperties => ({
    position: "fixed",
    top: `${y()}px`,
    left: `${x()}px`,
    // Placement resolves a frame after the panel mounts; without this it
    // paints once at the viewport origin on the way to its anchor.
    visibility: positioned() ? "visible" : "hidden",
  });

  return {
    open,
    setOpen,
    style,
    ref: (el: ReferenceElement) => { anchorEl = el; },
    floating: (el: HTMLElement) => { floatEl = el; },
  };
}
