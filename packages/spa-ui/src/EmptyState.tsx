// solidified's implementation of the empty-state contract (spa-core types/ui.types.ts).
import { Show } from "solid-js";
import type { EmptyStateProps } from "@utsukta/spa-core/types/ui.types";

export function EmptyState(props: EmptyStateProps) {
  const sm = () => props.size === "sm";
  return (
    <div
      class={
        `hz-empty flex flex-col items-center justify-center text-center text-muted ` +
        `${sm() ? "gap-2 py-6 text-xs" : "gap-3 py-12 text-sm"} ${props.class ?? ""}`
      }
    >
      <Show when={props.icon}>
        <span class="opacity-40 [&>svg]:w-10 [&>svg]:h-10" aria-hidden="true">{props.icon}</span>
      </Show>
      <p>{props.children}</p>
      <Show when={props.action}>{props.action}</Show>
    </div>
  );
}
