import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { A } from "@solidjs/router";
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
import { NavUtilityIcons } from "../NavUtilities";
import ChannelSwitcher from "../ChannelSwitcher";
import { moduleIdForPath } from "@utsukta/spa-core/module-registry";
import { createDragReorder } from "@utsukta/spa-core/lib/useDragReorder";
import { commitNavOrder } from "@utsukta/spa-core/store/nav-order";
import { Collapsible } from "@ui/Collapsible";
import { Avatar } from "@ui/Avatar";
import { IconButton } from "@ui/Button";
import BrandBlock from "./BrandBlock";
import CoverCard from "./CoverCard";
import type { NavItemDef } from "@utsukta/spa-core/types/module.types";
import { FavoriteStar } from "../FavoriteStar";
import { categoryApps, favoriteTarget, groupNavItems, pinnedNavItems } from "./app-categories";

// Which rail groups are expanded — a per-browser convenience, so best-effort.
const GROUPS_KEY = "hz-nav-groups";
// Depth of the scroll region's edge fade, in px (see the mask in DesktopMenu).
const NAV_SCROLL_FADE = 12;
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
 * Desktop navigation rail (lg and up): a cover header (own account menu, or
 * the visited channel), the primary nav (favorites, then the other apps in
 * collapsible categories), the leftBottom slot, then one footer block — the
 * account/visitor actions plus the brand logo and utility icons sharing a
 * single row.
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

  // The account/visitor action items: an overlay under the user's own cover
  // card or, on someone else's channel, under a single "Account" footer entry
  // whose menu opens upward. Visitors with no card of their own (anonymous or
  // remote-auth) keep the inline list, since they only have one or two items.
  const ActionList = () => (
    <For each={actionItems()}>
      {(item) => (
        <div use:helpable={navItemHelpTarget(item)}>
          <Show
            when={channelSwitcherActive() && item.path === "/manage"}
            fallback={<NavItem href={item.href} label={item.label} icon={item.icon} />}
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
  );
  // Your own card on your own pages; anywhere else nothing of yours shows.
  const ownCard = () => !!navViewer()?.is_local && !navData()?.subject;
  // A logged-in user on someone else's channel: Admin / Take me Home / Logout
  // collapse into one entry showing who they belong to.
  const accountEntry = () => !ownCard() && isLocalUser() && actionItems().length > 0;
  // Anonymous and remote-auth visitors have no local identity to fold away.
  const visitorActions = () => !ownCard() && !isLocalUser() && actionItems().length > 0;

  // Scroll-region edge fades: only an edge with hidden content fades, so a
  // short list (a channel with three tabs) isn't dimmed for no reason.
  // Geometry is re-read on scroll, on resize, and whenever the rendered nav
  // changes (a group opening, favorites arriving, edit mode's drag handles).
  let navScrollEl: HTMLDivElement | undefined;
  let navScrollObserver: ResizeObserver | undefined;
  const [fadeTop, setFadeTop] = createSignal(false);
  const [fadeBottom, setFadeBottom] = createSignal(false);
  const syncScrollFades = () => {
    const el = navScrollEl;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setFadeTop(el.scrollTop > 1);
    setFadeBottom(max > 1 && el.scrollTop < max - 1);
  };
  const scrollMask = () => {
    const edge = (on: boolean) => (on ? `${NAV_SCROLL_FADE}px` : "0");
    if (!fadeTop() && !fadeBottom()) {
      return { "mask-image": "none", "-webkit-mask-image": "none" };
    }
    // A stop repeated at the same position is a hard edge, so a side that
    // isn't fading stays fully opaque instead of fading 0px.
    const value =
      `linear-gradient(to bottom, transparent 0, #000 ${edge(fadeTop())}, ` +
      `#000 calc(100% - ${edge(fadeBottom())}), transparent 100%)`;
    return { "mask-image": value, "-webkit-mask-image": value };
  };
  // Bound through the ref rather than onMount so the observer follows the
  // element if chrome mode hides and re-shows the rail.
  const bindScrollEl = (el: HTMLDivElement) => {
    navScrollEl = el;
    navScrollObserver?.disconnect();
    navScrollObserver = new ResizeObserver(syncScrollFades);
    navScrollObserver.observe(el);
    requestAnimationFrame(syncScrollFades);
  };
  onCleanup(() => navScrollObserver?.disconnect());
  createEffect(() => {
    // Read the nav's rendered inputs so the geometry is re-measured after
    // they change; rAF waits for the DOM commit.
    navItems();
    openGroups();
    editingWidgets();
    requestAnimationFrame(syncScrollFades);
  });

  return (
    <Show when={!hidesNavChrome()}>
      <aside
        aria-label={t("layout.navigation")}
        class="hidden lg:flex flex-col w-[224px] shrink-0 relative z-20
               bg-surface border-r border-rim py-3 px-2"
      >
        {/* Brand: centred lockup with its own rule under it, above the cover. */}
        <div class="flex items-center justify-center px-2 pb-4 pt-2 mb-2 border-b border-rim">
          <BrandBlock banner={navData()?.banner} logoUrl={navData()?.sitelogo} />
        </div>

        {/* Full-bleed cover header under the masthead: the visited channel
            (static) for anyone but its owner, else the signed-in user's own
            card, which opens their account menu. */}
        <Show
          when={navData()?.subject}
          fallback={
            <Show when={ownCard()}>
              <div class="relative -mx-2 mb-2">
                <CoverCard
                  who={navViewer()!}
                  open={actionsOpen()}
                  onToggle={() => setActionsOpen((o) => !o)}
                />
                <Show when={actionsOpen() && actionItems().length > 0}>
                  <div
                    class="absolute inset-x-2 top-full z-30 mt-1.5 max-h-[60vh] overflow-y-auto
                           flex flex-col gap-0.5 p-1.5
                           bg-surface border border-rim rounded-xl shadow-xl"
                    use:motion={{
                      initial: { opacity: 0, y: -8 },
                      animate: { opacity: 1, y: 0 },
                      transition: { duration: reducedMotion ? 0 : 0.18, easing: "ease-out" },
                    }}
                  >
                    <ActionList />
                  </div>
                </Show>
              </div>
            </Show>
          }
        >
          {(subject) => (
            <div class="-mx-2 mb-2">
              <CoverCard who={subject()} channelHref={`/channel/${subject().nick}`} />
            </div>
          )}
        </Show>

        {/* Scrollable region: primary nav only. `nav-rail-scroll` hides the
            thin scrollbar until the rail is hovered/focused; the inline mask
            fades whichever edge still has hidden rows. */}
        <div
          ref={bindScrollEl}
          onScroll={syncScrollFades}
          style={scrollMask()}
          class="nav-rail-scroll flex-1 min-h-0 flex flex-col overflow-y-auto"
        >
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

        {/* One footer block, one rule, one row. The brand now lives in the
            masthead at the top, so the bottom is only the account/visitor
            actions (when they exist) and the utility strip. */}
        <div class="mt-2 border-t border-rim pt-1.5 flex flex-col gap-0.5">
          <Show when={accountEntry()}>
            <div class="relative">
              {/* Your own identity, not a generic "Account" label: visiting
                  someone else's channel hides your cover card, so this row is
                  the only place the rail says who the actions belong to. The
                  name (and avatar) link to your channel; the chevron opens the
                  account menu — the same overlay the own cover opens down. */}
              <div
                class={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm
                        transition-colors duration-150 ${actionsOpen() ? "bg-elevated" : ""}`}
              >
                <Show
                  when={navViewer()?.nick}
                  fallback={
                    <span class="flex min-w-0 flex-1 items-center gap-3 text-muted">
                      <Avatar
                        src={navViewer()?.avatar}
                        name={navViewer()?.name}
                        size={6}
                        class="shrink-0"
                      />
                      <span class="min-w-0 truncate leading-tight">
                        {navViewer()?.name || t("layout.account")}
                      </span>
                    </span>
                  }
                >
                  <A
                    href={`/channel/${navViewer()!.nick}`}
                    class="group flex min-w-0 flex-1 items-center gap-3 text-muted
                           transition-colors hover:text-txt"
                  >
                    <Avatar
                      src={navViewer()?.avatar}
                      name={navViewer()?.name}
                      size={6}
                      class="shrink-0"
                    />
                    <span class="min-w-0 truncate leading-tight text-left group-hover:underline group-hover:underline-offset-2">
                      {navViewer()?.name || t("layout.account")}
                    </span>
                  </A>
                </Show>
                <div class="shrink-0" use:helpable="nav.account_menu">
                  <IconButton
                    label={t("layout.account")}
                    size="sm"
                    aria-expanded={actionsOpen()}
                    class={actionsOpen() ? "text-txt" : ""}
                    onClick={() => setActionsOpen((o) => !o)}
                  >
                    <MdOutlineExpand_more
                      size={16}
                      class={`transition-transform duration-200 ease-out
                              ${actionsOpen() ? "rotate-180" : "rotate-0"}`}
                    />
                  </IconButton>
                </div>
              </div>
              <Show when={actionsOpen()}>
                <div
                  class="absolute inset-x-0 bottom-full z-30 mb-1.5 max-h-[60vh] overflow-y-auto
                         flex flex-col gap-0.5 p-1.5
                         bg-surface border border-rim rounded-xl shadow-xl"
                  use:motion={{
                    initial: { opacity: 0, y: 8 },
                    animate: { opacity: 1, y: 0 },
                    transition: { duration: reducedMotion ? 0 : 0.18, easing: "ease-out" },
                  }}
                >
                  <ActionList />
                </div>
              </Show>
            </div>
          </Show>

          {/* Visitors' inline menu (Sign In / Remote Auth / Register). */}
          <Show when={visitorActions()}>
            <ActionList />
          </Show>

          {/* Utility strip. The 4px inset keeps the first and last glyphs on
              the same 18px edge as the masthead, cover identity and nav icons;
              the controls get a tighter hit area than their standalone default
              so all five fit. */}
          <NavUtilityIcons
            moduleId={activeModuleId()}
            class="flex items-center justify-between px-1 [&_a]:p-1.5 [&_button]:p-1.5"
          />
        </div>
      </aside>
    </Show>
  );
}
