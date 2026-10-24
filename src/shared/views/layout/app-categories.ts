import { moduleIdForPath } from "@utsukta/spa-core/module-registry";
import type { NavItemDef } from "@utsukta/spa-core/types/module.types";
import type { NavApp } from "@utsukta/spa-core/lib/nav-api";

/**
 * App-drawer categories for the mobile nav. Deliberately a presentation-layer
 * mapping (not a `NavItemDef` field) so adding a module doesn't require every
 * module to repeat its category: unresolved paths fall back to "system", and
 * server-provided app URLs are resolved back to their module via
 * `moduleIdForPath`.
 */
export type AppCategory = "social" | "productivity" |  "entertainment" | "system" ;

const BY_MODULE: Record<string, AppCategory> = {
  // People + feeds
  channel: "social",
  network: "social",
  pubstream: "social",
  directory: "social",
  viewconnections: "social",
  messenger: "social",
  chat: "social",
  hq: "social",
  inbox: "social",
  notify: "social",
  addressbook: "social",
  openstreetmap: "social",

  // Documents, organisation, storage, media
  articles: "productivity",
  cards: "productivity",
  calendar: "productivity",
  files: "productivity",
  bookmarks: "productivity",
  webpages: "productivity",
  wiki: "productivity",
  notepad: "productivity",
  cart: "productivity",
  blocks: "productivity",
  photos: "productivity",
  games: "entertainment",
  jellyfin: "entertainment",
  "jellyfin-profile": "entertainment",

  // Account, admin, settings
  settings: "system",
  help: "system",
  siteinfo: "system",
  tools: "system",
  admin: "system",
  moderate: "system",
  manage: "system",
  profile: "system",
  profiles: "system",
  rmagic: "system",
  login: "system",
  logout: "system",
  register: "system",
  invite: "system",
  "password-reset": "system",
  post: "system",
  rbmark: "system",
  "channel-create": "system",
  "channel-import": "system",
  chanview: "system",
};

const BY_ROOT: Record<string, AppCategory> = {
  channel: "social",
  network: "social",
  pubstream: "social",
  directory: "social",
  connections: "social",
  messenger: "social",
  chat: "social",
  hq: "social",
  inbox: "social",
  addressbook: "social",
  articles: "productivity",
  cards: "productivity",
  cal: "productivity",
  cdav: "productivity",
  cloud: "productivity",
  files: "productivity",
  bookmarks: "productivity",
  webpages: "productivity",
  wiki: "productivity",
  notepad: "productivity",
  cart: "productivity",
  photos: "productivity",
  games: "entertainment",
  jellyfin: "entertainment",
};

// Core's own app categories (.apd "categories:", user-editable in core's app
// editor), folded onto the drawer's three groups. Unknown terms are skipped.
const BY_CORE: Record<string, AppCategory> = {
  networking: "social",
  social: "social",
  federation: "social",
  productivity: "productivity",
  personal: "productivity",
  multimedia: "productivity",
  tools: "productivity",
  gaming: "entertainment",
  "e-commerce": "productivity",
  system: "system",
  "access control": "system",
  developer: "system",
  appearance: "system",
};

/** A built-in module's curated category, undefined for addons and unlisted ids. */
export function moduleCategory(moduleId: string | undefined): AppCategory | undefined {
  return moduleId ? BY_MODULE[moduleId] : undefined;
}

const rootOf = (path: string) => path.split("/").filter(Boolean)[0] ?? "";

/**
 * Category shown for an app in the mobile drawer: the curated module table
 * first (core files a few built-ins oddly — channel under Personal, chat
 * under Productivity), then the category core gives the matching app, so
 * addons group themselves from their own .apd, then the path table.
 */
export function appCategory(item: NavItemDef, apps: NavApp[] = []): AppCategory {
  const moduleId = moduleIdForPath(item.path);
  if (moduleId && BY_MODULE[moduleId]) return BY_MODULE[moduleId];
  const root = rootOf(item.path);
  for (const app of apps) {
    let appRoot: string;
    try {
      appRoot = rootOf(new URL(app.url, window.location.origin).pathname);
    } catch {
      continue;
    }
    if (appRoot !== root) continue;
    for (const c of app.categories) {
      const cat = BY_CORE[c.toLowerCase()];
      if (cat) return cat;
    }
  }
  return BY_ROOT[root] ?? "system";
}

/** Drawer group order. */
export const APP_CATEGORIES: { id: AppCategory; labelKey: "layout.social" | "layout.productivity" | "layout.entertainment" | "layout.system" }[] = [
  { id: "social", labelKey: "layout.social" },
  { id: "productivity", labelKey: "layout.productivity" },
	{ id: "entertainment", labelKey: "layout.entertainment"},
  { id: "system", labelKey: "layout.system" },
];

function appPath(app: NavApp): string {
  try {
    return new URL(app.url, window.location.origin).pathname;
  } catch {
    return app.url.split("?")[0];
  }
}

/**
 * "Favorites" = the apps the user pinned to the nav (Hubzilla's
 * nav_pinned_app), matched back to nav items by path, plus `extraPaths` —
 * SPA-only modules, which have no app to pin (pconfig spa/pinned_paths).
 */
export function pinnedNavItems(items: NavItemDef[], pinned: NavApp[], extraPaths: string[] = []): NavItemDef[] {
  const paths = new Set([...pinned.map(appPath), ...extraPaths]);
  return items.filter((item) => paths.has(item.path));
}

/**
 * The installed app behind a nav item, from the viewer's pinned + featured
 * lists (what an owner's nav is built from); undefined for SPA-only modules.
 */
export function appForNavItem(item: NavItemDef, apps: NavApp[]): NavApp | undefined {
  return apps.find((app) => appPath(app) === item.path);
}

/** What FavoriteStar pins for a nav item: its app if it has one, else its path. */
export function favoriteTarget(item: NavItemDef, apps: NavApp[]): { url: string } | { path: string } {
  const app = appForNavItem(item, apps);
  return app ? { url: app.url_raw } : { path: item.path };
}

/** Nav items split into the drawer/rail categories, empty groups dropped. */
export function groupNavItems(items: NavItemDef[], apps: NavApp[]) {
  return APP_CATEGORIES.map((cat) => ({
    ...cat,
    items: items.filter((item) => appCategory(item, apps) === cat.id),
  })).filter((group) => group.items.length > 0);
}

/** The apps core describes (system + the viewer's pinned/featured), for appCategory(). */
export function categoryApps(d?: { system_apps?: NavApp[]; pinned?: NavApp[]; featured?: NavApp[] }): NavApp[] {
  return [...(d?.system_apps ?? []), ...(d?.pinned ?? []), ...(d?.featured ?? [])];
}
