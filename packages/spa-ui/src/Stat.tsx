// solidified's implementation of the stat contract (spa-core types/ui.types.ts):
// a metric card — big value, quiet label, optional hint/icon.
import { Show } from "solid-js";
import type { StatProps } from "@utsukta/spa-core/types/ui.types";
import { Card } from "@ui/Card";

export function Stat(props: StatProps) {
  return (
    <Card class={`hz-stat p-3 space-y-0.5 ${props.class ?? ""}`}>
      <div class="flex items-center gap-1.5">
        <Show when={props.icon}>
          <span class="shrink-0" aria-hidden="true">{props.icon}</span>
        </Show>
        <p class={`text-lg font-semibold tabular-nums ${props.accent ? "text-accent-txt" : "text-txt"}`}>
          {typeof props.value === "number" ? props.value.toLocaleString() : props.value}
        </p>
      </div>
      <p class="text-xs text-muted">{props.label}</p>
      <Show when={props.hint}>
        <p class="text-[0.625rem] text-muted">{props.hint}</p>
      </Show>
    </Card>
  );
}
