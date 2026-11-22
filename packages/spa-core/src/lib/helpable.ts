// src/shared/lib/helpable.ts
import { onCleanup } from "solid-js";
import { useHelpMode } from "../store/help-mode";

const targets = new WeakMap<Element, () => string | undefined>();

/** The innermost element with a live help target under an event — nested
 *  targets (a button in a widget in a page) must open the most specific
 *  help, not the outermost. One whose target is empty doesn't count. */
function innermost(e: Event): Element | null {
  for (let n = e.target as Element | null; n; n = n.parentElement) if (targets.get(n)?.()) return n;
  return null;
}

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
    // Capture phase runs outermost first: leave the click to a nested target.
    if (innermost(e) !== el) return;
    e.preventDefault();
    e.stopPropagation();
    pick(t);
  };

  // Controls that act on press (toolbar buttons fire on mousedown so the
  // editor keeps focus) would run before the click is caught — swallow it.
  const onPress = (e: Event) => {
    if (!helpMode() || innermost(e) !== el) return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Only undo what we set, so an element's own inline styles survive.
  let lit = false;
  const clear = () => {
    if (!el || !lit) return;
    lit = false;
    el.style.outline = "";
    el.style.outlineOffset = "";
    el.style.borderRadius = "";
    el.style.cursor = "";
  };

  // mouseover (not mouseenter) so the outline moves to a nested target and
  // back as the pointer crosses into and out of it.
  const onMouseOver = (e: MouseEvent) => {
    if (!helpMode() || !el || innermost(e) !== el) return clear();
    lit = true;
    el.style.outline = "2px solid #60a5fa";
    el.style.outlineOffset = "2px";
    el.style.borderRadius = "6px";
    el.style.cursor = "help";
  };

  onCleanup(() => {
    el?.removeEventListener("click", onClick, true);
    el?.removeEventListener("mousedown", onPress, true);
    el?.removeEventListener("pointerdown", onPress, true);
    el?.removeEventListener("mouseover", onMouseOver);
    el?.removeEventListener("mouseleave", clear);
  });

  return (node: HTMLElement) => {
    el = node;
    targets.set(node, target);
    node.addEventListener("click", onClick, true);
    node.addEventListener("mousedown", onPress, true);
    node.addEventListener("pointerdown", onPress, true);
    node.addEventListener("mouseover", onMouseOver);
    node.addEventListener("mouseleave", clear);
  };
}
