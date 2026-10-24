import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import {
  MdFillChevron_right,
  MdFillGrid_view,
  MdOutlineCheck,
  MdOutlineClose,
  MdOutlinePerson,
  MdOutlineStar,
} from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;
import { notifCount } from "@utsukta/spa-core/lib/notificationCount";
import { notifyCountLimit } from "@utsukta/spa-core/store/auth-store";
import type { LayoutChrome } from "@utsukta/spa-core/lib/useLayoutChrome";
import type { NavItemDef } from "@utsukta/spa-core/types/module.types";
import { formatCount } from "@/modules/notify/rows";
import { Avatar } from "@ui/Avatar";
import { IconButton } from "@ui/Button";
import { Menu, MenuItem, MenuSeparator } from "@ui/Menu";
import { getNavIcon } from "../NavItem";
import { switchToChannel } from "../ChannelSwitcher";
import AppDrawer, { TileFace, tileClass } from "./AppDrawer";
import { pinnedNavItems } from "./app-categories";

function labelOf(item: NavItemDef): string {
  return typeof item.label === "function" ? item.label() : item.label;
}

function hrefOf(item: NavItemDef): string {
  return typeof item.href === "function" ? item.href() : item.href;
}

/**
 * Mobile navigation (below lg): the app drawer and the bottom bar that opens
 * it. The bar holds the app drawer, a quick menu of the user's pinned apps,
 * the current module's contextual actions and the right-panel toggle.
 *
 * Receives the shared layout chrome rather than calling useLayoutChrome()
 * itself — that hook owns singleton state (focus restoration, drag reorder,
 * scroll tracking) and must run once per Layout.
 */
export default function MobileMenu(props: { chrome: LayoutChrome }) {
  const { t } = useI18n();
  const location = useLocation();
  const {
    hidesNavChrome,
    moreOpen,
    setMoreOpen,
    setMoreButtonRef,
    navData,
    navItems,
    navViewer,
    actionItems,
    setRightOpen,
    rightOpen,
    hidesRightSidebar,
    setPanelButtonRef,
    channelSwitcherActive,
    navChannels,
  } = props.chrome;

  const favorites = createMemo(() => pinnedNavItems(navItems(), navData()?.pinned ?? [], navData()?.pinned_paths));
  const isAuthenticated = () =>
    !!(navViewer()?.is_local || navViewer()?.is_remote || navViewer()?.is_admin);

  // ── Favorites sheet ──────────────────────────────────────────────────────
  // Page actions live in the floating column and the title row's ⋮
  // (FloatingActions / PageActions), so this sheet only ever holds favorites.
  const [favOpen, setFavOpen] = createSignal(false);
  const [sheetRef, setSheetRef] = createSignal<HTMLElement>();
  let favButtonRef: HTMLButtonElement | undefined;

  createEffect(() => {
    const el = sheetRef();
    if (el) el.inert = !favOpen();
  });
  // Move focus into the sheet on open and back to its trigger on close, the
  // same pattern useLayoutChrome uses for the drawers.
  createEffect(
    on(
      favOpen,
      (open) => {
        if (open) {
          requestAnimationFrame(() =>
            sheetRef()
              ?.querySelector<HTMLElement>("button, a, input, select, textarea")
              ?.focus({ preventScroll: true }),
          );
        } else {
          favButtonRef?.focus({ preventScroll: true });
        }
      },
      { defer: true },
    ),
  );
  createEffect(on(() => location.pathname, () => setFavOpen(false), { defer: true }));

  const toggleDrawer = () => {
    const next = !moreOpen();
    setMoreOpen(next);
    setRightOpen(false);
    setFavOpen(false);
  };
  const toggleFavorites = () => {
    setFavOpen((o) => !o);
    setMoreOpen(false);
    setRightOpen(false);
  };
  const togglePanel = () => {
    const next = !rightOpen();
    setRightOpen(next);
    setMoreOpen(false);
    setFavOpen(false);
  };

  return (
    <Show when={!hidesNavChrome()}>
      <AppDrawer chrome={props.chrome} />

      {/* ═══════════════════════════════════════════════════════
          MOBILE — favorites sheet
      ═══════════════════════════════════════════════════════ */}
      <div
        id="favorites-sheet"
        ref={setSheetRef}
        role="dialog"
        aria-label={t("layout.favorites")}
        class={`
          fixed left-0 right-0 z-40 lg:hidden bottom-16
          bg-surface border-t border-rim
          rounded-t-2xl shadow-2xl
          transform transition-transform duration-300 ease-in-out
          max-h-[70vh] overflow-y-auto overscroll-contain
          ${favOpen() ? "translate-y-0" : "translate-y-full"}
        `}
      >
        <div class="mx-auto mt-3 mb-3 w-9 h-1 rounded-full bg-rim" />
        <div class="flex items-start gap-2 px-4 pb-3">
          <p class="min-w-0 flex-1 text-sm font-semibold text-txt truncate">{t("layout.favorites")}</p>
          <IconButton label={t("layout.close")} onClick={() => setFavOpen(false)}>
            <MdOutlineClose size={18} />
          </IconButton>
        </div>
        <Show
          when={favorites().length > 0}
          fallback={<p class="px-4 pb-6 text-sm text-muted">{t("layout.no_favorites")}</p>}
        >
          <div class="grid grid-cols-4 gap-1 px-3 pb-5">
            <For each={favorites()}>
              {(item) => (
                <A
                  href={hrefOf(item)}
                  onClick={() => setFavOpen(false)}
                  activeClass="hz-active !text-accent-txt"
                  class={tileClass}
                >
                  <TileFace icon={getNavIcon(item.icon, 24)} label={labelOf(item)} />
                </A>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Backdrop for the sheet — the drawer's backdrop lives in Layout.tsx
          because it also covers the right sidebar. */}
      <Show when={favOpen()}>
        <div
          aria-hidden="true"
          class="fixed inset-0 z-30 lg:hidden bg-black/25"
          onClick={() => setFavOpen(false)}
        />
      </Show>

      {/* ═══════════════════════════════════════════════════════
          MOBILE — Bottom Bar
      ═══════════════════════════════════════════════════════ */}
      <nav
        aria-label={t("layout.navigation")}
        data-tour="nav.bottom"
        // z-[55], above the composer dock's minimized pills (z-50, which
        // sit just over this bar at bottom-16): if they ever overlap, the
        // pill's edge gets clipped rather than a nav button becoming
        // untappable. Still below the nested-picker band (z-[60]).
        class="fixed bottom-0 left-0 right-0 z-[55] h-16 lg:hidden
               bg-surface border-t border-rim
               flex items-center px-2 gap-1"
      >
        {/* Account menu */}
        <Menu
          label={t("layout.account")}
          placement="top-start"
          class="w-56"
          onOpenChange={(open) => {
            if (!open) return;
            setMoreOpen(false);
            setFavOpen(false);
            setRightOpen(false);
          }}
          trigger={(triggerProps, open) => (
            <button
              {...triggerProps}
              data-tour="nav.user_menu"
              use:helpable="nav.account_menu"
              class={`flex-1 min-w-0 px-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl
                      text-[0.625rem] font-medium transition-colors
                      ${
                        open()
                          ? "text-txt bg-elevated"
                          : "text-muted hover:bg-elevated"
                      }`}
            >
              <span aria-hidden="true" class="flex items-center justify-center h-[22px]">
                <Show
                  when={isAuthenticated()}
                  fallback={<MdOutlinePerson size={22} />}
                >
                  <Avatar
                    src={navViewer()!.avatar}
                    name={navViewer()!.name}
                    size={6}
                    shape="rounded"
                    class="select-none"
                  />
                </Show>
              </span>
              <span class="max-w-full truncate">{t("layout.account")}</span>
            </button>
          )}
        >
          <Show when={isAuthenticated()}>
            <p
              role="presentation"
              class="px-3 pt-1 pb-1 text-sm font-semibold text-txt truncate"
            >
              {navViewer()!.name}
            </p>
          </Show>
          <For each={actionItems()}>
            {(item) => (
              <Show
                when={channelSwitcherActive() && item.path === "/manage"}
                fallback={
                  <MenuItem href={hrefOf(item)} icon={getNavIcon(item.icon, 16)}>
                    <span class="min-w-0 flex-1 truncate">{labelOf(item)}</span>
                  </MenuItem>
                }
              >
                {/* The desktop rail expands Manage into the channel switcher;
                    a menu can't nest an accordion, so the same entries sit
                    flat in its place. */}
                <MenuSeparator />
                <For each={navChannels()}>
                  {(ch) => {
                    const isCurrent = () => ch.nick === navViewer()?.nick;
                    return (
                      <MenuItem
                        icon={getNavIcon("person", 16)}
                        disabled={isCurrent()}
                        aria-current={isCurrent() ? "true" : undefined}
                        onClick={() => void switchToChannel(ch.id)}
                      >
                        <span class={`min-w-0 flex-1 truncate ${isCurrent() ? "font-medium" : ""}`}>{ch.name}</span>
                        <Show when={isCurrent()}>
                          <MdOutlineCheck size={14} class="shrink-0 text-accent-txt" />
                        </Show>
                      </MenuItem>
                    );
                  }}
                </For>
                <MenuItem href="/new_channel" icon={getNavIcon("register", 16)}>
                  <span class="min-w-0 flex-1 truncate">{t("nav.new_channel")}</span>
                </MenuItem>
                <MenuItem href="/manage" icon={getNavIcon("manage", 16)}>
                  <span class="min-w-0 flex-1 truncate">{t("nav.manage_channels")}</span>
                </MenuItem>
                <MenuSeparator />
              </Show>
            )}
          </For>
        </Menu>

        {/* Favorites quick menu — always there, so the bar never reflows */}
          <button
            ref={favButtonRef}
            onClick={toggleFavorites}
            aria-expanded={favOpen()}
            aria-controls="favorites-sheet"
            use:helpable="nav.favorites"
            class={`flex-1 min-w-0 px-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl
                    text-[0.625rem] font-medium transition-colors
                    ${
                      favOpen()
                        ? "text-txt bg-elevated"
                        : "text-muted hover:bg-elevated"
                    }`}
          >
            <span aria-hidden="true" class="flex">
              <MdOutlineStar size={22} />
            </span>
            <span class="max-w-full truncate">{t("layout.favorites")}</span>
          </button>

        {/* App drawer */}
        <button
          ref={setMoreButtonRef}
          onClick={toggleDrawer}
          aria-expanded={moreOpen()}
          aria-controls="app-drawer"
          use:helpable="nav.apps"
          class={`flex-1 min-w-0 px-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl
                  text-[0.625rem] font-medium transition-colors
                  ${
                    moreOpen()
                      ? "text-txt bg-elevated"
                      : "text-muted hover:bg-elevated"
                  }`}
        >
          <span aria-hidden="true" class="flex">
            <MdFillGrid_view size={22} />
          </span>
          <span class="max-w-full truncate">{t("layout.apps")}</span>
        </button>

        {/* Panel — kept in place (disabled) on pages without a sidebar, so the
            bar never reflows */}
          <button
            ref={setPanelButtonRef}
            onClick={togglePanel}
            disabled={hidesRightSidebar()}
            aria-expanded={rightOpen()}
            aria-controls="right-sidebar"
            aria-label={rightOpen() ? "Close panel" : "Open panel"}
            use:helpable="nav.panel"
            class={`flex-1 min-w-0 px-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl
                    text-[0.625rem] font-medium transition-colors
                    ${
                      rightOpen()
                        ? "text-txt bg-elevated"
                        : "text-muted hover:bg-elevated"
                    } disabled:opacity-40 disabled:pointer-events-none`}
          >
            <span class="relative flex items-center justify-center">
              <span
                style={`display:flex; transform: rotate(${rightOpen() ? "180deg" : "0deg"}); transition: transform 200ms`}
              >
                <MdFillChevron_right size={22} />
              </span>
              <Show when={!rightOpen() && !hidesRightSidebar() && notifCount() > 0}>
                <span
                  class="absolute -top-2 -right-1.5 min-w-[14px] h-[14px] px-[3px]
                         rounded-full bg-accent text-accent-fg
                         text-[0.5625rem] font-bold leading-[14px] text-center
                         pointer-events-none select-none"
                >
                  {formatCount(notifCount(), notifyCountLimit())}
                </span>
              </Show>
            </span>
            <span class="max-w-full truncate">{t("layout.panel")}</span>
          </button>
      </nav>
    </Show>
  );
}
