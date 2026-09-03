import { createSignal, Show, createEffect, type ParentComponent } from "solid-js";
import { Portal } from "solid-js/web";
import { motion } from "solid-motionone";
import { useFloating } from "@utsukta/spa-core/lib/useFloating";
import type { Placement } from "@floating-ui/dom";

// Keep `motion` directive alive for tree-shaking
void motion;

export interface TooltipProps {
  content: string;
  placement?: Placement;
  /** Extra CSS classes on the floating element */
  class?: string;
}

/**
 * Tooltip — Portal-mounted, positioned by @floating-ui/dom,
 * animated in by solid-motionone's `use:motion` directive.
 *
 * Usage:
 *   <Tooltip content="Help text" placement="top">
 *     <button>Hover me</button>
 *   </Tooltip>
 */
const Tooltip: ParentComponent<TooltipProps> = (props) => {
  const [visible, setVisible] = createSignal(false);
  const { x, y, positioned, mount, unmount } = useFloating({
    placement: props.placement ?? "top",
    offset: 6,
  });

  let triggerEl!: HTMLSpanElement;
  let floatEl: HTMLDivElement | undefined;

  // Solid runs render effects before user effects, so floatEl is assigned
  // by the time this effect fires after visible() becomes true.
  createEffect(() => {
    if (visible() && floatEl) {
      mount(triggerEl, floatEl);
    } else {
      unmount();
    }
  });

  return (
    <>
      <span
        ref={triggerEl}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocusIn={() => setVisible(true)}
        onFocusOut={() => setVisible(false)}
        class="inline-flex"
      >
        {props.children}
      </span>

      <Show when={visible()}>
        <Portal>
          <div
            ref={(el) => { floatEl = el; }}
            role="tooltip"
            use:motion={{
              initial: { opacity: 0, y: 4 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.15, easing: "ease-out" },
            }}
            style={{
              position: "fixed", top: `${y()}px`, left: `${x()}px`,
              visibility: positioned() ? "visible" : "hidden",
            }}
            class={`z-[9999] pointer-events-none px-2.5 py-1.5 text-xs rounded-lg
                    bg-surface border border-rim text-muted shadow-lg
                    max-w-[200px] leading-relaxed whitespace-normal
                    ${props.class ?? ""}`}
          >
            {props.content}
          </div>
        </Portal>
      </Show>
    </>
  );
};

export default Tooltip;
