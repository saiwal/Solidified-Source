// The UI primitive contract. Modules import the primitives from `@ui/*`, and
// each theme aliases that to its own implementation (solidified: src/ui/) —
// so a Bootstrap or plain-CSS theme rewrites src/ui/, not every module.
// An implementation must accept every prop here and pass the rest through to
// the native element.
import type { JSX } from "solid-js";

/** One primary per view; ghost for labelled secondary actions; danger to confirm a destructive one. */
export type ButtonVariant = "primary" | "ghost" | "danger";
/** md is the full-size pill; sm fits a dense row or a header. */
export type ButtonSize = "md" | "sm";

export interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Makes it an on/off toggle: renders aria-pressed and the "on" look when true. */
  pressed?: boolean;
}

export interface IconButtonProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "title" | "aria-label" | "aria-pressed"> {
  /** Required: an icon-only button has no other accessible name. Used for both title and aria-label. */
  label: string;
  /** outline is the bordered header button (round, like the pills); danger tints on hover. */
  variant?: "default" | "danger" | "outline";
  size?: ButtonSize;
  /** Set for toggles: renders aria-pressed and the "on" colour. */
  pressed?: boolean;
}

/** md for forms; sm for dense rows and widget config panels. */
export type FieldSize = "md" | "sm";

// `size` is also a native <input>/<select> attribute (visible width in
// characters); the contract takes the name over, so it's omitted here.
export interface InputProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: FieldSize;
}

export interface SelectProps extends Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: FieldSize;
}

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: FieldSize;
}

/**
 * Label + control + hint/error. The implementation must associate the label
 * with the control inside it (for/id) and point the control's
 * aria-describedby at the hint or error, so call sites never pass ids.
 */
export interface FieldProps {
  label: JSX.Element;
  hint?: JSX.Element;
  /** Replaces the hint while set, and marks the control aria-invalid. */
  error?: string | false | null;
  /** md: text-sm label for forms; sm: small muted label for dense panels. */
  size?: FieldSize;
  class?: string;
  children: JSX.Element;
}

/**
 * An on/off switch. Must behave as a native checkbox inside a form: with a
 * `name` it submits `value` (default "1") when on and nothing when off.
 */
export interface SwitchProps
  extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "value" | "onChange"> {
  checked?: boolean;
  value?: string;
  /** Return a promise for an async toggle that can fail: once it settles the
   *  switch re-syncs to `checked`, so a refused change doesn't stay flipped. */
  onChange?: (checked: boolean) => void | Promise<unknown>;
  /** Accessible name when no visible label wraps the switch. */
  label?: string;
}

/** A labelled row: label + hint on the left, the switch on the right. */
export interface ToggleProps extends Omit<SwitchProps, "label"> {
  label: JSX.Element;
  hint?: JSX.Element;
}

/** A bordered panel. No padding or layout of its own — the call site sets those. */
export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Floats slightly above the page (a small shadow). */
  raised?: boolean;
}

/** The bar across the top of a Card: bottom rule, standard padding. */
export type CardHeaderProps = JSX.HTMLAttributes<HTMLDivElement>;

/**
 * A modal dialog layer (backdrop + top layer). Must trap focus, close on
 * Escape, make the page inert and restore focus to the opener — solidified
 * uses native <dialog>.showModal() for all of that.
 */
export interface ModalProps {
  onClose: () => void;
  /** Accessible name. Prefer `labelledBy` (or a ModalPanel `title`) when the panel shows a title. */
  label?: string;
  /** id of the element naming this dialog. */
  labelledBy?: string;
  /** Extra classes for the backdrop layer — z-index, padding, alignment. */
  class?: string;
  style?: JSX.CSSProperties;
  /** Default true. false where a stray click would lose input. */
  dismissOnBackdrop?: boolean;
  /** The caller owns the whole layout: position, size, dim, padding. */
  bare?: boolean;
  /** false renders a non-modal dialog: no focus trap, page stays interactive. */
  modal?: boolean;
  children?: JSX.Element;
}

export type ModalSize = "sm" | "md" | "lg" | "xl";

/** The dialog box inside a Modal. */
export interface ModalPanelProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Max width; omit to size it from `class`. */
  size?: ModalSize;
  /** Renders a header bar and names the dialog (no labelledBy needed). */
  title?: JSX.Element;
  /** A muted line under the title; becomes the dialog's description. */
  description?: JSX.Element;
  /** With `title`, adds a close button to the header. */
  onClose?: () => void;
  /** Renders a footer bar (right-aligned actions). */
  footer?: JSX.Element;
}

/** What a custom Menu trigger must spread onto its button. */
export interface MenuTriggerProps {
  ref: (el: HTMLElement) => void;
  onClick: (e?: MouseEvent) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
}

/**
 * An action menu (⋯). Must render role="menu" with role="menuitem" items,
 * move focus with ArrowUp/ArrowDown/Home/End, and on Escape close and return
 * focus to the trigger. Not for picking a value — that is a select/listbox.
 */
export interface MenuProps {
  /** Accessible name of the default ⋯ trigger. */
  label: string;
  /** Replace the default ⋯ IconButton; spread `props` onto your button. */
  trigger?: (props: MenuTriggerProps, open: () => boolean) => JSX.Element;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  /** Panel classes — usually a width (w-60). */
  class?: string;
  /** Fires on every open/close — e.g. to reset a sub-panel when the menu closes. */
  onOpenChange?: (open: boolean) => void;
  children: JSX.Element;
}

export interface MenuItemProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: JSX.Element;
  danger?: boolean;
  /** Renders a link item instead of a button. */
  href?: string;
  /** "" downloads under the link's own filename. */
  download?: string;
  target?: string;
  rel?: string;
  /** Don't close on click — for an item wrapping a file input, which must stay
   *  mounted until its change event fires. Close from that handler instead. */
  keepOpen?: boolean;
}

export interface TabItem<T extends string> {
  value: T;
  label: JSX.Element;
}

/**
 * A tab switcher (controlled). Must render role="tablist"/"tab" with
 * aria-selected, keep only the selected tab in the Tab order, and move the
 * selection with ArrowLeft/ArrowRight/Home/End.
 */
export interface TabsProps<T extends string> {
  /** Accessible name of the tablist. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  /** segmented: the header switcher pill group. underline: in-page sections. */
  variant?: "segmented" | "underline";
  /** Tabs share the full width equally (segmented only). */
  stretch?: boolean;
  /** Container classes — alignment such as mx-auto. */
  class?: string;
}

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

/** A busy indicator. Decorative (aria-hidden) unless given a `label`. */
export interface SpinnerProps {
  size?: SpinnerSize;
  /** Colour; default follows the surrounding text colour. */
  tone?: "current" | "accent" | "muted";
  /** Makes it a standalone role="status" loader with this accessible name. */
  label?: string;
  class?: string;
}

export type BadgeTone = "neutral" | "accent" | "danger" | "success" | "warning";

/** A small label chip: a tag, role or status. */
export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** sm: inline with metadata; md: alongside body text. */
  size?: "sm" | "md";
}

/** A solid unread/count bubble. Renders nothing at 0. */
export interface CountBadgeProps {
  n: number;
  /** Shows "max+" above this (default 99). */
  max?: number;
  /** Accessible text when the bare number isn't enough ("3 unread"). */
  label?: string;
  class?: string;
}

/**
 * A person's/channel's picture. Must fall back to the name's initials when
 * there is no `src` *or* the image fails to load (federated photo URLs die).
 */
export interface AvatarProps extends Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> {
  src?: string | null;
  /** Source of the fallback initials and colour. */
  name?: string;
  /** Width/height in Tailwind spacing units: 8 = w-8 (2rem). Default 8. */
  size?: number;
  shape?: "circle" | "rounded";
  /** Accessible name; omit when the name is printed beside it (the usual case). */
  alt?: string;
}

/** "Nothing here" message for an empty list, folder or page. */
export interface EmptyStateProps {
  /** Large faded icon above the message. */
  icon?: JSX.Element;
  /** A button or link below the message ("Create your first page"). */
  action?: JSX.Element;
  /** sm: inside a list or panel; md: a whole view. */
  size?: "sm" | "md";
  class?: string;
  children: JSX.Element;
}
