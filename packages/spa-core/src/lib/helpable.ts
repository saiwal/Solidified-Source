// src/shared/lib/helpable.ts
import { onCleanup } from "solid-js";
import { useHelpMode } from "../store/help-mode";

/**
 * Ref factory: `<div ref={helpable(() => "nav.panel")}>` makes the element a
 * help-mode pick target. Setup (context, cleanup) runs when called during
 * render; the returned callback only attaches to the element — the shape
 * Solid 2 ref directives take.
 */
export function helpable(target: () => string | undefined) {
  const { helpMode, pick } = useHelpMode();
  let el: HTMLElement | undefined;

  const onClick = (e: MouseEvent) => {
    if (!helpMode()) return;
    // An empty/undefined target (e.g. an optional helpTarget prop a caller
    // didn't set) means this element opted out — let the click behave
    // normally instead of swallowing it for a no-op pick().
    const t = target();
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    pick(t);
  };

  const onMouseEnter = () => {
    if (!helpMode() || !el) return;
    el.style.outline = "2px solid #60a5fa";
    el.style.outlineOffset = "2px";
    el.style.borderRadius = "6px";
    el.style.cursor = "help";
  };

  const onMouseLeave = () => {
    if (!el) return;
    el.style.outline = "";
    el.style.outlineOffset = "";
    el.style.borderRadius = "";
    el.style.cursor = "";
  };

  onCleanup(() => {
    el?.removeEventListener("click", onClick, true);
    el?.removeEventListener("mouseenter", onMouseEnter);
    el?.removeEventListener("mouseleave", onMouseLeave);
  });

  return (node: HTMLElement) => {
    el = node;
    node.addEventListener("click", onClick, true);
    node.addEventListener("mouseenter", onMouseEnter);
    node.addEventListener("mouseleave", onMouseLeave);
  };
}
