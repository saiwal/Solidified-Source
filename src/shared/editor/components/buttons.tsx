/**
 * buttons.tsx
 * Shared composer button primitives, standardized on PostComposer's existing
 * scale (the reference design per the composer-layout unification) so
 * button sizing is uniform across Post/Article/Webpage/DM.
 *
 * CommentComposer intentionally does NOT use these — its Cancel/Reply
 * buttons stay at their own smaller, hand-rolled scale, since they aren't
 * part of the footer-feature-button row being standardized here.
 */

import { type Component, type JSX } from "solid-js";

export interface PrimarySubmitButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: JSX.Element;
}

export const PrimarySubmitButton: Component<PrimarySubmitButtonProps> = (props) => (
  <button
    type="button"
    disabled={props.disabled}
    onClick={props.onClick}
    class="px-5 py-1.5 rounded-lg text-sm font-semibold bg-accent text-accent-fg hover:opacity-90
           active:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
  >
    {props.children}
  </button>
);

export interface SecondaryButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: JSX.Element;
}

export const SecondaryButton: Component<SecondaryButtonProps> = (props) => (
  <button
    type="button"
    disabled={props.disabled}
    onClick={props.onClick}
    class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-rim text-xs text-muted
           hover:text-txt hover:bg-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
  >
    {props.children}
  </button>
);

export interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: JSX.Element;
}

export const ToggleButton: Component<ToggleButtonProps> = (props) => (
  <button
    type="button"
    onClick={props.onClick}
    title={props.title}
    class={
      "hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors " +
      (props.active
        ? "bg-accent/10 text-accent border-accent/30"
        : "text-muted hover:text-txt hover:bg-elevated border-rim")
    }
  >
    {props.children}
  </button>
);

export interface IconButtonProps {
  onClick: () => void;
  title?: string;
  variant?: "default" | "danger";
  /** Guided-tour anchor (see packages/spa-core/src/lib/tours.ts). */
  dataTour?: string;
  children: JSX.Element;
}

export const IconButton: Component<IconButtonProps> = (props) => (
  <button
    type="button"
    title={props.title}
    data-tour={props.dataTour}
    onClick={props.onClick}
    class={
      "p-1.5 rounded-md text-muted transition-colors " +
      (props.variant === "danger"
        ? "hover:text-red-500 hover:bg-red-500/10"
        : "hover:text-txt hover:bg-elevated")
    }
  >
    {props.children}
  </button>
);
