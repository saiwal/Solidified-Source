import { createSignal, createEffect, onCleanup, type JSX } from "solid-js";
import { useFloating } from "@utsukta/spa-core/lib/useFloating";
import type { Placement } from "@floating-ui/dom";

// Open/close state + placement for a dropdown panel. Shared by SortSelect and
// ViewSwitcher, which both collapse into one on narrow screens.
//
// The panel is meant to render inside a <Portal>, so it escapes the toolbar's
// `overflow-x-auto` and can flip/shift near the viewport edge instead of being
// clipped — @floating-ui does the positioning, same as Tooltip.tsx.
//
// Usage:
//   const pop = createPopover({ placement: "bottom-end" });
//   <div ref={pop.ref}> <button onClick={() => pop.setOpen(!pop.open())}/> </div>
//   <Show when={pop.open()}><Portal>
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
  let anchorEl: HTMLElement | undefined;
  let floatEl: HTMLElement | undefined;

  const onPointer = (e: PointerEvent) => {
    const target = e.target as Node;
    if (anchorEl?.contains(target) || floatEl?.contains(target)) return;
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };

  document.addEventListener("pointerdown", onPointer);
  document.addEventListener("keydown", onKey);
  onCleanup(() => {
    document.removeEventListener("pointerdown", onPointer);
    document.removeEventListener("keydown", onKey);
  });

  // Solid runs render effects (the panel's ref) before user effects, so
  // floatEl is assigned by the time this fires after open() flips true.
  createEffect(() => {
    if (open() && anchorEl && floatEl) mount(anchorEl, floatEl);
    else unmount();
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
    ref: (el: HTMLElement) => { anchorEl = el; },
    floating: (el: HTMLElement) => { floatEl = el; },
  };
}
