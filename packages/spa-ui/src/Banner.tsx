// solidified's implementation of the banner contract
// (spa-core types/ui.types.ts). A tone-tinted inline message; role="status" by
// default so it is announced politely, role="alert" for errors.
import { Show } from "solid-js";
import type { BannerProps, BannerTone } from "@utsukta/spa-core/types/ui.types";

const TONE: Record<BannerTone, string> = {
  info: "border-accent/30 bg-accent-muted text-accent-txt",
  success: "border-success/40 bg-success-muted text-success-txt",
  warning: "border-warning/40 bg-warning-muted text-warning-txt",
  danger: "border-danger/40 bg-danger-muted text-danger-txt",
};

export function Banner(props: BannerProps) {
  return (
    <div
      role={props.role ?? "status"}
      class={`hz-banner flex flex-wrap items-start gap-2 rounded-lg border px-3 py-2 text-sm ${TONE[props.tone ?? "info"]} ${props.class ?? ""}`}
    >
      <Show when={props.icon}>
        <span class="shrink-0 mt-0.5" aria-hidden="true">{props.icon}</span>
      </Show>
      <div class="flex-1 min-w-0">
        <Show when={props.title}>
          <p class="font-semibold">{props.title}</p>
        </Show>
        <Show when={props.children}>
          <div class={props.title ? "mt-0.5" : ""}>{props.children}</div>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="shrink-0 flex items-center gap-1">{props.actions}</div>
      </Show>
    </div>
  );
}
