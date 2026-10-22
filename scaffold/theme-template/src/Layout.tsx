import { type ParentComponent, Show, For, ErrorBoundary, Suspense } from "solid-js";
import { useLayoutChrome } from "@utsukta/spa-core/lib/useLayoutChrome";
import { useI18n } from "@utsukta/spa-core/i18n";
import NavItem from "./shared/views/NavItem";
import Slot from "./shared/views/Slot";

/*
 * Minimal starter implementing @utsukta/spa-core's useLayoutChrome() —
 * this hook is the "slot interface" from Step 5: it owns all the
 * non-visual layout state (nav data, panel open/closed, page-chrome mode,
 * drag-to-reorder, scroll tracking, focus restoration) so any theme's
 * Layout.tsx only has to write markup, not reimplement that logic.
 *
 * Deliberately NOT included here (see solidified's ~750-line Layout.tsx
 * for the full pattern to build toward): HelpOverlay, ToastContainer,
 * ConnectionRequestModalHost, FeedModalHost, RemoteAuthBanner, the mobile
 * "more" overflow drawer, the desktop action-items overlay, the channel
 * switcher, and the widget-layout edit mode UI. None of those are
 * required for the app to function — their absence just means those
 * specific features (toasts, connection-request modals, help-mode,
 * layout customization) have nowhere to render yet.
 */
const Layout: ParentComponent = (props) => {
  const { t } = useI18n();

  const {
    rightOpen, setRightOpen,
    subjectNick,
    online,
    isRouting,
    navViewer,
    navData,
    setMainRef,
    activeModuleId,
    hidesNavChrome,
    hidesRightSidebar,
    hidesWidgetSlots,
    isLocalUser,
    bottomTabDrag,
    desktopNavDrag,
  } = useLayoutChrome();

  return (
    <div class="fixed inset-0 flex flex-col bg-base text-txt">
      <Show when={isRouting()}>
        <div class="fixed top-0 inset-x-0 z-50 h-0.5 bg-accent" aria-hidden="true" />
      </Show>

      <Show when={!online()}>
        <div role="alert" class="bg-amber-500 text-amber-950 text-sm text-center py-1">
          {t("layout.offline")}
        </div>
      </Show>

      <div class="flex flex-1 min-h-0">
        {/* ── Desktop sidebar ── */}
        <Show when={!hidesNavChrome()}>
          <aside class="hidden lg:flex flex-col w-56 shrink-0 border-r p-3 gap-1">
            <div class="px-2 pb-3 mb-2 border-b font-medium">
              {navData()?.banner ?? "__THEME_SLUG_PASCAL__"}
            </div>
            <nav aria-label={t("layout.navigation")} class="flex flex-col gap-1">
              <For each={desktopNavDrag.displayItems()}>
                {(item) => <NavItem href={item.href} label={item.label} icon={item.icon} />}
              </For>
            </nav>
          </aside>
        </Show>

        {/* ── Main content ── */}
        <main ref={setMainRef} class="flex-1 overflow-y-auto p-4 pb-20 lg:pb-4">
          <Show when={!hidesWidgetSlots()}>
            <Slot name="header" moduleId={activeModuleId()} />
            <Slot name="contentTop" moduleId={activeModuleId()} />
          </Show>

          <ErrorBoundary
            fallback={(_, reset) => (
              <div class="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
                <p>{t("ui.error_title")}</p>
                <button onClick={reset} class="px-3 py-1.5 border rounded-lg text-sm">
                  {t("ui.try_again")}
                </button>
              </div>
            )}
          >
            <Suspense>{props.children}</Suspense>
          </ErrorBoundary>

          <Show when={!hidesWidgetSlots()}>
            <Slot name="footer" moduleId={activeModuleId()} />
          </Show>
        </main>

        {/* ── Right sidebar ── */}
        <Show when={!hidesRightSidebar()}>
          <aside
            class={`fixed inset-y-0 right-0 z-40 w-72 p-4 overflow-y-auto border-l bg-base
                    transform transition-transform lg:relative lg:translate-x-0
                    ${rightOpen() ? "translate-x-0" : "translate-x-full"}`}
          >
            <Slot name="right" moduleId={activeModuleId()} />
            <Show when={!isLocalUser()}>
              <Slot name="rightVisitor" moduleId={activeModuleId()} />
            </Show>
          </aside>
        </Show>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <Show when={!hidesNavChrome()}>
        <nav aria-label={t("layout.navigation")} class="lg:hidden border-t flex">
          <For each={bottomTabDrag.displayItems()}>
            {(item) => (
              <div class="flex-1">
                <NavItem href={item.href} label={item.label} icon={item.icon} />
              </div>
            )}
          </For>
          <button
            type="button"
            class="flex-1 text-sm"
            onClick={() => setRightOpen((o) => !o)}
          >
            {subjectNick() ? navViewer()?.nick ?? "···" : "···"}
          </button>
        </nav>
      </Show>
    </div>
  );
};

export default Layout;
