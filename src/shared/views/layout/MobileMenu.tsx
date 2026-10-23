import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import {
  MdFillChevron_right,
  MdFillMore_horiz,
} from "solid-icons/md";
import { navItemHelpTarget } from "@utsukta/spa-core/lib/useNav";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;
import { useI18n } from "@utsukta/spa-core/i18n";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { motion } from "solid-motionone";
void motion;
import { notifCount } from "@utsukta/spa-core/lib/notificationCount";
import { notifyCountLimit } from "@utsukta/spa-core/store/auth-store";
import type { LayoutChrome } from "@utsukta/spa-core/lib/useLayoutChrome";
import { formatCount } from "@/modules/notify/rows";
import { getNavIcon } from "../NavItem";
import { ChannelSwitcherTiles } from "../ChannelSwitcher";
import NavUtilities from "../NavUtilities";
import BrandBlock from "./BrandBlock";

// ── Mobile bottom tab ─────────────────────────────────────────────────────────
function MobileTab(props: {
  href: string | (() => string);
  label: string | (() => string);
  icon?: string;
  badge?: () => number | undefined;
}) {
  const href = () =>
    typeof props.href === "function" ? props.href() : props.href;
  const label = () =>
    typeof props.label === "function" ? props.label() : props.label;

  return (
    <A
      href={href()}
      end={href() === "/"}
      class="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl
             text-muted hover:text-txt hover:bg-elevated
             transition-colors min-w-0"
      activeClass="!text-txt"
    >
      <span aria-hidden="true" class="relative flex items-center">
        {getNavIcon(props.icon, 22)}
        {/* A dot, not a count: at tab-bar size a number is unreadable. */}
        <Show when={props.badge?.()}>
          <span class="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-accent" />
        </Show>
      </span>
      <span class="text-[0.625rem] font-medium leading-tight truncate max-w-[52px]">
        {label()}
      </span>
    </A>
  );
}

/**
 * Mobile navigation (below lg): the "More" bottom-sheet drawer and the bottom
 * tab bar. Both live here so mobile nav can be changed without touching the
 * desktop rail.
 *
 * Receives the shared layout chrome rather than calling useLayoutChrome()
 * itself — that hook owns singleton state (focus restoration, drag reorder,
 * scroll tracking) and must run once per Layout.
 */
export default function MobileMenu(props: { chrome: LayoutChrome }) {
  const { t } = useI18n();
  const {
    hidesNavChrome,
    overflowItems,
    moreOpen,
    setMoreOpen,
    setMorePanelRef,
    moreDrawerDrag,
    navData,
    actionsOpen,
    setActionsOpen,
    actionItems,
    channelSwitcherActive,
    channelMenuOpen,
    setChannelMenuOpen,
    navChannels,
    navViewer,
    navActions,
    activeModuleId,
    closeAll,
    reducedMotion,
    bottomTabDrag,
    setMoreButtonRef,
    hidesRightSidebar,
    rightOpen,
    setRightOpen,
    setPanelButtonRef,
  } = props.chrome;

  return (
    <>
      {/* ═══════════════════════════════════════════════════════
          MOBILE — "More" bottom sheet drawer
      ═══════════════════════════════════════════════════════ */}
      <Show when={!hidesNavChrome()}>
        <nav
          id="more-drawer"
          ref={setMorePanelRef}
          aria-label={t("layout.more")}
          class={`
            fixed left-0 right-0 z-40 lg:hidden
            bg-surface border-t border-rim
            rounded-t-2xl shadow-2xl px-0 pt-0 pb-3
            transform transition-transform duration-300 ease-in-out
            max-h-[72vh] overflow-y-auto overscroll-contain
            ${moreOpen() ? "translate-y-0 bottom-16" : "translate-y-full bottom-16"}
          `}
        >
          <div class="mx-auto mt-3 mb-4 w-9 h-1 rounded-full bg-rim" />

          {/* Brand */}
          <div class="flex items-center justify-center px-4 pb-3 mb-1 border-b border-rim">
            <BrandBlock banner={navData()?.banner} logoUrl={navData()?.sitelogo} />
          </div>

          {/* ── Nav tiles — reorderable via drag ── */}
          <Show when={overflowItems().length > 0}>
            <p class="px-4 pb-2 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
              {t("layout.navigation")}
            </p>
            <div class="grid grid-cols-4 md:grid-cols-10 gap-1.5 px-2.5 pb-4">
              <For each={moreDrawerDrag.displayItems()}>
                {(item) => (
                  <>
                  <Show when={item.separatorBefore}>
                    <hr class="col-span-full my-1 border-rim" />
                  </Show>
                  <div
                    ref={moreDrawerDrag.registerRef(item.path)}
                    onPointerDown={
                      editingWidgets()
                        ? moreDrawerDrag.onTilePointerDown(item)
                        : undefined
                    }
                    classList={{
                      "opacity-50":
                        moreDrawerDrag.draggingKey() === item.path,
                      "touch-none rounded-xl border border-dashed border-accent/50":
                        editingWidgets(),
                    }}
                    use:helpable={navItemHelpTarget(item)}
                  >
                    <A
                      href={
                        typeof item.href === "function"
                          ? item.href()
                          : item.href
                      }
                      onClick={closeAll}
                      class="flex flex-col items-center gap-1.5 py-2.5 px-1
                             rounded-xl bg-elevated border border-rim
                             text-txt text-xs font-medium leading-tight text-center
                             hover:brightness-95 transition-all"
                    >
                      <span aria-hidden="true" class="text-muted">
                        {getNavIcon(item.icon, 20)}
                      </span>
                      <span class="truncate w-full text-center">
                        {typeof item.label === "function"
                          ? item.label()
                          : item.label}
                      </span>
                    </A>
                  </div>
                  </>
                )}
              </For>
            </div>
          </Show>

          {/* Action items — toggled by avatar click for authenticated users */}
          <Show when={actionsOpen() && actionItems().length > 0}>
            {/* Channel-switcher subsection — its own labeled group, kept
                visually distinct from the actions grid below it. */}
            <Show when={channelSwitcherActive() && channelMenuOpen()}>
              <p class="px-4 pb-2 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
                {t("nav.channels")}
              </p>
              <div
                use:motion={{
                  initial: { opacity: 0, y: 8 },
                  animate: { opacity: 1, y: 0 },
                  transition: {
                    duration: reducedMotion ? 0 : 0.2,
                    easing: [0.25, 0.46, 0.45, 0.94],
                  },
                }}
                class="grid grid-cols-4 md:grid-cols-10 gap-1.5 px-2.5 pb-4"
              >
                <ChannelSwitcherTiles
                  channels={navChannels()}
                  currentNick={navViewer()?.nick}
                  onNavigate={closeAll}
                />
              </div>
            </Show>
            <p class="px-4 pb-2 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
              {t("layout.more")}
            </p>
            <div
              use:motion={{
                initial: { opacity: 0, y: 14 },
                animate: { opacity: 1, y: 0 },
                transition: {
                  duration: reducedMotion ? 0 : 0.2,
                  easing: [0.25, 0.46, 0.45, 0.94],
                },
              }}
              class="grid grid-cols-4 md:grid-cols-10 gap-1.5 px-2.5 pb-4"
            >
              <For each={actionItems()}>
                {(item) => (
                  <div use:helpable={navItemHelpTarget(item)}>
                    <Show
                      when={channelSwitcherActive() && item.path === "/manage"}
                      fallback={
                        <A
                          href={
                            typeof item.href === "function"
                              ? item.href()
                              : item.href
                          }
                          onClick={closeAll}
                          class="flex flex-col items-center gap-1.5 py-2.5 px-1
                                 rounded-xl bg-elevated border border-rim
                                 text-txt text-xs font-medium leading-tight text-center
                                 hover:brightness-95 transition-all"
                        >
                          <span aria-hidden="true" class="text-muted">
                            {getNavIcon(item.icon, 20)}
                          </span>
                          <span class="truncate w-full text-center">
                            {typeof item.label === "function"
                              ? item.label()
                              : item.label}
                          </span>
                        </A>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => setChannelMenuOpen((o) => !o)}
                        aria-expanded={channelMenuOpen()}
                        class={`flex flex-col items-center gap-1.5 py-2.5 px-1 w-full
                               rounded-xl border text-xs font-medium leading-tight text-center
                               transition-all cursor-pointer
                               ${
                                 channelMenuOpen()
                                   ? "border-accent bg-accent/10 text-accent"
                                   : "bg-elevated border-rim text-txt hover:brightness-95"
                               }`}
                      >
                        <span aria-hidden="true" class={channelMenuOpen() ? "" : "text-muted"}>
                          {getNavIcon(item.icon, 20)}
                        </span>
                        <span class="truncate w-full text-center">
                          {typeof item.label === "function"
                            ? item.label()
                            : item.label}
                        </span>
                      </button>
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
        </nav>
      </Show>

      {/* ═══════════════════════════════════════════════════════
          MOBILE — Bottom Tab Bar
      ═══════════════════════════════════════════════════════ */}
      <Show when={!hidesNavChrome()}>
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
          <For each={bottomTabDrag.displayItems()}>
            {(item) => (
              <div
                ref={bottomTabDrag.registerRef(item.path)}
                onPointerDown={
                  editingWidgets()
                    ? bottomTabDrag.onTilePointerDown(item)
                    : undefined
                }
                classList={{
                  "opacity-50": bottomTabDrag.draggingKey() === item.path,
                  "touch-none rounded-xl border border-dashed border-accent/50":
                    editingWidgets(),
                }}
                class="flex-1 min-w-0 flex"
                use:helpable={navItemHelpTarget(item)}
              >
                <MobileTab
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  badge={item.badge}
                />
              </div>
            )}
          </For>

          {/* <Show when={moreItems().length > 0}> */}
          <button
            ref={setMoreButtonRef}
            onClick={() => {
              setMoreOpen((o) => !o);
              setRightOpen(false);
            }}
            aria-expanded={moreOpen()}
            aria-controls="more-drawer"
            use:helpable="nav.more_drawer"
            class={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl
                      text-[0.625rem] font-medium transition-colors min-w-0
                      ${
                        moreOpen()
                          ? "text-txt bg-elevated"
                          : "text-muted hover:bg-elevated"
                      }`}
          >
            <MdFillMore_horiz size={22} />
            <span>{t("layout.more")}</span>
          </button>
          {/* </Show> */}

          <Show when={!hidesRightSidebar()}>
          <button
            ref={setPanelButtonRef}
            onClick={() => {
              setRightOpen((o) => !o);
              setMoreOpen(false);
            }}
            aria-expanded={rightOpen()}
            aria-controls="right-sidebar"
            aria-label={rightOpen() ? "Close panel" : "Open panel"}
            use:helpable="nav.panel"
            class={`flex-none px-2 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl
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
            <span>{t("layout.panel")}</span>
          </button>
          </Show>
        </nav>
      </Show>
    </>
  );
}
