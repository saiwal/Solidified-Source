import { createSignal, createEffect, onCleanup } from "solid-js";
import { useFloating, type UseFloatingOptions } from "./useFloating";

/**
 * Composable for button→panel dropdowns.
 * Combines open state, floating-ui positioning, and click-outside dismissal.
 *
 * Usage:
 *   const { open, toggle, setOpen, floatStyle, setTriggerRef, setPanelRef } =
 *     useDropdown({ placement: "bottom-start" });
 *
 *   <button ref={setTriggerRef} onClick={toggle}>…</button>
 *   <Presence>
 *     <Show when={open()}>
 *       <Motion.div ref={(el) => setPanelRef(el)} style={floatStyle()} …>…</Motion.div>
 *     </Show>
 *   </Presence>
 */
export function useDropdown(options: UseFloatingOptions = {}) {
  const [open, setOpen] = createSignal(false);

  // Signals, not plain variables: a panel whose content is `lazy()` resolves
  // asynchronously, so its ref can land *after* this effect has already run.
  // With a plain variable nothing re-triggers it, mount() never happens, and
  // the panel sits at the viewport's top-left corner forever.
  const [triggerEl, setTriggerEl] = createSignal<Element>();
  const [panelEl, setPanelEl] = createSignal<HTMLElement>();

  const { x, y, positioned, mount, unmount } = useFloating(options);

  createEffect(() => {
    const trigger = triggerEl();
    const panel = panelEl();
    if (open() && trigger && panel) mount(trigger, panel);
    else unmount();
  });

  // Only listen while open — list views mount one of these per row.
  createEffect(() => {
    if (!open()) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerEl()?.contains(t) && !panelEl()?.contains(t)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    onCleanup(() => document.removeEventListener("click", onDocClick));
  });

  return {
    open,
    setOpen,
    toggle: () => setOpen((o) => !o),
    x,
    y,
    // useFloating also exposes `positioned` for hiding the pre-placement frame.
    // Deliberately NOT folded into floatStyle: if positioning never completes
    // the panel becomes invisible with no clue why, which is far harder to
    // diagnose than a panel that is briefly in the wrong place.
    positioned,
    floatStyle: () =>
      ({ position: "fixed" as const, top: `${y()}px`, left: `${x()}px` }),
    setTriggerRef: (el: Element) => setTriggerEl(el),
    setPanelRef: (el: HTMLElement) => setPanelEl(el),
  };
}
