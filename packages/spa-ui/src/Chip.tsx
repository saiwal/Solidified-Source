// solidified's implementation of the chip contracts (spa-core types/ui.types.ts).
// Chip is the interactive filter/toggle chip (aria-pressed); RemovableChip is a
// non-interactive chip with a real remove button, since a button cannot legally
// contain another button. Corners use --radius-lg so the corner-radius setting
// applies, unlike the old hand-rolled rounded-full pills. `rainbow` is the
// tag-cloud treatment from index.css, keyed on the caller's --rainbow-h.
import { Show, splitProps } from "solid-js";
import type {
  ChipProps,
  ChipTone,
  RemovableChipProps,
} from "@utsukta/spa-core/types/ui.types";
import { IconButton } from "@ui/Button";
import { MdFillClose } from "solid-icons/md";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BASE = "hz-chip inline-flex items-center justify-center gap-1.5 shrink-0 rounded-lg border font-medium transition-colors";
const SIZE = { sm: "h-7 px-2 text-[0.6875rem]", md: "h-8 px-3 text-xs" } as const;

const TONE: Record<ChipTone, string> = {
  neutral: "border-rim bg-elevated text-muted hover:text-txt hover:border-rim-strong",
  accent: "border-accent/30 bg-accent-muted text-accent-txt",
  success: "border-success/40 bg-success-muted text-success-txt",
  warning: "border-warning/40 bg-warning-muted text-warning-txt",
  danger: "border-danger/40 bg-danger-muted text-danger-txt",
};

// Solid accent, so an on chip reads as selected next to the resting tone.
const SELECTED = "border-accent bg-accent text-accent-fg font-semibold";
const SELECTED_RAINBOW = "border-transparent bg-accent text-accent-fg font-semibold";

export function chipClass(
  tone: ChipTone = "neutral",
  size: "sm" | "md" = "md",
  selected = false,
  rainbow = false,
): string {
  if (rainbow) {
    return (
      `${BASE} ${SIZE[size]} ` +
      `${selected ? SELECTED_RAINBOW : "rainbow-pill border-transparent"} ${focus}`
    );
  }
  return `${BASE} ${SIZE[size]} ${selected ? SELECTED : TONE[tone]} ${focus}`;
}

export function Chip(props: ChipProps) {
  const [own, rest] = splitProps(props, [
    "selected",
    "tone",
    "size",
    "icon",
    "count",
    "rainbow",
    "class",
  ]);
  return (
    <button
      type="button"
      aria-pressed={own.selected}
      class={`${chipClass(own.tone, own.size, own.selected, own.rainbow)}${own.class ? ` ${own.class}` : ""}`}
      {...rest}
    >
      <Show when={own.icon}>
        <span class="shrink-0" aria-hidden="true">{own.icon}</span>
      </Show>
      {props.children}
      <Show when={(own.count ?? 0) > 0}>
        <span class="hz-chip-count text-[0.625rem] font-semibold tabular-nums opacity-70">
          {own.count}
        </span>
      </Show>
    </button>
  );
}

export function RemovableChip(props: RemovableChipProps) {
  return (
    <span class={`${chipClass(props.tone, props.size)} ${props.class ?? ""}`}>
      <Show when={props.icon}>
        <span class="shrink-0" aria-hidden="true">{props.icon}</span>
      </Show>
      {props.children}
      <IconButton
        label={props.removeLabel}
        size="sm"
        class="-mr-1"
        onClick={props.onRemove}
      >
        <MdFillClose class="w-3 h-3" />
      </IconButton>
    </span>
  );
}
