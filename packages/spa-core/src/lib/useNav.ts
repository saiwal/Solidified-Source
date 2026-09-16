// shared/lib/useNav.ts

import { createMemo } from "solid-js";
import {
  useNavData,
  useChannelNav,
  usePinnedApps,
  useFeaturedApps,
  useSystemApps,
  useInstalledApps,
} from "../store/nav-store";

import { isAdmin } from "../store/auth-store";
import type { NavItemDef } from "../types/module.types";
import type { NavActions, NavChannelTab, NavApp } from "../lib/nav-api";
import { biToNavIcon } from "../lib/nav-api";
import { getRoutes, getSpaExclusiveNavItems, getModule, moduleIdForPath } from "../module-registry";
import { useI18n } from "../i18n";
import { useViewerRole } from "../store/site-config";
import { applyNavItemOrder } from "../store/nav-order";
import { disabledFrontendModules } from "../store/disabled-frontend-modules";
import type { ViewerRole } from "../store/site-config";

type ActionMeta = {
  label: string;
  icon: string;
  context: NavItemDef["context"];
};

// ── Role matching (used by useNavActionItems) ─────────────────────────────────

function matchesRole(
  context: NavItemDef["context"],
  role: ViewerRole,
): boolean {
  if (context === "all") return true;
  if (Array.isArray(context)) return (context as string[]).includes(role);
  return context === role;
}

// ── URL helpers ───────────────────────────────────────────────────────────────

function urlToPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.startsWith("/") ? url : "/" + url;
  }
}

function toSpaHref(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.origin === window.location.origin) return u.pathname + u.search;
  } catch {
    // relative or malformed — use as-is
  }
  return url;
}

function tabToNavItem(tab: NavChannelTab): NavItemDef {
  const href = toSpaHref(tab.url);
  return {
    label: tab.label,
    icon: tab.icon,
    href,
    path: urlToPath(href),
  };
}

// Server-provided app URLs don't necessarily match the owning module's own
// registered path (e.g. the Calendar app URL is "/cdav/calendar" while the
// module's SPA route/navItem use "/cal"). Route matching via
// `moduleIdForPath` resolves either URL back to the owning module, so we
// prefer that module's own i18n-aware label over the server's raw one.
// (The server's label is translated in the *account's* Hubzilla language, which
// need not be the SPA locale, so this is what keeps the nav in one language.)
//
// Only for the module's own entry point, though — its navItem path, or the app
// its appUrlSlug names. A module may also own alias routes for *other* apps —
// the directory module answers /connections so pasted classic links work — and
// relabelling those made the Connections app render as a second "Directory".
function appToNavItem(app: NavApp): NavItemDef {
  const href = toSpaHref(app.url);
  const path = urlToPath(href);
  const mod = getModule(moduleIdForPath(path));
  const isEntryPoint =
    mod?.navItem?.path === path ||
    (!!mod?.appUrlSlug && app.url_raw?.includes(mod.appUrlSlug));
  return {
    label: (isEntryPoint ? mod?.navItem?.label : undefined) ?? app.label,
    icon: biToNavIcon(app.bi_icon),
    href,
    path,
  };
}

// Build a set of first-segment path roots from registered SPA routes
// e.g. "/photos/:nick" → "photos", "/page/:nick/*path" → "page"
function buildSpaRoots(): Set<string> {
  return new Set(
    getRoutes()().map((r) => r.path.split("/").filter(Boolean)[0] ?? ""),
  );
}

function isSpaApp(app: NavApp, spaRoots: Set<string>): boolean {
  const href = toSpaHref(app.url);
  if (!href.startsWith("/")) return false;
  const root = href.split("/").filter(Boolean)[0] ?? "";
  return spaRoots.has(root);
}

/**
 * Would a pinned/featured app with this URL actually render a nav item?
 *
 * Two conditions, matching how the nav above is built: the URL's first segment
 * must be a registered SPA route root (`isSpaApp`'s rule — apps like NSFW at
 * /nsfw or an external Report Bug link have no SPA page at all), and the owning
 * module must declare a navItem (the Invite module deliberately declares none,
 * since its UI is a section of the directory and Nav.php drops it from every
 * app list). Used by settings/integrations to hide a nav toggle that can only
 * ever be a no-op.
 */
export function appNavigable(url: string): boolean {
  const href = toSpaHref(url);
  if (!href.startsWith("/")) return false;
  const path = urlToPath(href);
  if (!buildSpaRoots().has(path.split("/").filter(Boolean)[0] ?? "")) return false;
  return !!getModule(moduleIdForPath(path))?.navItem;
}

// Owner sees "owner" and "local" context items (they are a local user too).
// "admin" items are also included when the viewer is a site admin.
function visibleForOwner(context: NavItemDef["context"]): boolean {
  if (!context || context === "all" || context === "owner" || context === "local") return true;
  if (context === "admin") return isAdmin();
  if (Array.isArray(context))
    return (context as string[]).some(
      (c) => c === "owner" || c === "local" || c === "all" || (c === "admin" && isAdmin()),
    );
  return false;
}

// ── Help-mode targets ─────────────────────────────────────────────────────────

// Path roots whose doc topic name doesn't match the path segment itself.
const NAV_HELP_SLUGS: Record<string, string> = {
  cloud: "files",
  cal: "calendar",
  rmagic: "remote_login",
};

/**
 * Help-mode target for a nav item, in "nav.<topic>" form (see
 * src/docs/user/en/nav.md).
 *
 * Items for `appUrlSlug`-gated modules (Calendar, Photos, Wiki, ...) are built
 * from the *server's* app URL (see `appToNavItem` below), which doesn't
 * necessarily match the module's own registered path (e.g. the Calendar app
 * URL is "/cdav/calendar" while the module's SPA route/navItem use "/cal").
 * Route matching via `moduleIdForPath` resolves either URL back to the
 * owning module, so we derive the topic from that module's own registered
 * `navItem` rather than trusting the item's runtime `path` directly.
 */
export function navItemHelpTarget(item: NavItemDef): string {
  if (item.helpTarget) return item.helpTarget;
  const registered = getModule(moduleIdForPath(item.path))?.navItem;
  if (registered?.helpTarget) return registered.helpTarget;
  const seg = (registered?.path ?? item.path).replace(/^\//, "").split(/[/?#]/)[0] || "hq";
  return `nav.${NAV_HELP_SLUGS[seg] ?? seg}`;
}

function dedupByHref(items: NavItemDef[]): NavItemDef[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = typeof item.href === "function" ? item.href() : item.href;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── useNav ────────────────────────────────────────────────────────────────────
export function useNav(subjectNick: () => string): () => NavItemDef[] {
  const channelNav = useChannelNav(subjectNick);
  const pinnedApps = usePinnedApps();
  const featuredApps = useFeaturedApps();
  const systemApps = useSystemApps();
  const installedApps = useInstalledApps();
  const viewerRole = useViewerRole();

  return createMemo((): NavItemDef[] => {
    const role = viewerRole();
    const nick = subjectNick();
    const spaRoots = buildSpaRoots();

    // Logged-in local user visiting someone else's channel → channel tabs only.
    // System apps are excluded because they carry the viewer's own nick in
    // their URLs and are visually indistinguishable from personal pinned apps.
    if (nick && role === "local") {
      if (channelNav.loading) return [];
      return (channelNav()?.channel_tabs ?? []).map(tabToNavItem);
    }

    // Anonymous or remote visitor on a channel → channel tabs + system apps.
    if (nick && (role === "anonymous" || role === "remote")) {
      if (channelNav.loading) return [];
      const tabs = (channelNav()?.channel_tabs ?? []).map(tabToNavItem);
      const sysApps = systemApps()
        .filter((a) => isSpaApp(a, spaRoots))
        .map((a) => appToNavItem(a));
      return dedupByHref([...tabs, ...sysApps]);
    }

    // Owner in their own context → pinned + installed featured + SPA-exclusive + admin
    if (role === "owner") {
      const installed = installedApps();
      const filteredPinned = pinnedApps().filter((a) => isSpaApp(a, spaRoots));
      const pinnedUrls = new Set(filteredPinned.map((a) => toSpaHref(a.url)));
      const filteredFeatured = featuredApps().filter(
        (a) =>
          isSpaApp(a, spaRoots) &&
          !pinnedUrls.has(toSpaHref(a.url)) &&
          (installed.size === 0 || installed.has(a.url_raw)),
      );
      const items: NavItemDef[] = [...filteredPinned, ...filteredFeatured].map((a) =>
        appToNavItem(a),
      );

      // SPA-exclusive modules (no appUrlSlug) opt in with hidden: false
      for (const item of getSpaExclusiveNavItems(disabledFrontendModules())) {
        if (item.hidden === false && visibleForOwner(item.context)) items.push(item);
      }

      // Merge apps and SPA-exclusive modules into one reorderable list —
      // the user can drag any of them into any position in the live nav.
      return applyNavItemOrder(dedupByHref(items));
    }

    // Visitor (anon/remote) not on a channel → system apps only
    return systemApps()
      .filter((a) => isSpaApp(a, spaRoots))
      .map((a) => appToNavItem(a));
  });
}

// ── useNavActionItems ─────────────────────────────────────────────────────────

const ACTION_ORDER = [
  "admin",
  "settings",
  "manage",
  "navhome",
  "logout",
  "login",
  "register",
] as const;

type ActionKey = (typeof ACTION_ORDER)[number];

export function useNavActionItems(): () => NavItemDef[] {
  const navData = useNavData();
  const { t } = useI18n();
  const viewerRole = useViewerRole();
  return createMemo((): NavItemDef[] => {
    const actions = navData()?.actions as NavActions | undefined;
    if (!actions) return [];

    const role = viewerRole();
    const ACTION_META: Record<ActionKey, ActionMeta> = {
      admin: {
        label: t("nav.admin"),
        icon: "admin",
        context: "admin",
      },
      settings: {
        label: t("nav.settings"),
        icon: "settings",
        context: ["owner"],
      },
      manage: {
        label: t("nav.channels"),
        icon: "manage",
        context: ["owner"],
      },
      navhome: {
        label: t("nav.navhome"),
        icon: "home",
        context: ["local", "remote"],
      },
      logout: {
        label: t("nav.logout"),
        icon: "logout",
        context: ["owner", "local", "remote"],
      },
      login: { label: t("nav.login"), icon: "login", context: "anonymous" },
      register: {
        label: t("nav.register"),
        icon: "register",
        context: "anonymous",
      },
    };
    // These actions have SPA routes — use direct paths to avoid a hard reload.
    const SPA_PATHS: Partial<Record<ActionKey, string>> = {
      admin: "/admin",
      settings: "/settings",
      manage: "/manage",
      login: "/login",
    };

    return ACTION_ORDER.filter((key) => {
      if (key === "admin") return isAdmin();
      if (!actions[key]) return false;
      return matchesRole(ACTION_META[key].context, role);
    }).map((key): NavItemDef => {
      const meta = ACTION_META[key];
      const href = SPA_PATHS[key] ?? (actions[key] as string);
      return {
        label: meta.label,
        icon: meta.icon,
        href,
        path: urlToPath(href),
        context: meta.context,
      };
    });
  });
}
