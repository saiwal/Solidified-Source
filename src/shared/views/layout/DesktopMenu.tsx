import { For, Show } from "solid-js";
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
import BrandBlock from "./BrandBlock";

/**
 * Desktop navigation rail (lg and up): brand, primary nav, the leftBottom slot,
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
  } = props.chrome;

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
