import { type ParentComponent, Show, ErrorBoundary, Suspense, createEffect } from "solid-js";
import { useLayoutChrome } from "@utsukta/spa-core/lib/useLayoutChrome";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;
import Slot from "./shared/views/Slot";
import SiteCredits from "./shared/views/SiteCredits";
import RemoteAuthBanner from "./shared/views/RemoteAuthBanner";
import HelpOverlay from "./shared/views/HelpOverlay";
import { MdFillSwitch_left, MdOutlineExpand_less } from "solid-icons/md";
import { templateUsageCount, templateName } from "@utsukta/spa-core/store/widget-templates";
import { notifCount } from "@utsukta/spa-core/lib/notificationCount";
import { formatCount } from "@/modules/notify/rows";
import { notifyCountLimit } from "@utsukta/spa-core/store/auth-store";
import ToastContainer from "@/shared/views/ToastContainer";
import ConnectionRequestModalHost from "@/shared/views/ConnectionRequestModalHost";
import FeedModalHost from "@/shared/views/FeedModalHost";
import ShareModalHost from "@/shared/views/ShareModalHost";
import ModalHost from "@/shared/views/ModalHost";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { usePWA } from "@/pwa";
import DesktopMenu from "./shared/views/layout/DesktopMenu";
import MobileMenu from "./shared/views/layout/MobileMenu";
import { setMobileNavAvailable } from "./shared/views/layout/PageActions";

// ── Layout ────────────────────────────────────────────────────────────────────
const Layout: ParentComponent = (props) => {
  const { t } = useI18n();
  usePWA();

  // The hook is called once here and handed to the menu components as-is: it
  // owns singleton state (focus restoration, drag reorder, scroll tracking),
  // so a menu can't call it a second time. See shared/views/layout/.
  const chrome = useLayoutChrome();
  const {
    rightOpen, setRightOpen,
    moreOpen,
    subjectNick,
    viewerRole,
    online,
    isRouting,
    navActions,
    mainRef, setMainRef,
    setRightPanelRef,
    showScrollTop,
    onMainScroll,
    activeModuleId,
    pageTemplateId,
    routeTitle,
    hidesNavChrome,
    hidesRightSidebar,
    hidesWidgetSlots,
    showsMobileSidebarFab,
    closeAll,
    isLocalUser,
    showsTemplateNotice,
  } = chrome;

  // Header actions are portaled into the mobile actions sheet; if the nav
  // chrome is hidden on mobile there is no sheet, so let PageActions fall
  // back to rendering them inline in the page header. Set it once before the
  // first render too, so mobile doesn't flash the actions inline while waiting
  // for the effect.
  setMobileNavAvailable(!hidesNavChrome());
  createEffect(() => setMobileNavAvailable(!hidesNavChrome()));

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
      <ShareModalHost />
      <ModalHost navOpen={moreOpen() || rightOpen()} />
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
                   bg-warning text-warning-fg text-sm font-medium py-1.5 select-none"
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
              Markup lives in shared/views/layout/DesktopMenu.tsx
          ═══════════════════════════════════════════════════════ */}
          <DesktopMenu chrome={chrome} />

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
            tabindex="-1"
            onScroll={onMainScroll}
            class="flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] p-4 lg:p-6 pb-16 lg:pb-6 relative flex flex-col"
          >
            <div class="flex flex-col flex-1">
              {/* Route changes swap <main> silently; without this a screen
                  reader gets no signal that the page changed. */}
              <span class="sr-only" aria-live="polite" aria-atomic="true">
                {routeTitle()}
              </span>
              <span class="sr-only" aria-live="polite" aria-atomic="true">
                {notifCount() > 0
                  ? `${formatCount(notifCount(), notifyCountLimit())} ${t("nav.notifications")}`
                  : ""}
              </span>
              <Show when={!hidesWidgetSlots()}>
                <Show when={showsTemplateNotice()}>
                  <p class="text-xs text-warning-txt bg-warning/10 border border-warning/30 rounded-lg px-2 py-1.5 mb-2">
                    {t("widgets.template_shared_notice")
                      .replace("{{name}}", templateName(pageTemplateId()!) ?? "")
                      .replace("{{count}}", String(templateUsageCount(pageTemplateId()!)))}
                  </p>
                </Show>
                <Slot name="header" moduleId={activeModuleId()} templateId={pageTemplateId()} editable />
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
                        <Button variant="ghost" class="border border-rim" onClick={reset}>
                          {t("ui.try_again")}
                        </Button>
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

            </div>
						<Show when={!hidesWidgetSlots()}>
                <div class="mt-auto">
                  <Slot name="footer" moduleId={activeModuleId()} templateId={pageTemplateId()} editable />
                  <SiteCredits />
                </div>
              </Show>


          </main>


          <Show when={showScrollTop()}>
            <button
              onClick={() =>
                mainRef()?.scrollTo({ top: 0, behavior: "smooth" })
              }
              class={`fixed z-50 right-4 lg:right-6 bottom-[4.5rem] lg:bottom-20 xl:bottom-8
                     ${hidesRightSidebar() ? "xl:right-6" : "xl:right-[19.5rem]"}
                     w-10 h-10 rounded-full flex items-center justify-center
                     bg-elevated border border-rim
                     shadow hover:shadow-md transition-all`}
              aria-label="Scroll to top"
            >
              <MdOutlineExpand_less class="w-4 h-4" />
            </button>
          </Show>

          {/* ═══════════════════════════════════════════════════════
              RIGHT SIDEBAR
          ═══════════════════════════════════════════════════════ */}
          {/* Off-canvas drawers (this and #app-drawer) are only translated
              off-screen, so their contents stay tabbable when closed. `inert`
              hides them from AT *and* pulls them out of the tab order;
              `aria-hidden` alone did only the first, so focus could land
              inside a subtree announced as hidden. tabindex=-1 keeps
              useLayoutChrome's focus-on-open working without adding a tab
              stop of its own. */}
          <Show when={!hidesRightSidebar()}>
          <aside
            id="right-sidebar"
            ref={setRightPanelRef}
            aria-label="Sidebar panel"
            tabindex="-1"
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
              MOBILE — "More" bottom sheet drawer + bottom tab bar
              Markup lives in shared/views/layout/MobileMenu.tsx
          ═══════════════════════════════════════════════════════ */}
          <MobileMenu chrome={chrome} />

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
                  {formatCount(notifCount(), notifyCountLimit())}
                </span>
              </Show>
            </span>
            <MdFillSwitch_left size={18} />
          </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default Layout;
