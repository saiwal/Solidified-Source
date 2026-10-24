// solidified's implementation of the collapsible contract
// (spa-core types/ui.types.ts). The header is a render prop because real
// section headers carry links and buttons beside the toggle target — markup
// that cannot live inside a <button>. Spread the trigger props onto each
// toggle so aria-expanded/aria-controls are wired once.
import { Show, createEffect, createSignal, createUniqueId, on, onCleanup } from "solid-js";
import type {
  CollapsibleProps,
  CollapsibleTriggerProps,
} from "@utsukta/spa-core/types/ui.types";

// Keep in step with the duration-200 below.
const DURATION = 200;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Collapsible(props: CollapsibleProps) {
  const panelId = createUniqueId();
  const trigger: CollapsibleTriggerProps = {
    get "aria-expanded"() {
      return props.open;
    },
    "aria-controls": panelId,
    onClick: () => props.onOpenChange(!props.open),
  };

  // The panel animates its height via grid-template-rows 0fr ↔ 1fr, so it
  // stays mounted through the close and unmounts once that finishes — a
  // closed panel still has no DOM, as the contract says.
  const [mounted, setMounted] = createSignal(props.open);
  const [expanded, setExpanded] = createSignal(props.open);
  // Clip only while moving: a settled-open panel mustn't cut off focus rings
  // or popovers inside it.
  const [settled, setSettled] = createSignal(props.open);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame: number | undefined;
  onCleanup(() => {
    clearTimeout(timer);
    if (frame) cancelAnimationFrame(frame);
  });

  createEffect(
    on(
      () => props.open,
      (open) => {
        clearTimeout(timer);
        if (frame) cancelAnimationFrame(frame);
        setSettled(false);
        if (reducedMotion()) {
          setMounted(open);
          setExpanded(open);
          setSettled(open);
          return;
        }
        if (open) {
          setMounted(true);
          // Two frames: the panel must be laid out at 0fr before it grows,
          // or there is nothing to transition from.
          frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
              setExpanded(true);
              timer = setTimeout(() => setSettled(true), DURATION);
            });
          });
        } else {
          setExpanded(false);
          timer = setTimeout(() => setMounted(false), DURATION);
        }
      },
      { defer: true },
    ),
  );

  return (
    <div class={`hz-collapsible ${props.class ?? ""}`}>
      {props.header(trigger)}
      <Show when={mounted()}>
        <div
          class={`grid transition-[grid-template-rows,opacity] duration-200 ease-out
                  ${expanded() ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
          inert={!props.open}
        >
          <div class={`min-h-0 ${settled() ? "" : "overflow-hidden"}`}>
            <div id={panelId} class={props.panelClass}>
              {props.children}
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
