// solidified's implementation of the menu contract (spa-core types/ui.types.ts).
// Positioning and outside-click/Escape dismissal come from createPopover; this
// adds the menu semantics: role="menu", arrow-key focus, focus back to the
// trigger on close. ContextMenu opens the same panel at the pointer.
import { Show, createContext, createEffect, on, onCleanup, splitProps, useContext, type JSX } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import { MdOutlineMore_horiz } from "solid-icons/md";
import { createPopover } from "@utsukta/spa-core/lib/createPopover";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import type { ContextMenuProps, MenuItemProps, MenuProps } from "@utsukta/spa-core/types/ui.types";
import { IconButton } from "@ui/Button";

export const menuPanelClass =
  "hz-menu z-50 min-w-48 max-h-(--float-max-h) overflow-y-auto rounded-2xl bg-surface/95 backdrop-blur-xl shadow-2xl ring-1 ring-rim/60 p-2";
export const menuItemClass =
  "hz-menu-item w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-left " +
  "hover:bg-elevated/70 focus:bg-elevated/70 focus:outline-none " +
  "aria-disabled:opacity-60 aria-disabled:pointer-events-none disabled:opacity-60 disabled:pointer-events-none";

const MenuContext = createContext<{ close: () => void }>();

type Popover = ReturnType<typeof createPopover>;

// The open panel, shared by Menu and ContextMenu: role="menu", arrow-key focus,
// focus back to `returnFocus()` on close.
function MenuPanel(props: {
  pop: Popover;
  label: string;
  class?: string;
  onOpenChange?: (open: boolean) => void;
  returnFocus: () => HTMLElement | undefined;
  children: JSX.Element;
}) {
  const pop = props.pop;
  let panel: HTMLDivElement | undefined;

  const items = () =>
    [...(panel?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled]):not([aria-disabled="true"])') ?? [])];
  // Focus goes back to the trigger only if it was still in the menu: an item
  // that opened a dialog has already moved it, and must keep it there.
  const close = () => {
    const wasInside = !!panel?.contains(document.activeElement);
    pop.setOpen(false);
    if (wasInside) props.returnFocus()?.focus({ preventScroll: true });
  };

  createEffect(on(pop.open, (open) => props.onOpenChange?.(open), { defer: true }));

  // Focus the first item once the panel is in place, so the keyboard user
  // lands inside the menu (a mouse user never sees the difference).
  createEffect(() => {
    if (pop.open()) queueMicrotask(() => items()[0]?.focus({ preventScroll: true }));
  });

  const onKeyDown = (e: KeyboardEvent) => {
    // A text field inside the menu (TrackMenu's "new playlist") keeps its keys.
    const typing = (e.target as HTMLElement).matches?.("input, textarea, select");
    if (typing && e.key !== "Escape") return;
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (e.key === "Tab") pop.setOpen(false);
  };

  return (
    <Show when={pop.open()}>
      <Portal mount={topLayer()}>
        <MenuContext.Provider value={{ close }}>
          <div
            ref={(el) => { panel = el; pop.floating(el); }}
            role="menu"
            aria-label={props.label}
            style={pop.style()}
            class={`${menuPanelClass} ${props.class ?? ""}`}
            onKeyDown={onKeyDown}
            // Solid's Portal bubbles delegated events to the component-tree
            // parent, so without this an item click also fires the row's onClick.
            onClick={(e) => e.stopPropagation()}
            // An item that swaps the menu's contents (a sub-panel) removes the
            // focused node; catch focus before it falls to <body>.
            onFocusOut={(e) => {
              if (e.relatedTarget) return;
              queueMicrotask(() => {
                if (pop.open() && document.activeElement === document.body) items()[0]?.focus({ preventScroll: true });
              });
            }}
          >
            {props.children}
          </div>
        </MenuContext.Provider>
      </Portal>
    </Show>
  );
}

export function Menu(props: MenuProps) {
  const pop = createPopover({ placement: props.placement ?? "bottom-end" });
  let trigger: HTMLElement | undefined;

  const triggerProps = {
    ref: (el: HTMLElement) => { trigger = el; pop.ref(el); },
    // A ⋯ usually sits in a clickable row or card; the click is the menu's.
    onClick: (e?: MouseEvent) => { e?.stopPropagation(); pop.setOpen(!pop.open()); },
    "aria-haspopup": "menu" as const,
    get "aria-expanded"() { return pop.open(); },
  };

  return (
    <>
      {props.trigger ? (
        props.trigger(triggerProps, pop.open)
      ) : (
        <IconButton label={props.label} {...triggerProps}>
          <MdOutlineMore_horiz size={16} />
        </IconButton>
      )}
      <MenuPanel pop={pop} label={props.label} class={props.class} onOpenChange={props.onOpenChange} returnFocus={() => trigger}>
        {props.children}
      </MenuPanel>
    </>
  );
}

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10; // px a finger may drift before it counts as a scroll

export function ContextMenu(props: ContextMenuProps) {
  const pop = createPopover({ placement: "bottom-start" });
  let region!: HTMLDivElement;
  let opener: HTMLElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start = { x: 0, y: 0 };
  let pressed = false;

  const openAt = (x: number, y: number) => {
    opener = document.activeElement as HTMLElement | undefined;
    pop.ref({ getBoundingClientRect: () => new DOMRect(x, y, 0, 0) });
    pop.setOpen(true);
  };
  const cancel = () => clearTimeout(timer);
  // Events from the portalled panel bubble here through the component tree;
  // only ones from the region's own DOM count.
  const mine = (e: Event) => !props.disabled && region.contains(e.target as Node);

  // Lifting the finger off a long-press still clicks whatever is under it —
  // by then that's the menu item the panel opened beneath it.
  const swallowNextClick = () => {
    const stop = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, true), 400);
  };

  onCleanup(cancel);

  return (
    <div
      ref={region}
      class="contents [-webkit-touch-callout:none]"
      onContextMenu={(e) => {
        if (!mine(e)) return;
        e.preventDefault();
        e.stopPropagation(); // the innermost region wins
        cancel();
        if (pressed) return; // Android fires this on the long-press we already handled
        // The menu key / Shift+F10 report a position off the focused element
        // (often 0,0); anchor to the element then.
        const r = (e.target as Element).getBoundingClientRect();
        const onTarget = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (onTarget) openAt(e.clientX, e.clientY);
        else openAt(r.left, r.bottom);
      }}
      onPointerDown={(e) => {
        pressed = false;
        if (e.pointerType !== "touch" || !mine(e)) return;
        start = { x: e.clientX, y: e.clientY };
        timer = setTimeout(() => { pressed = true; openAt(start.x, start.y); }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > LONG_PRESS_SLOP) cancel();
      }}
      onPointerUp={() => { cancel(); if (pressed) swallowNextClick(); }}
      onPointerCancel={cancel}
    >
      {props.children}
      <MenuPanel pop={pop} label={props.label} class={props.class} onOpenChange={props.onOpenChange} returnFocus={() => opener}>
        {props.menu}
      </MenuPanel>
    </div>
  );
}

/** For content inside a Menu that isn't a MenuItem (a form) and has to close it. */
export function useMenu() {
  const menu = useContext(MenuContext);
  return { close: () => menu?.close() };
}

export function MenuItem(props: MenuItemProps) {
  const [own, rest] = splitProps(props, ["icon", "danger", "href", "download", "target", "rel", "keepOpen", "class", "children", "onClick"]);
  const menu = useContext(MenuContext);
  return (
    <Dynamic
      component={own.href ? "a" : "button"}
      role="menuitem"
      tabIndex={-1}
      type={own.href ? undefined : "button"}
      href={own.href}
      download={own.download}
      target={own.target}
      rel={own.rel}
      class={`${menuItemClass} ${own.danger ? "text-danger-txt" : "text-txt"} ${own.class ?? ""}`}
      onClick={(e: MouseEvent) => {
        // Read before the handler: a two-step item's handler flips keepOpen.
        const keepOpen = own.keepOpen;
        if (typeof own.onClick === "function") (own.onClick as (e: MouseEvent) => void)(e);
        // Next tick: removing a link mid-click can cancel its navigation/download.
        if (!keepOpen) setTimeout(() => menu?.close());
      }}
      {...rest}
    >
      <Show when={own.icon}>
        <span class={`w-4 shrink-0 ${own.danger ? "" : "text-muted"}`}>{own.icon}</span>
      </Show>
      {own.children}
    </Dynamic>
  );
}

export function MenuSeparator() {
  return <div role="separator" class="hz-menu-separator my-1 h-px bg-rim/60" />;
}
