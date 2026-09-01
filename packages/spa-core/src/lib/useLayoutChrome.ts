import { createSignal, createMemo, createEffect, on } from "solid-js";
import { useLocation, useIsRouting } from "@solidjs/router";
import { createMediaQuery } from "@solid-primitives/media";
import { useNav, useNavActionItems } from "./useNav";
import { moduleIdForPath, getModule } from "../module-registry";
import { createDragReorder } from "./useDragReorder";
import { commitNavOrder } from "../store/nav-order";
import type { NavItemDef } from "../types/module.types";
import { useViewerRole, useSubjectNick } from "../store/site-config";
import { useChannelTheme } from "./useChannelTheme";
import { editingWidgets, setEditingWidgets } from "../store/widget-layout";
import { loadTemplates, templateUsageCount } from "../store/widget-templates";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  useNavActions,
  useNavViewer,
  useNavData,
  useNavChannels,
  useNavChannelSelectEnabled,
  setNavNick,
} from "../store/nav-store";

/**
 * All the non-visual state/behavior a root Layout needs: nav data, panel
 * open/closed state, page-chrome mode (zen/focus/wide/compact), drag-reorder,
 * scroll tracking, focus restoration. Zero JSX/CSS — any theme's Layout.tsx
 * wires this into its own markup. Extracted from solidified's Layout.tsx,
 * which was previously a single ~950-line file mixing this with its JSX.
 */
export function useLayoutChrome() {
  const [rightOpen, setRightOpen] = createSignal(false);
  const [moreOpen, setMoreOpen] = createSignal(false);
  const [actionsOpen, setActionsOpen] = createSignal(false);
  const [channelMenuOpen, setChannelMenuOpen] = createSignal(false);

  const subjectNick = useSubjectNick();
  createEffect(() => setNavNick(subjectNick()));
  useChannelTheme(subjectNick);
  const actionItems = useNavActionItems();
  const location = useLocation();
  const navItems = useNav(subjectNick);
  const viewerRole = useViewerRole();
  const online = useOnlineStatus();
  const isRouting = useIsRouting();
  const navViewer = useNavViewer();
  const navActions = useNavActions();
  const navData = useNavData();
  const navChannels = useNavChannels();
  const navChannelSelectEnabled = useNavChannelSelectEnabled();

  const isXl = createMediaQuery("(min-width: 1280px)");
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const [mainRef, setMainRef] = createSignal<HTMLElement>();
  const [morePanelRef, setMorePanelRef] = createSignal<HTMLDivElement>();
  const [moreButtonRef, setMoreButtonRef] = createSignal<HTMLButtonElement>();
  const [panelButtonRef, setPanelButtonRef] = createSignal<HTMLButtonElement>();
  const [rightPanelRef, setRightPanelRef] = createSignal<HTMLElement>();
  const [showScrollTop, setShowScrollTop] = createSignal(false);
  let scrollTicking = false;
  const onMainScroll = () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      setShowScrollTop((mainRef()?.scrollTop ?? 0) > 300);
      scrollTicking = false;
    });
  };

  // preventScroll is load-bearing: these panels are `position: fixed` and are
  // still translated off-screen on the rAF right after the open class flips,
  // so a default focus() makes the browser scroll ancestors (including the
  // app-wide `main` scroller) trying to reveal them — the page visibly yanks
  // every time the drawer/sidebar opens. Focus still moves for keyboard and
  // screen-reader users; only the scroll side effect is dropped.
  createEffect(() => {
    if (moreOpen())
      requestAnimationFrame(() => {
        morePanelRef()
          ?.querySelector<HTMLElement>("a, button")
          ?.focus({ preventScroll: true });
      });
  });
  createEffect(() => {
    if (rightOpen() && !isXl())
      requestAnimationFrame(() =>
        rightPanelRef()?.focus({ preventScroll: true }),
      );
  });
  createEffect(
    on(
      rightOpen,
      (isOpen, prevOpen) => {
        if (prevOpen && !isOpen) panelButtonRef()?.focus({ preventScroll: true });
      },
      { defer: true },
    ),
  );
  createEffect(
    on(
      moreOpen,
      (isOpen, prevOpen) => {
        if (prevOpen && !isOpen) moreButtonRef()?.focus({ preventScroll: true });
      },
      { defer: true },
    ),
  );
  // The desktop action-items panel now renders as an overlay anchored above
  // NavUtilities (see aside markup below) rather than pushing content inline,
  // so it must be closed explicitly on navigation or it'd stay floating over
  // the sidebar on the next page.
  createEffect(
    on(
      () => location.pathname,
      () => setActionsOpen(false),
      { defer: true },
    ),
  );

  // `mainRef` is the one persistent scroll container for every routed
  // module (Layout itself never unmounts across navigations), so without
  // this a module opens still scrolled to wherever the previous module
  // left off.
  createEffect(
    on(
      () => location.pathname,
      () => {
        const el = mainRef();
        if (el) el.scrollTop = 0;
        setShowScrollTop(false);
      },
      { defer: true },
    ),
  );

  const activeModuleId = createMemo(() => moduleIdForPath(location.pathname));

  // A module may register a reactive pageTemplate() (e.g. a webpage's
  // assigned layout template) to have its editable regions resolve from that
  // named template instead of the module-level layout. Applies uniformly to
  // every slot already `editable` below (header/contentTop/right/footer) — a
  // template is one named arrangement spanning all of an item's regions, not
  // just the sidebar. See ModuleDef.pageTemplate / Slot's templateId.
  const pageTemplateId = createMemo(() => getModule(activeModuleId())?.pageTemplate?.() ?? undefined);

  // "zen" hides all app chrome (nav, sidebars, widget slots, mobile bars).
  // "focus" hides only the nav rail/sidebars/mobile bars, keeping the
  // header/contentTop/footer widget slots visible on the page.
  // "wide" hides only the right widget sidebar (and its FAB/panel toggle
  // controls), keeping the nav rail, mobile bars, and widget slots as-is.
  // "compact" hides the nav rail AND the mobile drawer/bottom tab bar (so
  // there's no in-nav way to open the right sidebar on mobile) — a
  // dedicated floating toggle covers that instead. See ModuleDef.pageChrome.
  const chromeMode = createMemo(() => getModule(activeModuleId())?.pageChrome?.() ?? "default");
  // Desktop left nav rail + mobile drawer/bottom tab bar (and their backdrop).
  const hidesNavChrome = createMemo(
    () => chromeMode() === "zen" || chromeMode() === "focus" || chromeMode() === "compact",
  );
  const hidesRightSidebar = createMemo(
    () => chromeMode() === "zen" || chromeMode() === "focus" || chromeMode() === "wide",
  );
  const hidesWidgetSlots = createMemo(() => chromeMode() === "zen");
  // "compact" hides the bottom tab bar's own sidebar-panel toggle, so the FAB
  // (normally lg-only, since the tab bar covers mobile) must also show on
  // mobile there — it's the only remaining way to open the right sidebar.
  const showsMobileSidebarFab = createMemo(() => chromeMode() === "compact");

  // Own templates' names/entries are already available at boot, but usage
  // counts (used by the "shared by N pages" notice in Slot.tsx) are
  // deliberately not part of the boot payload — fetch them once, centrally,
  // when edit mode starts on a templated page, rather than once per
  // templated slot on that page.
  createEffect(() => {
    if (pageTemplateId() && editingWidgets()) void loadTemplates();
  });

  createEffect(() => {
    const mod = getModule(activeModuleId());
    const label = mod?.navItem?.label;
    const resolved = typeof label === "function" ? label() : label;
    document.title = resolved ? `${resolved} · Hubzilla` : "Hubzilla";
  });

  const closeAll = () => {
    setRightOpen(false);
    setMoreOpen(false);
    setActionsOpen(false);
    setChannelMenuOpen(false);
  };

  const isOwner = () => viewerRole() === "owner";
  const isLocalUser = () =>
    viewerRole() === "owner" || viewerRole() === "local";

  // Shown once per page (not once per templated slot — see Slot.tsx, which
  // used to render this same notice separately in header/contentTop/footer/
  // right).
  const showsTemplateNotice = createMemo(
    () => !!pageTemplateId() && editingWidgets() && isOwner() && templateUsageCount(pageTemplateId()!) > 1,
  );

  // "Navigation Channel Select" feature: expands the "channels" nav entry
  // into an inline multi-channel switcher instead of linking to /manage.
  const channelSwitcherActive = () => isOwner() && navChannelSelectEnabled();

  // Widget editing targets your own layout — leave edit mode when the page
  // stops being yours (e.g. navigating to someone else's channel).
  createEffect(() => {
    if (!isOwner()) setEditingWidgets(false);
  });

  const isMedium = createMediaQuery("(min-width: 768px)");
  const bottomLimit = () => (isMedium() ? 8 : 4);
  const bottomItems = () => navItems().slice(0, bottomLimit());
  const overflowItems = () => navItems().slice(bottomLimit());

  // Drag-to-reorder — one instance per surface the nav is rendered in. Each
  // commits into the same persisted order (nav-order.ts), replacing only the
  // positions of the items visible in that surface.
  const getItemKey = (item: NavItemDef) => item.path;
  const desktopNavDrag = createDragReorder(navItems, getItemKey, (order) =>
    commitNavOrder(navItems(), order),
  );
  const bottomTabDrag = createDragReorder(bottomItems, getItemKey, (order) =>
    commitNavOrder(navItems(), order),
  );
  const moreDrawerDrag = createDragReorder(overflowItems, getItemKey, (order) =>
    commitNavOrder(navItems(), order),
  );

  return {
    rightOpen, setRightOpen,
    moreOpen, setMoreOpen,
    actionsOpen, setActionsOpen,
    channelMenuOpen, setChannelMenuOpen,
    subjectNick,
    actionItems,
    navItems,
    viewerRole,
    online,
    isRouting,
    navViewer,
    navActions,
    navData,
    navChannels,
    navChannelSelectEnabled,
    isXl,
    isMedium,
    reducedMotion,
    mainRef, setMainRef,
    morePanelRef, setMorePanelRef,
    moreButtonRef, setMoreButtonRef,
    panelButtonRef, setPanelButtonRef,
    rightPanelRef, setRightPanelRef,
    showScrollTop,
    onMainScroll,
    activeModuleId,
    pageTemplateId,
    chromeMode,
    hidesNavChrome,
    hidesRightSidebar,
    hidesWidgetSlots,
    showsMobileSidebarFab,
    closeAll,
    isOwner,
    isLocalUser,
    showsTemplateNotice,
    channelSwitcherActive,
    bottomLimit,
    bottomItems,
    overflowItems,
    desktopNavDrag,
    bottomTabDrag,
    moreDrawerDrag,
  };
}

export type LayoutChrome = ReturnType<typeof useLayoutChrome>;
