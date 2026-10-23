// solidified's implementation of the colour-swatch contract
// (spa-core types/ui.types.ts). Keeps the native <input type="color"> (OS
// picker, keyboard reachable) and paints it as a swatch; the peer variants
// move focus feedback to the visible circle.
import { Show } from "solid-js";
import type { ColorSwatchProps } from "@utsukta/spa-core/types/ui.types";

const SIZE = { sm: "w-6 h-6", md: "w-8 h-8" } as const;

export function ColorSwatch(props: ColorSwatchProps) {
  return (
    <label class={`hz-swatch inline-flex items-center gap-2 cursor-pointer ${props.class ?? ""}`}>
      <input
        type="color"
        value={props.value}
        aria-label={props.label}
        onInput={(e) => props.onChange(e.currentTarget.value)}
        class="peer sr-only"
      />
      <span
        aria-hidden="true"
        style={{ "background-color": props.value }}
        class={`${SIZE[props.size ?? "md"]} shrink-0 rounded-full border border-rim transition-shadow
                peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50
                peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface`}
      />
      <Show when={props.showLabel !== false}>
        <span class="text-sm text-muted">{props.label}</span>
      </Show>
    </label>
  );
}
