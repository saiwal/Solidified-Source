// solidified's implementation of the skeleton contract
// (spa-core types/ui.types.ts). Decorative only: every block is aria-hidden, so
// a page announces the wait once (a labelled role="status" wrapper) instead of
// reading a pile of blank boxes.
import { For, splitProps } from "solid-js";
import type {
  SkeletonProps,
  SkeletonTextProps,
} from "@utsukta/spa-core/types/ui.types";

const RADIUS = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
} as const;

const TONE = {
  elevated: "bg-elevated",
  overlay: "bg-overlay",
  surface: "bg-surface",
} as const;

export function skeletonClass(
  rounded: NonNullable<SkeletonProps["rounded"]> = "md",
  tone: NonNullable<SkeletonProps["tone"]> = "elevated",
  pulse = true,
): string {
  return (
    `hz-skeleton block shrink-0 ${TONE[tone]} ${RADIUS[rounded]} ` +
    (pulse ? "animate-pulse motion-reduce:animate-none " : "")
  );
}

export function Skeleton(props: SkeletonProps) {
  const [own, rest] = splitProps(props, ["rounded", "tone", "pulse", "class"]);
  return (
    <div
      class={`${skeletonClass(own.rounded, own.tone, own.pulse)}${own.class ? ` ${own.class}` : ""}`}
      {...rest}
      aria-hidden="true"
    />
  );
}

export function SkeletonText(props: SkeletonTextProps) {
  const lines = () => Math.max(1, props.lines ?? 3);
  const lineHeight = () => (props.size === "md" ? "h-4" : "h-3");
  return (
    <div aria-hidden="true" class={`hz-skeleton-text space-y-2 ${props.class ?? ""}`}>
      <For each={Array.from({ length: lines() }, (_, i) => i)}>
        {(i) => (
          <div
            class={
              `hz-skeleton-line ${skeletonClass("sm", props.tone)}${lineHeight()} ` +
              (i === lines() - 1 ? "w-2/3" : "w-full")
            }
          />
        )}
      </For>
    </div>
  );
}
