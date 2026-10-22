// solidified's implementation of the badge contract (spa-core types/ui.types.ts).
// Badge is a tag (rounded-md, so it follows the corner-radius setting);
// CountBadge is the round unread bubble.
import { Show, splitProps } from "solid-js";
import type { BadgeProps, BadgeTone, CountBadgeProps } from "@utsukta/spa-core/types/ui.types";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-elevated text-muted",
  accent: "bg-accent-muted text-accent-txt",
  danger: "bg-danger-muted text-danger-txt",
  success: "bg-success-muted text-success-txt",
  warning: "bg-warning-muted text-warning-txt",
};

export function badgeClass(tone: BadgeTone = "neutral", size: "sm" | "md" = "md"): string {
  return (
    `hz-badge hz-badge-${tone} inline-flex items-center gap-1 shrink-0 rounded-md font-medium leading-tight ` +
    `${size === "sm" ? "px-1.5 py-0.5 text-[0.625rem]" : "px-2 py-0.5 text-xs"} ${TONE[tone]}`
  );
}

export function Badge(props: BadgeProps) {
  const [own, rest] = splitProps(props, ["tone", "size", "class"]);
  return <span class={`${badgeClass(own.tone, own.size)} ${own.class ?? ""}`} {...rest} />;
}

export function CountBadge(props: CountBadgeProps) {
  const max = () => props.max ?? 99;
  return (
    <Show when={props.n > 0}>
      <span
        aria-label={props.label}
        class={
          "hz-count inline-flex items-center justify-center shrink-0 min-w-[1.25rem] h-5 px-1 rounded-full " +
          `bg-accent text-accent-fg text-[0.625rem] font-bold tabular-nums leading-none ${props.class ?? ""}`
        }
      >
        {props.n > max() ? `${max()}+` : props.n}
      </span>
    </Show>
  );
}
