// solidified's implementation of the progress-bar contract
// (spa-core types/ui.types.ts). Named bars are role="progressbar"; an unnamed
// one is decorative. `indeterminate` omits the value attributes and pulses.
import type {
  ProgressBarProps,
  ProgressTone,
} from "@utsukta/spa-core/types/ui.types";

const TONE: Record<ProgressTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const SIZE = { xs: "h-0.5", sm: "h-1", md: "h-1.5" } as const;

export function ProgressBar(props: ProgressBarProps) {
  const max = () => (props.max && props.max > 0 ? props.max : 100);
  const current = () => Math.min(max(), Math.max(0, props.value ?? 0));
  const pct = () => (props.indeterminate ? 100 : (current() / max()) * 100);

  return (
    <div
      role={props.label ? "progressbar" : undefined}
      aria-hidden={props.label ? undefined : "true"}
      aria-label={props.label}
      aria-valuemin={props.label && !props.indeterminate ? 0 : undefined}
      aria-valuemax={props.label && !props.indeterminate ? max() : undefined}
      aria-valuenow={props.label && !props.indeterminate ? current() : undefined}
      class={`hz-progress relative w-full overflow-hidden rounded-full bg-overlay ${SIZE[props.size ?? "sm"]} ${props.class ?? ""}`}
    >
      <div
        class={`h-full rounded-full transition-[width] duration-300 ${TONE[props.tone ?? "accent"]} ${props.indeterminate ? "w-full animate-pulse motion-reduce:animate-none" : ""}`}
        style={props.indeterminate ? undefined : { width: `${pct()}%` }}
      />
    </div>
  );
}
