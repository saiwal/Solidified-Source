import { type JSX, Show, createMemo, createSignal, createEffect } from "solid-js";
import { useLocation, useNavigate, A } from "@solidjs/router";
import { createMediaQuery } from "@solid-primitives/media";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { isAppInstalled } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

export type SubPageContext = "owner" | "local" | "remote" | "anonymous" | "all";

export interface SubPageItem {
  path: string;
  label: string | (() => string);
  icon?: JSX.Element;
  dividerAfter?: boolean;
  /** Who can see this nav item. Omit or use "all" for everyone. */
  context?: SubPageContext | SubPageContext[];
  /** Stable url path fragment (e.g. "/group") of the Hubzilla app that must
   * be installed for this item to appear — see ModuleDef.appUrlSlug. */
  requiresApp?: string;
}

interface Props {
  base: string;
  items: SubPageItem[];
  activeKey: string;
  children: JSX.Element;
  sidebarFooter?: JSX.Element;
  /** Override the content area wrapper classes. Default: "flex-1 overflow-y-auto" */
  contentClass?: string;
}

// Each section path (e.g. "/settings/integrations") is registered as its own
// <Route>, so navigating back to the bare base path unmounts SubPageLayout
// entirely — component-local state can't survive that. Track the last
// section per base outside the component lifecycle instead.
const lastKeyByBase = new Map<string, string>();

function isVisible(item: SubPageItem, role: string, installed: Set<string>): boolean {
  if (item.requiresApp && !isAppInstalled(installed, item.requiresApp)) return false;
  if (!item.context || item.context === "all") return true;
  // "admin" is a superset of "owner" for visibility purposes
  const effectiveRole = role === "admin" ? "owner" : role;
  if (Array.isArray(item.context)) return item.context.includes(effectiveRole as SubPageContext);
  return item.context === effectiveRole;
}

export default function SubPageLayout(props: Props) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const role = useViewerRole();
  const installedApps = useInstalledApps();
  const isDesktop = createMediaQuery("(min-width: 768px)"); // the `md:` classes below

  const visibleItems = createMemo(() =>
    props.items.filter((item) => isVisible(item, role(), installedApps())),
  );

  const atBase = () =>
    location.pathname === props.base ||
    location.pathname === props.base + "/";

  // Remember the last section visited so the overview list (mobile) keeps it
  // highlighted after "< Back" navigates to the bare base path, which has no
  // section segment for props.activeKey to derive from — and so returning to
  // the module from elsewhere reopens that section on desktop.
  // Only record while the URL really is under this base: ProfilesView renders
  // with base="/settings" from /profiles and would otherwise poison the map.
  const [lastKey, setLastKey] = createSignal(lastKeyByBase.get(props.base) ?? props.activeKey);
  createEffect(() => {
    if (location.pathname.startsWith(props.base + "/")) {
      setLastKey(props.activeKey);
      lastKeyByBase.set(props.base, props.activeKey);
    }
  });

  // Desktop never renders the bare base path: with no section segment the
  // rendered section falls back to a role default while the nav highlights the
  // remembered one, and the section component gets re-created out from under
  // whatever module-level paging state it shares. Redirect to the real URL.
  // Mobile keeps the base path — there it *is* the section menu.
  createEffect(() => {
    if (!atBase() || !isDesktop()) return;
    const key = lastKey();
    if (visibleItems().some((item) => item.path === key))
      navigate(`${props.base}/${key}`, { replace: true });
  });

  const highlightKey = () => (atBase() ? lastKey() : props.activeKey);

  const activeItem = () =>
    visibleItems().find((item) => item.path === props.activeKey);

  return (
    <div class="flex">

      {/* ── Left nav ─────────────────────────────────────── */}
      <aside
        class={[
          "shrink-0 flex flex-col border-rim",
          "w-full md:w-[224px] lg:w-[240px]",
          "border-b md:border-b-0 md:border-r",
          atBase() ? "flex" : "hidden md:flex",
        ].join(" ")}
      >
        <SubPageNav
          base={props.base}
          items={visibleItems()}
          activeKey={highlightKey()}
        />
        <Show when={props.sidebarFooter}>
          <div class="px-4 pb-3 mt-auto">{props.sidebarFooter}</div>
        </Show>
      </aside>

      {/* ── Right detail ─────────────────────────────────── */}
      <main
        class={[
          "flex-1 min-w-0 flex flex-col",
          atBase() ? "hidden md:flex" : "flex",
        ].join(" ")}
      >
        {/* Mobile back bar */}
        <Show when={!atBase()}>
          <div class="flex items-center gap-2 px-4 py-3 border-b border-rim md:hidden shrink-0">
            <button
              type="button"
              onClick={() => navigate(props.base)}
              class="flex items-center gap-1.5 text-sm text-muted hover:text-txt transition-colors"
              aria-label={t("layout.back")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              {t("layout.back")}
            </button>
            <span class="text-sm font-medium text-txt ml-1">
              {(() => { const l = activeItem()?.label; return l ? (typeof l === "function" ? l() : l) : ""; })()}
            </span>
          </div>
        </Show>

        <div class={props.contentClass ?? "flex-1 min-w-0"}>
          {props.children}
        </div>
      </main>
    </div>
  );
}

// ── Nav list ─────────────────────────────────────────────────────────────────

function SubPageNav(props: {
  base: string;
  items: SubPageItem[];
  activeKey: string;
}) {
  const { t } = useI18n();
  return (
    <nav class="py-2 flex-1" aria-label={t("layout.section_navigation")}>
      {props.items.map((item) => {
        const active = () => item.path === props.activeKey;
        return (
          <>
            <A
              href={`${props.base}/${item.path}`}
              class={[
                "flex items-center gap-3 mx-2 px-3 py-2 rounded-xl text-sm",
                "transition-colors select-none",
                active()
                  ? "bg-elevated text-txt font-medium"
                  : "text-muted hover:bg-elevated/60 hover:text-txt",
              ].join(" ")}
            >
              {item.icon && (
                <span class="w-4 h-4 shrink-0 flex items-center justify-center opacity-80">
                  {item.icon}
                </span>
              )}
              <span class="flex-1 min-w-0 truncate">{typeof item.label === "function" ? item.label() : item.label}</span>
              <svg xmlns="http://www.w3.org/2000/svg"
                class="w-3.5 h-3.5 text-muted opacity-40 md:hidden shrink-0"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </A>
            {item.dividerAfter && <hr class="my-2 mx-3 border-rim" />}
          </>
        );
      })}
    </nav>
  );
}
