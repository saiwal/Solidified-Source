// solidified's implementation of the tooltip contract (spa-core types/ui.types.ts).
// Hover/focus only, portalled to the top layer and positioned by floating-ui.
// The wrapper is inline-flex so a bare icon/spans keeps its layout.
import { Show, createEffect, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import type { TooltipProps } from "@utsukta/spa-core/types/ui.types";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { useFloating } from "@utsukta/spa-core/lib/useFloating";

export function Tooltip(props: TooltipProps) {
  const [visible, setVisible] = createSignal(false);
  const { x, y, positioned, mount, unmount } = useFloating({
    placement: props.placement ?? "top",
    offset: 6,
  });

  let triggerEl!: HTMLSpanElement;
  let floatEl: HTMLDivElement | undefined;

  // Solid runs render effects before user effects, so floatEl is assigned by
  // the time this fires after visible() becomes true.
  createEffect(() => {
    if (visible() && floatEl) mount(triggerEl, floatEl);
    else unmount();
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
        <Portal mount={topLayer()}>
          <div
            ref={(el) => { floatEl = el; }}
            role="tooltip"
            style={{
              position: "fixed",
              top: `${y()}px`,
              left: `${x()}px`,
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
}

export default Tooltip;
