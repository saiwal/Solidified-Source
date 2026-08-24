import { type ParentComponent, Show, ErrorBoundary, Suspense } from "solid-js";
import { For } from "solid-js";
import { A } from "@solidjs/router";
import NavItem, { getNavIcon } from "./shared/views/NavItem";
import { navItemHelpTarget } from "@utsukta/spa-core/lib/useNav";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;
import { useLayoutChrome } from "@utsukta/spa-core/lib/useLayoutChrome";
import Slot from "./shared/views/Slot";
import SiteCredits from "./shared/views/SiteCredits";
import RemoteAuthBanner from "./shared/views/RemoteAuthBanner";
import HelpOverlay from "./shared/views/HelpOverlay";
import {
  MdFillChevron_right,
  MdFillMore_horiz,
  MdFillApps,
} from "solid-icons/md";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { templateUsageCount, templateName } from "@utsukta/spa-core/store/widget-templates";
import NavUtilities from "./shared/views/NavUtilities";
import ChannelSwitcher, { ChannelSwitcherTiles } from "./shared/views/ChannelSwitcher";
import { notifCount } from "@utsukta/spa-core/lib/notificationCount";
import { motion } from "solid-motionone";
import ToastContainer from "@/shared/views/ToastContainer";
import ConnectionRequestModalHost from "@/shared/views/ConnectionRequestModalHost";
import FeedModalHost from "@/shared/views/FeedModalHost";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePWA } from "@/pwa";
import DOMPurify from "dompurify";
void motion;

// ── Brand / site banner ────────────────────────────────────────────────────────
function BrandBlock(props: { banner?: string; logoUrl?: string }) {
  return (
    <A href="/" class="flex items-center gap-3 select-none">
      <img
        src={props.logoUrl || import.meta.env.BASE_URL + "hubzilla.svg"}
        alt=""
        aria-hidden="true"
        class="h-6 w-6 shrink-0 rounded object-contain"
      />
      <span class="h-5 w-px bg-rim" />
      <Show
        when={props.banner}
        fallback={
          <span class="text-sm font-medium tracking-tight text-muted">
            Hubzilla
          </span>
        }
      >
        <span
          class="text-sm font-medium tracking-tight text-muted"
          innerHTML={DOMPurify.sanitize(props.banner!, {
            FORBID_TAGS: ["style", "script"],
          })}
        />
      </Show>
    </A>
  );
}

// ── Mobile bottom tab ─────────────────────────────────────────────────────────
function MobileTab(props: {
  href: string | (() => string);
  label: string | (() => string);
  icon?: string;
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
      <span aria-hidden="true" class="flex items-center">
        {getNavIcon(props.icon, 22)}
      </span>
      <span class="text-[0.625rem] font-medium leading-tight truncate max-w-[52px]">
        {label()}
      </span>
    </A>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
const Layout: ParentComponent = (props) => {
  const { t } = useI18n();
  usePWA();

  const {
    rightOpen, setRightOpen,
    moreOpen, setMoreOpen,
    actionsOpen, setActionsOpen,
    channelMenuOpen, setChannelMenuOpen,
    subjectNick,
    actionItems,
    viewerRole,
    online,
    isRouting,
    navViewer,
    navActions,
    navData,
    navChannels,
    isXl,
    reducedMotion,
    mainRef, setMainRef,
    setMorePanelRef,
    setMoreButtonRef,
    setPanelButtonRef,
    setRightPanelRef,
    showScrollTop,
    onMainScroll,
    activeModuleId,
    pageTemplateId,
    hidesNavChrome,
    hidesRightSidebar,
    hidesWidgetSlots,
    showsMobileSidebarFab,
    closeAll,
    isLocalUser,
    showsTemplateNotice,
    channelSwitcherActive,
    overflowItems,
    desktopNavDrag,
    bottomTabDrag,
    moreDrawerDrag,
  } = useLayoutChrome();

  return (
    <div class="fixed inset-0 bg-base text-txt hz-app-root">
      <a
        href="#main-content"
        class="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:top-2 focus:left-2
               focus:px-4 focus:py-2 focus:rounded-lg focus:bg-base focus:text-txt
               focus:border focus:border-rim focus:shadow-lg focus:outline-none"
      >
        {t("layout.skip_to_content")}
      </a>
      <HelpOverlay />
      <ToastContainer />
      <ConnectionRequestModalHost />
      <FeedModalHost />
      <Show when={isRouting()}>
        <div
          class="fixed top-0 inset-x-0 z-[150] h-[2px] overflow-hidden"
          aria-hidden="true"
        >
          <div
            class="h-full w-full bg-accent"
            style={{ animation: "hz-routing 1s linear infinite" }}
          />
        </div>
      </Show>

      <div class="flex h-full flex-col">
        {/* ── Site-level alerts (banner landmark) ── */}
        <header>
          {/* ── Offline banner ── */}
          <Show when={!online()}>
            <div
              role="alert"
              class="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2
                   bg-amber-500 text-amber-950 text-sm font-medium py-1.5 select-none"
            >
              <svg
                aria-hidden="true"
                class="w-4 h-4 shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fill-rule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58
                   9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z
                   M11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clip-rule="evenodd"
                />
              </svg>
              {t("layout.offline")}
            </div>
          </Show>

          <RemoteAuthBanner
            role={viewerRole()}
            subjectNick={subjectNick()}
            homeUrl={navActions().navhome}
          />
        </header>

        <div class="flex flex-1 min-h-0">
          {/* ═══════════════════════════════════════════════════════
              DESKTOP LEFT SIDEBAR
          ═══════════════════════════════════════════════════════ */}
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
              {/* Primary nav — reorderable via drag handle while in edit-layout mode */}
              <nav aria-label="Primary" tabindex="0" class="flex flex-col gap-0.5">
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
                      <NavItem
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
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

          {/* ═══════════════════════════════════════════════════════
              MAIN CONTENT
          ═══════════════════════════════════════════════════════ */}
          {/* scrollbar-gutter:stable — always reserve the scrollbar's width so
              centered content (e.g. the composers' max-w-3xl column) doesn't
              shift sideways when a view's height crosses the overflow
              threshold, as switching card templates does. */}
          <main
            id="main-content"
            ref={setMainRef}
            onScroll={onMainScroll}
            class="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-4 lg:p-6 pb-16 lg:pb-6 relative flex flex-col"
          >
            <div class="flex flex-col flex-1">
              <span class="sr-only" aria-live="polite" aria-atomic="true">
                {notifCount() > 0
                  ? `${notifCount()} notification${notifCount() === 1 ? "" : "s"}`
                  : ""}
              </span>
              <Show when={!hidesWidgetSlots()}>
                <Show when={showsTemplateNotice()}>
                  <p class="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1.5 mb-2">
                    {t("widgets.template_shared_notice")
                      .replace("{{name}}", templateName(pageTemplateId()!) ?? "")
                      .replace("{{count}}", String(templateUsageCount(pageTemplateId()!)))}
                  </p>
                </Show>
                <Slot name="header" moduleId={activeModuleId()} templateId={pageTemplateId()} editable />
                <Slot name="gridTop" moduleId={activeModuleId()} templateId={pageTemplateId()} editable />
                <Slot name="contentTop" moduleId={activeModuleId()} templateId={pageTemplateId()} editable />
              </Show>

              <div class="min-w-0">
                <ErrorBoundary
                  fallback={(_, reset) => (
                    <div class="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
                      <span
                        aria-hidden="true"
                        class="text-8xl font-bold text-gray-200 dark:text-gray-700 select-none"
                      >
                        !
                      </span>
                      <h1 class="text-2xl font-semibold">
                        {t("ui.error_title")}
                      </h1>
                      <p class="text-muted max-w-sm">{t("ui.error_desc")}</p>
                      <div class="flex gap-3 mt-2">
                        <button
                          onClick={reset}
                          class="px-4 py-2 rounded-lg border border-rim hover:bg-elevated transition-colors text-sm"
                        >
                          {t("ui.try_again")}
                        </button>
                        <a
                          href="/hq"
                          class="px-4 py-2 rounded-lg bg-accent text-accent-fg hover:opacity-90 transition-opacity text-sm"
                        >
                          {t("ui.go_home")}
                        </a>
                      </div>
                    </div>
                  )}
                >
                  <Suspense>{props.children}</Suspense>
                </ErrorBoundary>
              </div>

              <Show when={showScrollTop()}>
                <button
                  onClick={() =>
                    mainRef()?.scrollTo({ top: 0, behavior: "smooth" })
                  }
                  class="sticky bottom-2 lg:bottom-14 xl:bottom-2 self-end z-10
                         w-10 h-10 rounded-full flex items-center justify-center
                         bg-elevated border border-rim
                         shadow hover:shadow-md transition-all"
                  aria-label="Scroll to top"
                >
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                </button>
              </Show>
            </div>
						<Show when={!hidesWidgetSlots()}>
                <div class="mt-auto">
                  <Slot name="footer" moduleId={activeModuleId()} templateId={pageTemplateId()} editable />
                  <SiteCredits />
                </div>
              </Show>

          </main>

          {/* ═══════════════════════════════════════════════════════
              RIGHT SIDEBAR
          ═══════════════════════════════════════════════════════ */}
          <Show when={!hidesRightSidebar()}>
          <aside
            id="right-sidebar"
            ref={setRightPanelRef}
            aria-label="Sidebar panel"
            aria-hidden={!isXl() && !rightOpen()}
            tabindex="0"
            class={`
              fixed inset-y-0 right-0 z-40 w-[288px] shrink-0 p-4 pb-20 lg:pb-4 overflow-y-auto
              flex flex-col gap-4
              bg-surface border-l border-rim
              transform transition-transform duration-300 ease-in-out
              xl:relative xl:translate-x-0 xl:flex
              ${rightOpen() ? "translate-x-0" : "translate-x-full"}
            `}
          >
            <Slot
              name="right"
              moduleId={activeModuleId()}
              templateId={pageTemplateId()}
              editable
            />
            <Show when={!isLocalUser()}>
              <Slot name="rightVisitor" moduleId={activeModuleId()} />
            </Show>
          </aside>
          </Show>
          {/* Backdrop */}
          <Show when={!hidesNavChrome() && ((!hidesRightSidebar() && rightOpen()) || moreOpen())}>
            <div
              aria-hidden="true"
              class="fixed inset-0 z-30 bg-black/25 lg:hidden"
              onClick={closeAll}
            />
          </Show>

          {/* ═══════════════════════════════════════════════════════
              MOBILE — "More" bottom sheet drawer
          ═══════════════════════════════════════════════════════ */}
          <Show when={!hidesNavChrome()}>
          <nav
            id="more-drawer"
            ref={setMorePanelRef}
            aria-label={t("layout.more")}
            aria-hidden={!moreOpen()}
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
            class="fixed bottom-0 left-0 right-0 z-50 h-16 lg:hidden
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
                    {notifCount() > 99 ? "99+" : notifCount()}
                  </span>
                </Show>
              </span>
              <span>{t("layout.panel")}</span>
            </button>
            </Show>
          </nav>
          </Show>

          {/* Right sidebar FAB — normally lg-only (mobile has the bottom tab
              bar's own panel toggle instead), but "compact" hides that tab
              bar, so the FAB covers mobile there too. */}
          <Show when={!hidesRightSidebar()}>
          <button
            onClick={() => setRightOpen((o) => !o)}
            aria-expanded={rightOpen()}
            aria-controls="right-sidebar"
            aria-label={rightOpen() ? "Close panel" : "Open panel"}
            use:helpable="nav.panel"
            class={`fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full shadow-lg
                   bg-elevated border border-rim
                   ${showsMobileSidebarFab() ? "flex" : "hidden lg:flex"} xl:hidden items-center justify-center
                   hover:shadow-xl transition-all`}
          >
            <span class="relative inline-flex">
              <Show when={!rightOpen() && notifCount() > 0}>
                <span
                  class="absolute top-0 right-0 translate-x-3/2 -translate-y-3/2 min-w-[14px] h-[14px] px-[3px]
                         rounded-full bg-accent text-accent-fg
                         text-[0.5625rem] font-bold leading-[14px] text-center
                         pointer-events-none select-none"
                >
                  {notifCount() > 99 ? "99+" : notifCount()}
                </span>
              </Show>
            </span>
            <MdFillApps size={18} />
          </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default Layout;
