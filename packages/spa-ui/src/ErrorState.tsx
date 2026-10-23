// solidified's implementation of the error-state contract
// (spa-core types/ui.types.ts): the "it didn't load" companion to EmptyState.
import { Show } from "solid-js";
import type { ErrorStateProps } from "@utsukta/spa-core/types/ui.types";
import { Button } from "@ui/Button";

export function ErrorState(props: ErrorStateProps) {
  return (
    <div
      role="alert"
      class={`hz-error flex flex-col items-center justify-center gap-2 py-10 text-center text-muted ${props.class ?? ""}`}
    >
      <Show when={props.icon}>
        <span class="opacity-50" aria-hidden="true">{props.icon}</span>
      </Show>
      <p class="text-sm text-txt">{props.message}</p>
      <Show when={props.detail}>
        <p class="text-xs">{props.detail}</p>
      </Show>
      <Show when={props.retry}>
        <Button variant="ghost" size="sm" onClick={props.retry}>
          {props.retryLabel ?? "Retry"}
        </Button>
      </Show>
    </div>
  );
}
