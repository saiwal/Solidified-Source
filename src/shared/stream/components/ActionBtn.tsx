// src/shared/stream/components/ActionBtn.tsx
// A reaction button (icon + count) and its click "pop". Shared by PostCard's
// action bar and the article reading page, so reactions look and feel the
// same everywhere.
import { Show, createSignal, onCleanup, type JSX } from "solid-js";

// Two-tap guard for actions that publish (repeat): the first tap arms — the
// caller shows a tick in place — and only a second tap within `ms` runs it.
export function createConfirmTap(ms = 3000) {
  const [armed, setArmed] = createSignal(false);
  let timer: number | undefined;
  onCleanup(() => clearTimeout(timer));
  const tap = (fn: () => void) => {
    clearTimeout(timer);
    if (armed()) { setArmed(false); fn(); return; }
    setArmed(true);
    timer = window.setTimeout(() => setArmed(false), ms);
  };
  return [armed, tap] as const;
}

// Click feedback on a reaction icon. WAAPI rather than a CSS class so it
// replays on every click; callers pass a stable wrapper, since the icon inside
// swaps outline → filled and a replaced node would drop the animation.
export function pop(el: Element | null | undefined, spin = false) {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // 72deg = one star point, so the spin lands on an identical-looking star.
  el.animate(
    [
      { transform: "scale(1) rotate(0)" },
      { transform: `scale(1.4) rotate(${spin ? 36 : 0}deg)` },
      { transform: `scale(1) rotate(${spin ? 72 : 0}deg)` },
    ],
    { duration: 350, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

export default function ActionBtn(props: {
  icon: JSX.Element;
  count: number;
  label: string;
  onClick: () => void;
  active?: boolean;
  activeClass: string;
}) {
  return (
    <button
      onClick={(e) => { pop(e.currentTarget.firstElementChild); props.onClick(); }}
      title={props.label}
      class={`flex items-center gap-1 wide:gap-1.5 px-2 wide:px-3 py-1.5 rounded-lg text-sm font-medium
              transition-colors select-none hover:bg-overlay
              ${props.active ? props.activeClass : "text-muted"}`}
    >
      <span class="inline-flex">{props.icon}</span>
      <Show when={props.count > 0}><span>{props.count}</span></Show>
    </button>
  );
}
