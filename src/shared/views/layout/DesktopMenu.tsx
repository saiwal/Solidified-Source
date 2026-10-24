import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { MdOutlineExpand_more } from "solid-icons/md";
import { navItemHelpTarget } from "@utsukta/spa-core/lib/useNav";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;
import { useI18n } from "@utsukta/spa-core/i18n";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { motion } from "solid-motionone";
void motion;
import type { LayoutChrome } from "@utsukta/spa-core/lib/useLayoutChrome";
import NavItem from "../NavItem";
import Slot from "../Slot";
import NavUtilities from "../NavUtilities";
import ChannelSwitcher from "../ChannelSwitcher";
import { moduleIdForPath } from "@utsukta/spa-core/module-registry";
import { createDragReorder } from "@utsukta/spa-core/lib/useDragReorder";
import { commitNavOrder } from "@utsukta/spa-core/store/nav-order";
import { Collapsible } from "@ui/Collapsible";
import BrandBlock from "./BrandBlock";
import type { NavItemDef } from "@utsukta/spa-core/types/module.types";
import { FavoriteStar } from "../FavoriteStar";
import { categoryApps, favoriteTarget, groupNavItems, pinnedNavItems } from "./app-categories";

// Which rail groups are expanded — a per-browser convenience, so best-effort.
const GROUPS_KEY = "hz-nav-groups";
function readOpenGroups(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function writeOpenGroups(open: Set<string>): void {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify([...open]));
  } catch {
    // private mode / storage full
  }
}

/**
 * Desktop navigation rail (lg and up): brand, primary nav (favorites, then the
 * other apps in collapsible categories), the leftBottom slot,
 * the avatar-anchored action-items overlay and the nav utilities footer.
 *
 * Kept out of Layout.tsx so it can be changed without touching the mobile
 * menu. Receives the shared layout chrome rather than calling
 * useLayoutChrome() itself — that hook owns singleton state (focus
 * restoration, drag reorder, scroll tracking) and must run once per Layout.
 */
export default function DesktopMenu(props: { chrome: LayoutChrome }) {
  const { t } = useI18n();
  const {
    navData,
    desktopNavDrag,
    actionItems,
    actionsOpen,
    setActionsOpen,
    reducedMotion,
    channelSwitcherActive,
    channelMenuOpen,
    setChannelMenuOpen,
    navChannels,
    navViewer,
    navActions,
    closeAll,
    isLocalUser,
    activeModuleId,
    hidesNavChrome,
    navItems,
    viewerRole,
  } = props.chrome;

  // In your own context the rail is favorites (always shown) + the other apps
  // in collapsible categories. Visiting a channel it stays the flat list of
  // that channel's tabs (+ site apps): those are sections of one channel, not
  // apps to categorise. In edit-layout mode the favorites are what's dragged —
  // the server's nav_order only ever sorts pinned apps anyway.
  const grouped = () => viewerRole() === "owner";
  const favorites = createMemo(() => pinnedNavItems(navItems(), navData()?.pinned ?? [], navData()?.pinned_paths));
  const favDrag = createDragReorder(favorites, (i) => i.path, (order) =>
    commitNavOrder(navItems(), order),
  );
  const groups = createMemo(() => {
    const fav = new Set(favorites().map((i) => i.path));
    return groupNavItems(
      navItems().filter((i) => !fav.has(i.path)),
      categoryApps(navData()),
    );
  });

  // A grouped-mode nav entry with a hover/focus star to (un)favorite it.
  const RailItem = (p: { item: NavItemDef; favorite: boolean }) => {
    const draggable = () => p.favorite && editingWidgets();
    return (
      <div
        use:helpable={navItemHelpTarget(p.item)}
        ref={p.favorite ? favDrag.registerRef(p.item.path) : undefined}
        class="group/fav relative"
        classList={{ "rounded-xl border border-dashed border-accent/50": draggable() }}
      >
        <NavItem
          href={p.item.href}
          label={p.item.label}
          icon={p.item.icon}
          badge={p.item.badge}
          draggable={draggable()}
          dragging={favDrag.draggingKey() === p.item.path}
          onDragHandlePointerDown={(e) => {
            e.preventDefault();
            favDrag.beginDrag(p.item);
          }}
        />
        {/* The drag handle takes this corner while editing. */}
        <Show when={!draggable()}>
          <FavoriteStar
            on={p.favorite}
            target={favoriteTarget(p.item, [...(navData()?.pinned ?? []), ...(navData()?.featured ?? [])])}
            size={14}
            class="absolute right-1 top-1/2 -translate-y-1/2 bg-elevated opacity-0 group-hover/fav:opacity-100 focus-visible:opacity-100"
          />
        </Show>
      </div>
    );
  };

  const [openGroups, setOpenGroups] = createSignal(readOpenGroups());
  const setGroupOpen = (id: string, open: boolean) => {
    const next = new Set(openGroups());
    if (open) next.add(id);
    else next.delete(id);
    setOpenGroups(next);
    writeOpenGroups(next);
  };
  // Navigating into an app opens its group, so the active item is never
  // hidden; closing it again afterwards is up to the user.
  createEffect(() => {
    const id = activeModuleId();
    const group = groups().find((g) => g.items.some((i) => moduleIdForPath(i.path) === id));
    if (group && !openGroups().has(group.id)) setGroupOpen(group.id, true);
  });

  return (
    <Show when={!hidesNavChrome()}>
      <aside
        aria-label={t("layout.navigation")}
        class="hidden lg:flex flex-col w-[224px] shrink-0 relative z-20
               bg-surface border-r border-rim py-3 px-2"
      >
        {/* Brand */}
        <div class="flex items-center justify-center px-2 pb-4 pt-2 mb-2 border-b border-rim">
          <BrandBlock banner={navData()?.banner} logoUrl={navData()?.sitelogo} />
        </div>

        {/* Scrollable region: primary nav only. Action items live outside
            this region (below) so they always open as an overlay anchored
            to the avatar, instead of being appended to scrollable content
            that may already be scrolled out of view. */}
        <div class="flex-1 min-h-0 flex flex-col overflow-y-auto">
          <Show
            when={grouped()}
            fallback={
              <>
              {/* Primary nav — reorderable via drag handle while in edit-layout mode */}
              <nav aria-label="Primary" data-tour="nav.primary" class="flex flex-col gap-0.5">
                <For each={desktopNavDrag.displayItems()}>
                  {(item) => (
                    <div
                      ref={desktopNavDrag.registerRef(item.path)}
                      classList={{
                        "rounded-xl border border-dashed border-accent/50":
                          editingWidgets(),
                      }}
                      use:helpable={navItemHelpTarget(item)}
                    >
                      <Show when={item.separatorBefore}>
                        <hr class="my-1.5 mx-2 border-rim" />
                      </Show>
                      <NavItem
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        badge={item.badge}
                        draggable={editingWidgets()}
                        dragging={desktopNavDrag.draggingKey() === item.path}
                        onDragHandlePointerDown={(e) => {
                          e.preventDefault();
                          desktopNavDrag.beginDrag(item);
                        }}
                      />
                    </div>
                  )}
                </For>
              </nav>
              </>
            }
          >
            <nav aria-label="Primary" data-tour="nav.primary" class="flex flex-col gap-0.5">
              <For each={favDrag.displayItems()}>
                {(item) => <RailItem item={item} favorite />}
              </For>

              <div class={`flex flex-col gap-1 ${favorites().length ? "mt-3" : ""}`}>
                <For each={groups()}>
                  {(group) => (
                    <Collapsible
                      open={openGroups().has(group.id)}
                      onOpenChange={(open) => setGroupOpen(group.id, open)}
                      panelClass="flex flex-col gap-0.5 pt-0.5"
                      header={(trigger) => (
                        <button
                          type="button"
                          {...trigger}
                          class="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.625rem] font-semibold uppercase tracking-widest text-muted hover:text-txt hover:bg-elevated transition-colors"
                        >
                          <span class="flex-1 min-w-0 truncate text-left">{t(group.labelKey)}</span>
                          {/* A collapsed group would hide its apps' unread badges. */}
                          <Show when={!openGroups().has(group.id) && group.items.some((i) => (i.badge?.() ?? 0) > 0)}>
                            <span class="w-1.5 h-1.5 rounded-full bg-accent" />
                          </Show>
                          <span aria-hidden="true" class="flex">
                            <MdOutlineExpand_more
                              size={14}
                              class={`transition-transform duration-200 ease-out ${openGroups().has(group.id) ? "rotate-180" : "rotate-0"}`}
                            />
                          </span>
                        </button>
                      )}
                    >
                      <For each={group.items}>
                        {(item) => <RailItem item={item} favorite={false} />}
                      </For>
                    </Collapsible>
                  )}
                </For>
              </div>
            </nav>
          </Show>
        </div>

        <Show when={isLocalUser()}>
          <div class="mt-1">
            <Slot name="leftBottom" moduleId={activeModuleId()} />
          </div>
        </Show>

        {/* Anchor for the action-items overlay: positioned relative so the
            panel below can pin itself to the top of NavUtilities (bottom-full)
            and always open upward, regardless of nav scroll position. */}
        <div class="relative">
          <Show when={actionsOpen() && actionItems().length > 0}>
            <div
              class="absolute inset-x-0 bottom-full z-30 mb-1.5 max-h-[60vh] overflow-y-auto
                     flex flex-col gap-0.5 p-1.5
                     bg-surface border border-rim rounded-xl shadow-xl"
              use:motion={{
                initial: { opacity: 0, y: 8 },
                animate: { opacity: 1, y: 0 },
                transition: {
                  duration: reducedMotion ? 0 : 0.18,
                  easing: "ease-out",
                },
              }}
            >
              <For each={actionItems()}>
                {(item) => (
                  <div use:helpable={navItemHelpTarget(item)}>
                    <Show
                      when={channelSwitcherActive() && item.path === "/manage"}
                      fallback={
                        <NavItem
                          href={item.href}
                          label={item.label}
                          icon={item.icon}
                        />
                      }
                    >
                      <ChannelSwitcher
                        channels={navChannels()}
                        currentNick={navViewer()?.nick}
                        open={channelMenuOpen()}
                        onToggle={() => setChannelMenuOpen((o) => !o)}
                        label={typeof item.label === "function" ? item.label() : item.label}
                        onNavigate={closeAll}
                      />
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <NavUtilities
            viewer={navViewer()}
            actions={navActions()}
            actionsOpen={actionsOpen()}
            onUserMenuToggle={() => setActionsOpen((o) => !o)}
            moduleId={activeModuleId()}
          />
        </div>
      </aside>
    </Show>
  );
}
