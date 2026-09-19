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

import {
  Show,
  createContext,
  createSignal,
  createEffect,
  onCleanup,
  useContext,
  type Component,
  type JSX,
} from "solid-js";
import { MdOutlineExpand_less } from "solid-icons/md";

/**
 * True inside SplitSubmitButton's menu. A PopoverButton there expands its panel
 * inline instead of floating it: a floating panel anchored to a row inside a
 * scrollable menu is clipped by the menu and overlaps the rows above it.
 */
export const ComposerMenuContext = createContext(false);

/**
 * Marks a panel that logically belongs to the control that opened it, even
 * though it is Portal'd to <body> and so is not a DOM descendant of it.
 *
 * Without this, clicking a day in a DateTimePicker inside the submit menu
 * dismissed the menu — the popup is Portal'd, so the menu's outside-click check
 * saw the click as outside and closed, unmounting the picker mid-choice.
 */
export const POPUP_MARKER = "data-composer-popup";

/** True when a click belongs to `root` or to any marked popup it opened. */
export function clickedInside(e: Event, root: Element | undefined): boolean {
  // composedPath is captured at dispatch, so it still works for a node the
  // click itself detached.
  for (const n of e.composedPath()) {
    if (!(n instanceof Element)) continue;
    if (root && (n === root || root.contains(n))) return true;
    if (n.hasAttribute(POPUP_MARKER) || n.closest(`[${POPUP_MARKER}]`)) return true;
  }
  return false;
}

/**
 * The composer's chip-shaped trigger, in a row or as a menu item.
 *
 * In a row it is a bordered chip with the label hidden below `sm`. In the
 * submit button's menu a border around every item reads as clutter and the
 * chip leaves the row's width unused, so it becomes a plain full-width menu
 * row: icon and label left, state carried by colour alone.
 */
export function composerTriggerClass(active: boolean, inMenu: boolean): string {
  if (inMenu) {
    return (
      "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors " +
      (active ? "text-accent bg-accent/10" : "text-txt hover:bg-elevated")
    );
  }
  return (
    "flex items-center gap-1.5 px-2.5 py-1.5 sm:px-2 sm:py-1 rounded-md text-xs border transition-colors " +
    (active
      ? "bg-accent/10 text-accent border-accent/30"
      : "text-muted hover:text-txt hover:bg-elevated border-rim")
  );
}

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
  /**
   * Both the native tooltip and the visible label. The label is hidden below
   * `sm`, leaving the icon alone, so the composer's options row still fits a
   * phone instead of being hidden outright.
   */
  title?: string;
  children: JSX.Element;
}

export const ToggleButton: Component<ToggleButtonProps> = (props) => {
  const inMenu = useContext(ComposerMenuContext);
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      class={composerTriggerClass(props.active, inMenu)}
    >
      {props.children}
      <span class={inMenu ? "" : "hidden sm:inline"}>{props.title}</span>
    </button>
  );
};

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

export interface PopoverButtonProps {
  /** Tooltip and the label shown from `sm` up, exactly like ToggleButton. */
  title: string;
  /** Controlled, because the panel's own state already lives elsewhere. */
  open: () => boolean;
  setOpen: (v: boolean) => void;
  icon: JSX.Element;
  /** Width of the panel. Default suits a short form. */
  widthClass?: string;
  /** Highlighted state. Defaults to "panel is open", but a control that holds a
   *  value (a location, an expiry) should stay lit once it has one. */
  active?: boolean;
  children: JSX.Element;
}

/**
 * A ToggleButton that opens a panel above itself instead of a full-width band
 * in the composer body — an option needing a few fields costs one row of chrome
 * rather than a permanent section.
 *
 * Plain CSS anchoring (`absolute bottom-full`), not useDropdown/floating-ui:
 * there is nothing to measure when the panel always sits directly above its own
 * trigger, and the floating version put it in the viewport's top-left corner —
 * autoUpdate measured a node that was not connected yet and never recomputed.
 * The panel opens upward inside ComposerModal's scrollable body, so the
 * dialog's `overflow-hidden` never clips it.
 */
export const PopoverButton: Component<PopoverButtonProps> = (props) => {
  let wrapper: HTMLSpanElement | undefined;
  const inMenu = useContext(ComposerMenuContext);

  // Dismiss on an outside click. Registered only while open, and it tolerates
  // the click that opened the panel because that target is inside `wrapper`.
  createEffect(() => {
    // In the menu the panel is part of the flow, and the menu owns dismissal.
    if (!props.open() || inMenu) return;
    const onDocClick = (e: MouseEvent) => {
      if (!clickedInside(e, wrapper)) props.setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    onCleanup(() => document.removeEventListener("click", onDocClick));
  });

  return (
    <span ref={wrapper} class={inMenu ? "flex flex-col gap-1.5 w-full" : "relative inline-flex"}>
      <button
        type="button"
        onClick={() => props.setOpen(!props.open())}
        title={props.title}
        class={composerTriggerClass(props.active ?? props.open(), inMenu)}
      >
        {props.icon}
        <span class={inMenu ? "" : "hidden sm:inline"}>{props.title}</span>
      </button>

      <Show when={props.open()}>
        <div
          data-composer-popup=""
          onKeyDown={(e) => {
            // Stopped as well as handled: the composers bind Escape on the
            // document to minimize or close, and dismissing a panel should not
            // also take the composer with it.
            if (e.key === "Escape") { e.stopPropagation(); props.setOpen(false); }
          }}
          class={
            inMenu
              // Inline: part of the menu's own scrollable column.
              ? "w-full rounded-lg border border-rim bg-elevated/40 p-2"
              : "absolute bottom-full left-0 mb-1.5 z-50 max-w-[80vw] " +
                "bg-surface border border-rim rounded-xl shadow-xl p-3 " +
                (props.widthClass ?? "w-80")
          }
        >
          {props.children}
        </div>
      </Show>
    </span>
  );
};

export interface SplitSubmitButtonProps {
  /** Primary action label — "Post", "Publish", "Save changes". */
  children: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
  /** Menu contents: the composer's option toggles. Omitted, this renders as a
   *  plain PrimarySubmitButton with no caret. */
  menu?: JSX.Element;
  menuLabel: string;
}

/**
 * The composer's one primary action, with the options that used to occupy a
 * whole row folded into a caret menu beside it.
 *
 * Anchored with plain CSS (`absolute bottom-full right-0`) rather than
 * floating-ui: the menu always hangs off its own button at the bottom of the
 * composer, so there is nothing to measure — and the measured version put
 * panels in the viewport's corner (see PopoverButton).
 */
export const SplitSubmitButton: Component<SplitSubmitButtonProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  let wrapper: HTMLSpanElement | undefined;

  createEffect(() => {
    if (!open()) return;
    const onDocClick = (e: MouseEvent) => {
      if (!clickedInside(e, wrapper)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    onCleanup(() => document.removeEventListener("click", onDocClick));
  });

  return (
    <span ref={wrapper} class="relative inline-flex items-stretch">
      <button
        type="button"
        disabled={props.disabled}
        onClick={props.onClick}
        class={
          "px-5 py-1.5 text-sm font-semibold bg-accent text-accent-fg hover:opacity-90 " +
          "active:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed " +
          (props.menu ? "rounded-l-lg" : "rounded-lg")
        }
      >
        {props.children}
      </button>

      <Show when={props.menu}>
        <button
          type="button"
          title={props.menuLabel}
          aria-label={props.menuLabel}
          aria-expanded={open()}
          onClick={() => setOpen(!open())}
          class="px-2 rounded-r-lg border-l border-accent-fg/25 bg-accent text-accent-fg
                 hover:opacity-90 active:opacity-80 transition-opacity"
        >
          <MdOutlineExpand_less class={"w-3.5 h-3.5 transition-transform " + (open() ? "rotate-180" : "")} />
        </button>

        <Show when={open()}>
          <div
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
            }}
            data-composer-popup=""
            class="absolute bottom-full right-0 mb-1.5 z-50 w-64 max-w-[80vw] max-h-[60vh]
                   overflow-y-auto bg-surface border border-rim rounded-xl shadow-xl p-1.5
                   flex flex-col gap-0.5 items-stretch"
          >
            <ComposerMenuContext.Provider value={true}>
              {props.menu}
            </ComposerMenuContext.Provider>
          </div>
        </Show>
      </Show>
    </span>
  );
};
