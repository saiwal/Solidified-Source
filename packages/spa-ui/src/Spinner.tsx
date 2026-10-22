// solidified's implementation of the spinner contract (spa-core types/ui.types.ts):
// a ring in currentColor, so inside a button it takes the button's colour.
import type { SpinnerProps, SpinnerSize } from "@utsukta/spa-core/types/ui.types";

const SIZE: Record<SpinnerSize, string> = {
  xs: "w-3 h-3 border", sm: "w-3.5 h-3.5 border-2", md: "w-4 h-4 border-2",
  lg: "w-5 h-5 border-2", xl: "w-6 h-6 border-2", "2xl": "w-8 h-8 border-2",
};
const TONE = { current: "", accent: "text-accent", muted: "text-muted" } as const;

export function Spinner(props: SpinnerProps) {
  return (
    <span
      role={props.label ? "status" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : true}
      class={
        `hz-spinner inline-block shrink-0 rounded-full border-current border-t-transparent animate-spin ` +
        `motion-reduce:animate-[spin_1.5s_linear_infinite] ${SIZE[props.size ?? "md"]} ${TONE[props.tone ?? "current"]} ${props.class ?? ""}`
      }
    />
  );
}
