// Horizontal navigation bar (config: { menu, title? }) fed by one of the page
// owner's Hubzilla menus, for the contentTop slot. Desktop: inline bar with
// click-to-open dropdowns for submenu items (items linking "menu:<name>").
// Below md it collapses into a hamburger toggle over the shared accordion.

import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createMediaQuery } from "@solid-primitives/media";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillClose, MdFillExpand_more, MdFillMenu } from "solid-icons/md";
import { fetchMenuTree } from "@utsukta/spa-core/lib/menus";
import type { MenuTreeItem } from "@utsukta/spa-core/lib/menus";
import { useFloating } from "@utsukta/spa-core/lib/useFloating";
import { MenuAccordion, MenuLink } from "./menu-shared";

const topItemClass =
  "flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-txt rounded-lg " +
  "hover:bg-elevated hover:text-accent transition-colors";

// One top-level bar entry with a submenu. Panel is position:fixed and placed by
// floating-ui (flip + shift), so it never runs off the bottom/right edge — but it
// stays a DOM child of the nav so the bar's outside-click check still covers it.
function TopMenu(props: {
  label: string;
  items: MenuTreeItem[];
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  let triggerRef: HTMLButtonElement | undefined;
  let panelRef: HTMLDivElement | undefined;
  const { x, y, mount, unmount } = useFloating({ placement: "bottom-start", offset: 4 });

  createEffect(() => {
    if (props.open && triggerRef && panelRef) mount(triggerRef, panelRef);
    else unmount();
  });

  return (
    <div class="relative">
      <button
        ref={triggerRef}
        onClick={props.onToggle}
        aria-expanded={props.open}
        class={topItemClass}
      >
        <span class="truncate">{props.label}</span>
        <MdFillExpand_more
          size={16}
          class={`shrink-0 text-muted transition-transform ${props.open ? "rotate-180" : ""}`}
        />
      </button>
      <Show when={props.open}>
        <div
          ref={panelRef}
          style={{ position: "fixed", top: `${y()}px`, left: `${x()}px` }}
          class="w-56 bg-surface border border-rim rounded-xl shadow-lg z-30 p-1.5"
        >
          <MenuAccordion items={props.items} onNavigate={props.onNavigate} />
        </div>
      </Show>
    </div>
  );
}

function EditHint(props: { text: string }) {
  return (
    <Show when={editingWidgets()}>
      <div class="bg-surface border border-rim rounded-xl px-4 py-3">
        <p class="text-xs text-muted">{props.text}</p>
      </div>
    </Show>
  );
}

export default function MenuBarWidget(props: WidgetProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const menuName = () => String(props.config?.menu ?? "");
  const title = () => String(props.config?.title ?? "");
  const isDesktop = createMediaQuery("(min-width: 768px)");

  const [tree] = createQueryResource(
    "menu-tree",
    () => (nick() && menuName() ? { nick: nick(), name: menuName() } : null),
    (p) => fetchMenuTree(p.nick, p.name),
  );

  const [openTop, setOpenTop] = createSignal<number | null>(null);
  const [mobileOpen, setMobileOpen] = createSignal(false);

  let rootEl: HTMLElement | undefined;
  onMount(() => {
    const close = (e: MouseEvent) => {
      if (rootEl && !rootEl.contains(e.target as Node)) setOpenTop(null);
    };
    document.addEventListener("click", close);
    onCleanup(() => document.removeEventListener("click", close));
  });

  return (
    <Show when={menuName()} fallback={<EditHint text={t("widgets.not_configured")} />}>
      <Show when={!tree.error} fallback={<EditHint text={t("widgets.item_unavailable")} />}>
        <Show when={tree()?.items.length}>
          <Show
            when={isDesktop()}
            fallback={
              <nav class="bg-surface border border-rim rounded-xl overflow-hidden">
                <button
                  onClick={() => setMobileOpen(!mobileOpen())}
                  aria-expanded={mobileOpen()}
                  class="w-full flex items-center justify-between px-4 py-2.5 text-sm
                         font-semibold text-txt hover:bg-elevated transition-colors"
                >
                  <span class="truncate">{title() || tree()!.desc || tree()!.name}</span>
                  <Show when={mobileOpen()} fallback={<MdFillMenu size={18} class="shrink-0" />}>
                    <MdFillClose size={18} class="shrink-0" />
                  </Show>
                </button>
                <Show when={mobileOpen()}>
                  <div class="border-t border-rim p-1.5">
                    <MenuAccordion items={tree()!.items} onNavigate={() => setMobileOpen(false)} />
                  </div>
                </Show>
              </nav>
            }
          >
            <nav
              ref={rootEl}
              class="bg-surface border border-rim rounded-xl px-2 py-1.5 flex items-center gap-1 flex-wrap"
            >
              <Show when={title()}>
                <span class="px-2 text-sm font-semibold text-txt">{title()}</span>
              </Show>
              <For each={tree()!.items}>
                {(item, i) => (
                  <Show
                    when={item.items?.length}
                    fallback={<MenuLink item={item} class={topItemClass} />}
                  >
                    <TopMenu
                      label={item.label}
                      items={item.items!}
                      open={openTop() === i()}
                      onToggle={() => setOpenTop(openTop() === i() ? null : i())}
                      onNavigate={() => setOpenTop(null)}
                    />
                  </Show>
                )}
              </For>
            </nav>
          </Show>
        </Show>
      </Show>
    </Show>
  );
}
