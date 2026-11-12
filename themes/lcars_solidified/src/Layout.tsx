import { type ParentComponent, Show, ErrorBoundary, Suspense, createEffect, createSignal, onCleanup } from "solid-js";
import { useLayoutChrome } from "@utsukta/spa-core/lib/useLayoutChrome";
import { useAppliedBg } from "@utsukta/spa-core/lib/background";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;
import Slot from "@/shared/views/Slot";
import SiteCredits from "@/shared/views/SiteCredits";
import RemoteAuthBanner from "@/shared/views/RemoteAuthBanner";
import HelpOverlay from "@/shared/views/HelpOverlay";
import CommandPalette from "@/shared/views/search/CommandPalette";
import { MdFillSwitch_left, MdFillVolume_off, MdFillVolume_up, MdOutlineExpand_less } from "solid-icons/md";
import { createMediaQuery } from "@solid-primitives/media";
import { stardate } from "./stardate";
import { templateUsageCount, templateName } from "@utsukta/spa-core/store/widget-templates";
import { notifCount } from "@utsukta/spa-core/lib/notificationCount";
import { formatCount } from "@/modules/notify/rows";
import { notifyCountLimit } from "@utsukta/spa-core/store/auth-store";
import ToastContainer from "@/shared/views/ToastContainer";
import ConnectionRequestModalHost from "@/shared/views/ConnectionRequestModalHost";
import FeedModalHost from "@/shared/views/FeedModalHost";
import ShareModalHost from "@/shared/views/ShareModalHost";
import ModalHost from "@/shared/views/ModalHost";
import { hasMinimized } from "@/shared/views/modal-host";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { usePWA } from "@/pwa";
import DesktopMenu from "@/shared/views/layout/DesktopMenu";
import MobileMenu from "@/shared/views/layout/MobileMenu";
import { setMobileNavAvailable } from "@/shared/views/layout/PageActions";
import FloatingActions from "@/shared/views/layout/FloatingActions";
import BrandBlock from "@/shared/views/layout/BrandBlock";
import { beep, soundOn, toggleSound } from "./sounds";

// LCARS overlay of solidified's src/Layout.tsx (THEME=lcars_solidified; see
// docs/dev/en/5-extending/theme-scaffold.md "Overlay themes"). Same chrome
// state, slots and hosts — keep those in step with the original; only the
// frame differs: an elbow column around DesktopMenu, a bar across the top and
// bottom of the main column, and the concave joints where they meet. The
// frame is decoration (aria-hidden) and desktop-only; styles in ./index.css.

// A stable pseudo-readout for the bars, e.g. "47-1138", from the route.
const readout = (s: string) => {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 100000;
  const d = String(h).padStart(5, "0");
  return `${d.slice(0, 2)}-${d.slice(2)}`;
};

// ── Layout ────────────────────────────────────────────────────────────────────
const Layout: ParentComponent = (props) => {
  const { t } = useI18n();
  usePWA();

  // The hook is called once here and handed to the menu components as-is: it
  // owns singleton state (focus restoration, drag reorder, scroll tracking),
  // so a menu can't call it a second time. See shared/views/layout/.
  const appliedBg = useAppliedBg();
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

  // On mobile, page actions move to the floating button and the ⋮ menu; if
  // the nav chrome is hidden there, PageActions keeps rendering them inline.
  // Set it once before the first render too, so mobile doesn't flash the
  // actions inline while waiting for the effect.
  // The bars (and so the bottom bar's Top button) show from lg up, with the
  // nav chrome; there the floating scroll-to-top steps aside for it.
  const isLg = createMediaQuery("(min-width: 1024px)");
  // The top bar's readout: the current stardate (./stardate.ts), per minute.
  const [sd, setSd] = createSignal(stardate());
  const sdTimer = setInterval(() => setSd(stardate()), 60_000);
  onCleanup(() => clearInterval(sdTimer));
  const barsShown = () => isLg() && !hidesNavChrome();
  const scrollTop = () => {
    beep(4);
    mainRef()?.scrollTo({ top: 0, behavior: "smooth" });
  };

  setMobileNavAvailable(!hidesNavChrome());
  createEffect(() => setMobileNavAvailable(!hidesNavChrome()));

  return (
    <div class="fixed inset-0 bg-base text-txt hz-app-root">
      {/* Cover wallpaper — see .hz-wallpaper in index.css for why an <img>. */}
      <Show when={appliedBg().fit === "cover" && appliedBg().url}>
        {(url) => (
          <div class="hz-wallpaper" aria-hidden="true">
            <img src={url()} alt="" decoding="sync" />
          </div>
        )}
      </Show>
      <a
        href="#main-content"
        class="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:top-2 focus:left-2
               focus:px-4 focus:py-2 focus:rounded-lg focus:bg-base focus:text-txt
               focus:border focus:border-rim focus:shadow-lg focus:outline-none"
      >
        {t("layout.skip_to_content")}
      </a>
      <HelpOverlay />
      <CommandPalette navItems={chrome.navItems} />
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
          <Show when={!hidesNavChrome()}>
            <div class="hz-lcars-left hidden lg:flex">
              {/* The brand sits in the elbow; DesktopMenu's own copy is
                  hidden in ./index.css. */}
              <div class="hz-lcars-elbow hz-lcars-elbow-top">
                <BrandBlock banner={chrome.navData()?.banner} logoUrl={chrome.navData()?.sitelogo} />
              </div>
              <DesktopMenu chrome={chrome} />
              {/* The audio toggle (see ./sounds.ts): a speaker icon, state in
                  aria-pressed. The label is English on purpose: solidified's
                  i18n carries nothing for this theme. */}
              <button
                type="button"
                class="hz-lcars-elbow hz-lcars-elbow-bottom hz-lcars-sound"
                aria-label="Interface sounds"
                title="Interface sounds"
                aria-pressed={soundOn()}
                onClick={toggleSound}
              >
                <span aria-hidden="true">{readout(activeModuleId() ?? "")}</span>
                <Show when={soundOn()} fallback={<MdFillVolume_off size={22} aria-hidden="true" />}>
                  <MdFillVolume_up size={22} aria-hidden="true" />
                </Show>
              </button>
            </div>
          </Show>

          <div class="hz-lcars-center flex-1 min-w-0 flex flex-col relative">
          <Show when={!hidesNavChrome()}>
            <div class="hz-lcars-bar hz-lcars-bar-top hidden lg:flex" aria-hidden="true">
              <i class="seg w-24" />
              <b class="label">{routeTitle()}</b>
              <i class="seg flex-1 alt" />
              <b class="num" title="Stardate">{sd()}</b>
              <i class="seg w-12 cap alt2" />
            </div>
            <i class="hz-lcars-joint hz-lcars-joint-top hidden lg:block" aria-hidden="true" />
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
            tabindex="-1"
            onScroll={onMainScroll}
            class="flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] p-4 lg:p-6 relative flex flex-col"
            // Minimized-composer pills are fixed over the bottom edge; pad so
            // the last row (and its action icons) can scroll clear of them.
            classList={{
              "pb-16 lg:pb-6": !hasMinimized(),
              "pb-28 lg:pb-16": hasMinimized(),
            }}
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
          <Show when={!hidesNavChrome()}>
            <i class="hz-lcars-joint hz-lcars-joint-bottom hidden lg:block" aria-hidden="true" />
            <div class="hz-lcars-bar hz-lcars-bar-bottom hidden lg:flex">
              <i class="seg w-40" aria-hidden="true" />
              {/* Scroll to top, as a segment of the bar: a plain block until
                  there is somewhere to scroll back to. */}
              <Show when={showScrollTop()} fallback={<i class="seg w-16 alt" aria-hidden="true" />}>
                <button type="button" class="hz-lcars-top" aria-label={t("layout.scroll_top")} onClick={scrollTop}>
                  <MdOutlineExpand_less size={16} aria-hidden="true" />
                  <span aria-hidden="true">Top</span>
                </button>
              </Show>
              <i class="seg flex-1 alt2" aria-hidden="true" />
              <i class="seg w-8 cap" aria-hidden="true" />
            </div>
          </Show>
          </div>


          {/* Main action, search, ⋮ and scroll-to-top, stacked bottom-right. */}
          <FloatingActions
            showScrollTop={showScrollTop() && !barsShown()}
            onScrollTop={scrollTop}
            hidesRightSidebar={hidesRightSidebar()}
            viewerRole={viewerRole()}
            activeModuleId={activeModuleId()}
          />

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
