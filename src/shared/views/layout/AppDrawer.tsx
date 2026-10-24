import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  Show,
  type JSX,
} from "solid-js";
import { A } from "@solidjs/router";
import { MdOutlineExpand_more } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { navItemHelpTarget } from "@utsukta/spa-core/lib/useNav";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;
import type { LayoutChrome } from "@utsukta/spa-core/lib/useLayoutChrome";
import type { NavItemDef } from "@utsukta/spa-core/types/module.types";
import { moduleIdForPath } from "@utsukta/spa-core/module-registry";
import { Collapsible } from "@ui/Collapsible";
import { SearchField } from "@ui/SearchField";
import { getNavIcon } from "../NavItem";
import { NavUtilityIcons } from "../NavUtilities";
import BrandBlock from "./BrandBlock";
import { FavoriteStar, type FavoriteTarget } from "../FavoriteStar";
import {
  categoryApps,
  favoriteTarget,
  groupNavItems,
  pinnedNavItems,
} from "./app-categories";

function labelOf(item: NavItemDef): string {
  return typeof item.label === "function" ? item.label() : item.label;
}

function hrefOf(item: NavItemDef): string {
  return typeof item.href === "function" ? item.href() : item.href;
}

// A launcher tile: big icon, label underneath, four per row — more apps per
// screen than a list and every target is thumb-sized. Shared with the
// favorites quick menu and quick compose so all three look alike.
export const tileClass =
  "group flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 " +
  "text-txt hover:bg-elevated active:bg-elevated transition-colors";

export function TileFace(props: { icon: JSX.Element; label: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        class="w-12 h-12 rounded-2xl bg-elevated border border-rim shrink-0
               flex items-center justify-center text-muted
               group-[.hz-active]:bg-accent-muted group-[.hz-active]:border-accent
               group-[.hz-active]:text-accent-txt"
      >
        {props.icon}
      </span>
      <span class="w-full text-center text-[0.6875rem] leading-tight line-clamp-2 break-words">
        {props.label}
      </span>
    </>
  );
}

// What a tile's star pins and whether it's a favorite.
type StarFor = (item: NavItemDef) => { target: FavoriteTarget; on: boolean };

function AppTile(props: {
  item: NavItemDef;
  onNavigate: () => void;
  starFor: StarFor;
}) {
  return (
    <div use:helpable={navItemHelpTarget(props.item)} class="relative">
      <A
        href={hrefOf(props.item)}
        onClick={props.onNavigate}
        activeClass="hz-active !text-accent-txt"
        class={tileClass}
      >
        <TileFace icon={getNavIcon(props.item.icon, 24)} label={labelOf(props.item)} />
      </A>
      {/* Touch has no hover, so the star is always there — filled marks a
          favorite. A sibling of the link, not inside it. */}
      <Show when={props.starFor(props.item)}>
        {(star) => (
          <FavoriteStar
            on={star().on}
            target={star().target}
            size={14}
            class={`absolute top-0.5 right-0.5 ${star().on ? "" : "text-muted/60"}`}
          />
        )}
      </Show>
    </div>
  );
}

function AppGrid(props: {
  items: NavItemDef[];
  onNavigate: () => void;
  starFor: StarFor;
}) {
  return (
    <div class="grid grid-cols-4 gap-1">
      <For each={props.items}>
        {(item) => (
          <AppTile
            item={item}
            onNavigate={props.onNavigate}
            starFor={props.starFor}
          />
        )}
      </For>
    </div>
  );
}

function GroupHeading(props: { label: string }) {
  return (
    <p class="px-1 pb-2 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
      {props.label}
    </p>
  );
}

/**
 * The mobile app drawer: centred brand, utility icons, then every app as a
 * launcher grid grouped into social / productivity / system, with the search
 * pinned to the bottom of the sheet (thumb reach). The categories form an
 * accordion that opens on the current app's category. A search term replaces
 * the groups with one flat grid. Favorites live in the bar's quick menu only,
 * so they aren't repeated here — but still appear in their category.
 */
export default function AppDrawer(props: { chrome: LayoutChrome }) {
  const { t } = useI18n();
  const {
    moreOpen,
    setMorePanelRef,
    navData,
    navItems,
    closeAll,
    activeModuleId,
  } = props.chrome;

  const [openGroup, setOpenGroup] = createSignal<string | null>(null);
  const toggleGroup = (id: string) =>
    setOpenGroup((prev) => (prev === id ? null : id));

  const [query, setQuery] = createSignal("");
  const searchTerm = () => query().trim().toLowerCase();
  const searching = () => searchTerm().length > 0;
  const matches = createMemo(() => {
    const term = searchTerm();
    if (!term) return [];
    return navItems().filter((item) =>
      labelOf(item).toLowerCase().includes(term),
    );
  });

  const groups = createMemo(() =>
    groupNavItems(navItems(), categoryApps(navData())),
  );

  const pinnedPaths = createMemo(
    () =>
      new Set(
        pinnedNavItems(
          navItems(),
          navData()?.pinned ?? [],
          navData()?.pinned_paths,
        ).map((i) => i.path),
      ),
  );
  const starFor: StarFor = (item) => {
    const target = favoriteTarget(item, [
      ...(navData()?.pinned ?? []),
      ...(navData()?.featured ?? []),
    ]);
    return { target, on: pinnedPaths().has(item.path) };
  };

  // Each open starts on the current app's category, with search cleared.
  createEffect(
    on(moreOpen, (open) => {
      if (!open) return setQuery("");
      const current = groups().find((g) =>
        g.items.some((item) => moduleIdForPath(item.path) === activeModuleId()),
      );
      setOpenGroup(current?.id ?? null);
    }),
  );

  return (
    <nav
      id="app-drawer"
      ref={setMorePanelRef}
      aria-label={t("layout.apps")}
      class={`
        fixed left-0 right-0 z-40 lg:hidden
        bg-surface border-t border-rim
        rounded-t-2xl shadow-2xl
        transform transition-transform duration-300 ease-in-out
        h-auto max-h-[85vh] flex flex-col overflow-hidden
        ${moreOpen() ? "translate-y-0 bottom-16" : "translate-y-full bottom-16"}
      `}
    >
      <div class="mx-auto mt-3 mb-3 w-9 h-1 rounded-full bg-rim shrink-0" />

      <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-4">
        {/* Brand */}
        <div class="flex justify-center px-1 pb-3">
          <BrandBlock
            banner={navData()?.banner}
            logoUrl={navData()?.sitelogo}
          />
        </div>

        <Show
          when={!searching()}
          fallback={
            <Show
              when={matches().length > 0}
              fallback={
                <p class="px-1 py-6 text-center text-sm text-muted">
                  {t("layout.no_app_matches")}
                </p>
              }
            >
              <section class="mb-4">
                <GroupHeading label={t("layout.search_results")} />
                <AppGrid
                  items={matches()}
                  onNavigate={closeAll}
                  starFor={starFor}
                />
              </section>
            </Show>
          }
        >
          <div class="space-y-2">
            <For each={groups()}>
              {(group) => (
                <Collapsible
                  open={openGroup() === group.id}
                  onOpenChange={() => toggleGroup(group.id)}
                  class="rounded-2xl border border-rim bg-elevated/40 overflow-hidden"
                  panelClass="px-2 pb-2"
                  header={(trigger) => (
                    <button
                      type="button"
                      {...trigger}
                      class="w-full min-h-12 flex items-center gap-2 px-4 text-left text-sm font-semibold text-txt hover:bg-elevated transition-colors"
                    >
                      <span class="flex-1 min-w-0 truncate">
                        {t(group.labelKey)}
                      </span>
                      <span class="text-xs font-normal tabular-nums text-muted">
                        {group.items.length}
                      </span>
                      <span aria-hidden="true" class="flex text-muted">
                        <MdOutlineExpand_more
                          size={20}
                          class={`transition-transform duration-200 ease-out
                                  ${openGroup() === group.id ? "rotate-180" : "rotate-0"}`}
                        />
                      </span>
                    </button>
                  )}
                >
                  <AppGrid
                    items={group.items}
                    onNavigate={closeAll}
                    starFor={starFor}
                  />
                </Collapsible>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Search filters the app list; pinned to the bottom of the sheet so it
          stays reachable while the content scrolls. */}
      <div class="shrink-0 border-t border-rim bg-surface px-3 py-3">
        <SearchField
          value={query()}
          onInput={setQuery}
          label={t("layout.search_apps")}
          clearLabel={t("layout.clear_search")}
          placeholder={t("layout.search_apps")}
        />
      </div>
      {/* Utility icons live directly under the brand row */}
      <NavUtilityIcons
        moduleId={activeModuleId()}
        class="flex justify-evenly gap-1 px-1 pb-3 mb-3 border-b border-rim"
      />
    </nav>
  );
}
