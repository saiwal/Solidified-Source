// solidified's implementation of the button contract (spa-core types/ui.types.ts).
// The control vocabulary from design-guidelines.md: the one primary action is a
// filled pill, labelled secondary actions are ghost pills, everything else is a
// bare round icon. Every button also carries `hz-btn` hook classes, so CSS-only
// re-skins can target them without depending on the utility classes.
import { splitProps } from "solid-js";
import type {
  ButtonProps,
  ButtonSize,
  ButtonVariant,
  IconButtonProps,
} from "@utsukta/spa-core/types/ui.types";

// rounded-3xl, not rounded-full: it is a full pill at h-8/h-10 by default, and
// the corner-radius setting scales it (rounded-full is a fixed value it can't reach).
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110",
  ghost: "text-muted hover:text-txt hover:bg-elevated/70",
  danger: "bg-danger text-danger-fg hover:brightness-110",
};
const SIZE: Record<ButtonSize, string> = { md: "h-10 px-5 gap-2 text-sm", sm: "h-8 px-3 gap-1.5 text-xs" };

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return (
    `hz-btn hz-btn-${variant} hz-btn-${size} inline-flex items-center justify-center shrink-0 ` +
    `rounded-3xl font-medium transition disabled:opacity-60 disabled:pointer-events-none ` +
    `${SIZE[size]} ${VARIANT[variant]} ${focus}`
  );
}

const ICON_VARIANT = {
  default: "rounded-3xl text-muted hover:text-txt hover:bg-elevated/70",
  danger: "rounded-3xl text-muted hover:text-danger-txt hover:bg-danger/10",
  square: "rounded-lg border border-rim bg-surface text-muted hover:bg-elevated hover:text-txt",
} as const;

export function iconButtonClass(variant: keyof typeof ICON_VARIANT = "default", size: ButtonSize = "md"): string {
  return (
    `hz-btn hz-btn-icon hz-btn-icon-${variant} inline-flex items-center justify-center shrink-0 ` +
    `transition-colors disabled:opacity-40 disabled:pointer-events-none ` +
    `${variant === "square" || size === "sm" ? "p-1.5" : "p-2"} ${ICON_VARIANT[variant]} ${focus}`
  );
}

// The string forms, for the few places that style a non-button (a link) as one.
export const primaryPill = buttonClass("primary");
export const ghostPill = buttonClass("ghost");
export const iconBtn = iconButtonClass();

export function Button(props: ButtonProps) {
  const [own, rest] = splitProps(props, ["variant", "size", "class", "type"]);
  return (
    <button
      type={own.type ?? "button"}
      class={`${buttonClass(own.variant, own.size)} ${own.class ?? ""}`}
      {...rest}
    />
  );
}

export function IconButton(props: IconButtonProps) {
  const [own, rest] = splitProps(props, ["label", "variant", "size", "pressed", "class", "type"]);
  return (
    <button
      type={own.type ?? "button"}
      title={own.label}
      aria-label={own.label}
      aria-pressed={own.pressed}
      class={
        `${iconButtonClass(own.variant, own.size)} ${own.pressed ? "text-accent-txt!" : ""} ${own.class ?? ""}`
      }
      {...rest}
    />
  );
}
