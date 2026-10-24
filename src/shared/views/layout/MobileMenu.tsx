import { createEffect, createMemo, createSignal, For, lazy, on, Show, Suspense } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import {
  MdFillChevron_right,
  MdFillEdit,
  MdFillGrid_view,
  MdOutlineBolt,
  MdOutlineCheck,
  MdOutlineClose,
  MdOutlinePerson,
  MdOutlineStar,
} from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;
import { getModule } from "@utsukta/spa-core/module-registry";
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
import { hasPageActions, pageActions } from "./PageActions";

function labelOf(item: NavItemDef): string {
  return typeof item.label === "function" ? item.label() : item.label;
}

function hrefOf(item: NavItemDef): string {
  return typeof item.href === "function" ? item.href() : item.href;
}

// Loaded only when the actions sheet falls back to it (no page actions on
// this page), so the compose widget stays out of the shell bundle.
const QuickCompose = lazy(() => import("@/modules/hq/widgets/QuickComposeWidget"));

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
    activeModuleId,
    viewerRole,
    channelSwitcherActive,
    navChannels,
  } = props.chrome;

  const favorites = createMemo(() => pinnedNavItems(navItems(), navData()?.pinned ?? [], navData()?.pinned_paths));
  const isAuthenticated = () =>
    !!(navViewer()?.is_local || navViewer()?.is_remote || navViewer()?.is_admin);

  // Quick compose is self-targeted (new post/message/article on your own
  // channel), so the fallback is for the owner only. The bar button stays
  // visible on their pages even when the module has no header actions.
  const canCompose = () => viewerRole() === "owner";
  const showActionsButton = () => hasPageActions() || canCompose();

  // ── Bottom sheet: contextual actions or favorites ──────────────────────────
  // One sheet, two contents, so only one can ever be up.
  const [sheet, setSheet] = createSignal<"actions" | "favorites" | null>(null);
  const sheetOpen = () => sheet() !== null;
  const [sheetRef, setSheetRef] = createSignal<HTMLElement>();
  let sheetButtonRef: HTMLButtonElement | undefined;
  let favButtonRef: HTMLButtonElement | undefined;

  createEffect(() => {
    const el = sheetRef();
    if (el) el.inert = !sheetOpen();
  });
  // Move focus into the sheet on open and back to its trigger on close, the
  // same pattern useLayoutChrome uses for the drawers.
  createEffect(
    on(
      sheet,
      (open, prevOpen) => {
        if (open) {
          requestAnimationFrame(() =>
            sheetRef()
              ?.querySelector<HTMLElement>("button, a, input, select, textarea")
              ?.focus({ preventScroll: true }),
          );
        } else if (prevOpen) {
          (prevOpen === "favorites" ? favButtonRef : sheetButtonRef)?.focus({ preventScroll: true });
        }
      },
      { defer: true },
    ),
  );
  // A navigation invalidates the current page's actions, so don't leave the
  // sheet floating over the next page.
  createEffect(
    on(
      () => location.pathname,
      () => setSheet(null),
      { defer: true },
    ),
  );
  createEffect(() => {
    if (sheet() === "actions" && !showActionsButton()) setSheet(null);
    if (sheet() === "favorites" && favorites().length === 0) setSheet(null);
  });

  const toggleDrawer = () => {
    const next = !moreOpen();
    setMoreOpen(next);
    setRightOpen(false);
    setSheet(null);
  };
  const toggleSheet = (kind: "actions" | "favorites") => {
    setSheet((cur) => (cur === kind ? null : kind));
    setMoreOpen(false);
    setRightOpen(false);
  };
  const togglePanel = () => {
    const next = !rightOpen();
    setRightOpen(next);
    setMoreOpen(false);
    setSheet(null);
  };

  const moduleLabel = () => {
    const label = getModule(activeModuleId())?.navItem?.label;
    return typeof label === "function" ? label() : (label ?? t("layout.actions"));
  };

  const sheetTitle = () =>
    sheet() === "favorites"
      ? t("layout.favorites")
      : hasPageActions()
        ? moduleLabel()
        : t("layout.quick_compose");

  return (
    <Show when={!hidesNavChrome()}>
      <AppDrawer chrome={props.chrome} />

      {/* ═══════════════════════════════════════════════════════
          MOBILE — contextual actions for the current module
      ═══════════════════════════════════════════════════════ */}
      <div
        id="page-actions-sheet"
        ref={setSheetRef}
        role="dialog"
        aria-label={sheetTitle()}
        class={`
          fixed left-0 right-0 z-40 lg:hidden bottom-16
          bg-surface border-t border-rim
          rounded-t-2xl shadow-2xl
          transform transition-transform duration-300 ease-in-out
          max-h-[70vh] overflow-y-auto overscroll-contain
          ${sheetOpen() ? "translate-y-0" : "translate-y-full"}
        `}
      >
        <div class="mx-auto mt-3 mb-3 w-9 h-1 rounded-full bg-rim" />
        <div class="flex items-start gap-2 px-4 pb-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-txt truncate">
              {sheetTitle()}
            </p>
          </div>
          <IconButton label={t("layout.close")} onClick={() => setSheet(null)}>
            <MdOutlineClose size={18} />
          </IconButton>
        </div>
        {/* Favorites as drawer tiles; otherwise the header's PageActions as
            rows, falling back to quick compose on pages without them. */}
        <Show
          when={sheet() !== "favorites"}
          fallback={
            <div class="grid grid-cols-4 gap-1 px-3 pb-5">
              <For each={favorites()}>
                {(item) => (
                  <A
                    href={hrefOf(item)}
                    onClick={() => setSheet(null)}
                    activeClass="hz-active !text-accent-txt"
                    class={tileClass}
                  >
                    <TileFace icon={getNavIcon(item.icon, 24)} label={labelOf(item)} />
                  </A>
                )}
              </For>
            </div>
          }
        >
        <Show
          when={hasPageActions()}
          fallback={
            <Show when={sheet() === "actions"}>
              <div class="px-4 pb-5">
                <Suspense fallback={<div class="h-10" />}>
                  <QuickCompose />
                </Suspense>
              </div>
            </Show>
          }
        >
          <div class="grid grid-cols-4 gap-1 px-3 pb-5">
            <For each={pageActions()}>
              {(a) => {
                const body = <TileFace icon={a.icon?.({ size: 24 })} label={a.label} />;
                const cls = `${tileClass} disabled:opacity-60 disabled:pointer-events-none ${a.primary ? "!text-accent-txt font-semibold" : ""}`;
                return a.href ? (
                  <a
                    href={a.href}
                    download={a.download}
                    title={a.title}
                    class={cls}
                    onClick={() => setSheet(null)}
                  >
                    {body}
                  </a>
                ) : (
                  <button
                    type="button"
                    title={a.title}
                    disabled={a.disabled}
                    class={cls}
                    onClick={() => {
                      setSheet(null);
                      a.onClick?.();
                    }}
                  >
                    {body}
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
        </Show>
      </div>

      {/* Backdrop for the actions sheet — the drawer's backdrop lives in
          Layout.tsx because it also covers the right sidebar. */}
      <Show when={sheetOpen()}>
        <div
          aria-hidden="true"
          class="fixed inset-0 z-30 lg:hidden bg-black/25"
          onClick={() => setSheet(null)}
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
            setSheet(null);
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

        {/* Favorites quick menu */}
        <Show when={favorites().length > 0}>
          <button
            ref={favButtonRef}
            onClick={() => toggleSheet("favorites")}
            aria-expanded={sheet() === "favorites"}
            aria-controls="page-actions-sheet"
            use:helpable="nav.favorites"
            class={`flex-1 min-w-0 px-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl
                    text-[0.625rem] font-medium transition-colors
                    ${
                      sheet() === "favorites"
                        ? "text-txt bg-elevated"
                        : "text-muted hover:bg-elevated"
                    }`}
          >
            <span aria-hidden="true" class="flex">
              <MdOutlineStar size={22} />
            </span>
            <span class="max-w-full truncate">{t("layout.favorites")}</span>
          </button>
        </Show>

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

        {/* Current page's header actions, or quick compose when it has none */}
        <Show when={showActionsButton()}>
          <button
            ref={sheetButtonRef}
            onClick={() => toggleSheet("actions")}
            aria-expanded={sheet() === "actions"}
            aria-controls="page-actions-sheet"
            use:helpable="nav.actions"
            class={`flex-1 min-w-0 px-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl
                    text-[0.625rem] font-medium transition-colors
                    ${
                      sheet() === "actions"
                        ? "text-txt bg-elevated"
                        : "text-muted hover:bg-elevated"
                    }`}
          >
            <span aria-hidden="true" class="flex">
              <Show when={hasPageActions()} fallback={<MdFillEdit size={22} />}>
                <MdOutlineBolt size={22} />
              </Show>
            </span>
            <span class="max-w-full truncate">
              {hasPageActions() ? moduleLabel() : t("layout.compose")}
            </span>
          </button>
        </Show>

        <Show when={!hidesRightSidebar()}>
          <button
            ref={setPanelButtonRef}
            onClick={togglePanel}
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
                    }`}
          >
            <span class="relative flex items-center justify-center">
              <span
                style={`display:flex; transform: rotate(${rightOpen() ? "180deg" : "0deg"}); transition: transform 200ms`}
              >
                <MdFillChevron_right size={22} />
              </span>
              <Show when={!rightOpen() && notifCount() > 0}>
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
        </Show>
      </nav>
    </Show>
  );
}
