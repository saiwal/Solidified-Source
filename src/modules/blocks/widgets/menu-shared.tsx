// Shared UI pieces for the Hubzilla-menu widgets (MenuBarWidget /
// MenuTreeWidget): safe href resolution and the recursive accordion list used
// wherever the menu renders vertically (sidebar widget, collapsed mobile bar).
// API types and fetchers live in @utsukta/spa-core/lib/menus.

import { createSignal, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { MdFillExpand_more, MdFillOpen_in_new } from "solid-icons/md";
import type { MenuTreeItem } from "@utsukta/spa-core/lib/menus";

export type ResolvedHref =
  | { kind: "internal"; path: string }
  | { kind: "external"; url: string; newwin: boolean };

/**
 * Menu links are owner data but could be written by a hostile client —
 * javascript: and friends must never become anchors. Same-origin http(s)
 * links become router paths so navigation stays inside the SPA.
 */
export function resolveHref(item: MenuTreeItem): ResolvedHref | null {
  if (!item.url) return null;
  let u: URL;
  try {
    u = new URL(item.url, window.location.origin);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.origin === window.location.origin && !item.newwin)
    return { kind: "internal", path: u.pathname + u.search + u.hash };
  return { kind: "external", url: u.href, newwin: !!item.newwin };
}

export function MenuLink(props: {
  item: MenuTreeItem;
  class?: string;
  onNavigate?: () => void;
  children?: JSX.Element;
}) {
  const href = () => resolveHref(props.item);
  return (
    <Show when={href()}>
      {(h) => (
        <Show
          when={h().kind === "internal"}
          fallback={
            <a
              href={(h() as { url: string }).url}
              target={(h() as { newwin: boolean }).newwin ? "_blank" : undefined}
              rel="noopener noreferrer"
              class={props.class}
              onClick={() => props.onNavigate?.()}
            >
              <span class="truncate">{props.item.label}</span>
              <MdFillOpen_in_new size={11} class="shrink-0 text-muted" />
              {props.children}
            </a>
          }
        >
          <a
            href={(h() as { path: string }).path}
            class={props.class}
            onClick={() => props.onNavigate?.()}
          >
            <span class="truncate">{props.item.label}</span>
            {props.children}
          </a>
        </Show>
      )}
    </Show>
  );
}

/**
 * Vertical multilevel accordion. Renders leaf links and, for submenu items,
 * a toggle row with an indented child list. Used by the sidebar tree widget
 * and by the collapsed (mobile) state of the horizontal bar.
 */
export function MenuAccordion(props: {
  items: MenuTreeItem[];
  depth?: number;
  onNavigate?: () => void;
}) {
  const depth = () => props.depth ?? 0;
  const [open, setOpen] = createSignal<Record<number, boolean>>({});
  const toggle = (i: number) => setOpen((prev) => ({ ...prev, [i]: !prev[i] }));

  const rowClass =
    "flex items-center gap-2 w-full px-3 py-2 text-sm text-txt rounded-lg " +
    "hover:bg-elevated hover:text-accent transition-colors";

  return (
    <ul class={depth() > 0 ? "ml-3 border-l border-rim pl-1 space-y-0.5" : "space-y-0.5"}>
      <For each={props.items}>
        {(item, i) => (
          <li>
            <Show
              when={item.items?.length}
              fallback={<MenuLink item={item} class={rowClass} onNavigate={props.onNavigate} />}
            >
              <button onClick={() => toggle(i())} class={rowClass} aria-expanded={(!!open()[i()]) ? "true" : "false"}>
                <span class="flex-1 truncate text-left">{item.label}</span>
                <MdFillExpand_more
                  size={16}
                  class={`shrink-0 text-muted transition-transform ${open()[i()] ? "rotate-180" : ""}`}
                />
              </button>
              <Show when={open()[i()]}>
                <MenuAccordion items={item.items!} depth={depth() + 1} onNavigate={props.onNavigate} />
              </Show>
            </Show>
          </li>
        )}
      </For>
    </ul>
  );
}
