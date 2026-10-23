// solidified's implementation of the popover contract
// (spa-core types/ui.types.ts). Built on createPopover (outside-click, Escape,
// floating placement) + Portal; the trigger owns its own look via a render prop.
// Use Menu for role="menu" keyboard behaviour; Popover is the disclosure shell.
import { createEffect, createUniqueId, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type {
  PopoverProps,
  PopoverTriggerProps,
} from "@utsukta/spa-core/types/ui.types";
import { createPopover } from "@utsukta/spa-core/lib/createPopover";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";

export function Popover(props: PopoverProps) {
  const pop = createPopover({ placement: props.placement });
  const panelId = createUniqueId();
  let panelEl: HTMLElement | undefined;
  let triggerEl: HTMLElement | undefined;

  const setOpen = (open: boolean) => {
    if (open === pop.open()) return;
    pop.setOpen(open);
    props.onOpenChange?.(open);
  };

  // A keyboard user lands inside the panel; Escape returns to the trigger.
  createEffect(() => {
    if (pop.open()) queueMicrotask(() => panelEl?.focus());
  });

  const trigger: PopoverTriggerProps = {
    ref: (el) => {
      triggerEl = el;
      pop.ref(el);
    },
    onClick: (e) => {
      e.preventDefault();
      setOpen(!pop.open());
    },
    get "aria-expanded"() {
      return pop.open();
    },
    "aria-controls": panelId,
    get "aria-haspopup"() {
      return props.role;
    },
  };

  return (
    <>
      {props.trigger(trigger, pop.open)}
      <Show when={pop.open()}>
        <Portal mount={topLayer()}>
          <div
            ref={(el) => {
              panelEl = el;
              pop.floating(el);
            }}
            id={panelId}
            role={props.role}
            aria-label={props.role ? props.label : undefined}
            tabIndex={-1}
            style={pop.style()}
            class={`hz-popover z-50 rounded-lg border border-rim bg-surface p-2 shadow-lg outline-none ${props.class ?? ""}`}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.stopPropagation();
              setOpen(false);
              triggerEl?.focus();
            }}
          >
            {typeof props.children === "function"
              ? props.children(() => setOpen(false))
              : props.children}
          </div>
        </Portal>
      </Show>
    </>
  );
}
