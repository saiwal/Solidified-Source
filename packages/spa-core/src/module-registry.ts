import { createSignal, type Component, lazy } from "solid-js";
import type {
  ComponentLoader,
  ModuleDef,
  NavItemDef,
  RouteDef,
  WidgetDef,
  WidgetSlotName,
} from "./types/module.types";

// Widget as stored in the registry: defaults resolved, owning module recorded
export interface RegisteredWidget extends WidgetDef {
  moduleId: string;
  defaultModules: string[];
}

const modules = new Map<string, ModuleDef>();
const widgets = new Map<string, RegisteredWidget>();
const [navItems, setNavItems] = createSignal<NavItemDef[]>([]);
const [routes, setRoutes] = createSignal<RouteDef[]>([]);
const [widgetVersion, setWidgetVersion] = createSignal(0);

// Lazy component cache — prevents remounting when memos recompute
const lazyCache = new WeakMap<ComponentLoader<any>, Component<any>>();
export function getLazy<P extends Record<string, any> = {}>(loader: ComponentLoader<P>): Component<P> {
  if (!lazyCache.has(loader)) lazyCache.set(loader, lazy(loader));
  return lazyCache.get(loader)!;
}

export function registerModule(def: ModuleDef) {
  if (modules.has(def.id)) {
    console.warn(`Module "${def.id}" already registered`);
    return;
  }
  modules.set(def.id, def);

  if (def.slots && Object.values(def.slots).some((e) => (Array.isArray(e) ? e.length > 0 : !!e))) {
    console.warn(`Module "${def.id}" uses deprecated "slots" — migrate to "widgets" (entries are ignored)`);
  }

  if (def.widgets) {
    for (const w of def.widgets) {
      if (widgets.has(w.id)) {
        console.warn(`Widget "${w.id}" already registered`);
        continue;
      }
      widgets.set(w.id, {
        ...w,
        moduleId: def.id,
        defaultModules: w.defaultModules ?? [def.id],
      });
    }
    setWidgetVersion((v) => v + 1);
  }

  if (def.navItem) setNavItems((prev) => [...prev, def.navItem!]);
  const taggedRoutes = def.routes.map((r) => ({ ...r, moduleId: def.id }));
  setRoutes((prev) => [...prev, ...taggedRoutes]);
}

export function getNavItems() {
  return navItems;
}

export function getRoutes() {
  return routes;
}

export function getModule(id: string) {
  return modules.get(id) ?? null;
}

export function getWidgetVersion() {
  return widgetVersion;
}

export function getWidget(id: string): RegisteredWidget | null {
  return widgets.get(id) ?? null;
}

// Registration-order list of every known widget (picker UI, layout validation)
export function getAllWidgets(): RegisteredWidget[] {
  return [...widgets.values()];
}

// Normalises a widget's single-or-list `slot` field for membership checks.
export function widgetSlots(w: Pick<WidgetDef, "slot">): WidgetSlotName[] {
  return Array.isArray(w.slot) ? w.slot : [w.slot];
}

// Global widgets — always mounted, never torn down
export function resolveGlobalSlots(slot: WidgetSlotName): RegisteredWidget[] {
  return [...widgets.values()].filter((w) => w.global && widgetSlots(w).includes(slot));
}

// Module-local widgets — swapped on navigation, globals excluded
export function resolveModuleSlot(slot: WidgetSlotName, moduleId: string): RegisteredWidget[] {
  return [...widgets.values()].filter(
    (w) =>
      !w.global &&
      (w.defaultSlot ? w.defaultSlot === slot : widgetSlots(w).includes(slot)) &&
      w.defaultModules.includes(moduleId),
  );
}

// Whether a user may place the widget on the given module's pages
export function widgetAllowedIn(w: RegisteredWidget, moduleId: string): boolean {
  const contexts = w.contexts ?? w.defaultModules;
  return contexts === "any" || contexts.includes(moduleId);
}

// Whether an installed-apps set (raw app urls, see useInstalledApps) contains
// an app whose url includes the given stable path fragment. Use this — not
// installedApps.has(name) — anywhere app installation is checked directly:
// app_name can be a stale translated string frozen on an old channel, while
// url is never translated (see isModuleActive below).
export function isAppInstalled(installedApps: Set<string>, urlSlug: string): boolean {
  for (const url of installedApps) if (url.includes(urlSlug)) return true;
  return false;
}

// The persisted frontend-module list holds ids whose state differs from the
// module's own default (see disabled-frontend-modules.ts), so the effective
// state is default XOR override.
export function frontendFeatureEnabled(
  feature: ModuleDef["frontendFeature"],
  moduleId: string,
  overrides?: Set<string>,
): boolean {
  if (!feature) return true;
  return (feature.defaultEnabled !== false) !== (overrides?.has(moduleId) ?? false);
}

// Returns false when the module has an appUrlSlug that isn't in the installed
// set, or is a frontendFeature module that's off for this user. Empty
// installedApps set is treated as "not yet loaded" — appUrlSlug-gated modules
// pass through.
export function isModuleActive(
  moduleId: string,
  installedApps: Set<string>,
  disabledFrontendModules?: Set<string>,
): boolean {
  const mod = modules.get(moduleId);
  if (!mod) return false;
  if (!frontendFeatureEnabled(mod.frontendFeature, moduleId, disabledFrontendModules)) return false;
  if (!mod.appUrlSlug) return true;
  if (installedApps.size === 0) return true;
  return isAppInstalled(installedApps, mod.appUrlSlug);
}

// Nav items from modules that have no Hubzilla appUrlSlug (SPA-exclusive features).
export function getSpaExclusiveNavItems(disabledFrontendModules?: Set<string>): NavItemDef[] {
  const result: NavItemDef[] = [];
  for (const [id, mod] of modules) {
    if (mod.appUrlSlug) continue;
    if (!frontendFeatureEnabled(mod.frontendFeature, id, disabledFrontendModules)) continue;
    if (mod.navItem) result.push(mod.navItem);
  }
  return result;
}

// Modules that declare frontendFeature — enumerable for the Settings UI.
export function getFrontendToggleableModules(): {
  id: string;
  navItem?: NavItemDef;
  frontendFeature: NonNullable<ModuleDef["frontendFeature"]>;
}[] {
  const result: ReturnType<typeof getFrontendToggleableModules> = [];
  for (const [id, mod] of modules) {
    if (mod.frontendFeature) result.push({ id, navItem: mod.navItem, frontendFeature: mod.frontendFeature });
  }
  return result;
}

// Resolve the module ID for a given pathname by matching against registered
// route patterns. Falls back to the first URL segment so existing behaviour
// is preserved for modules whose route root matches their module ID.
export function moduleIdForPath(pathname: string): string {
  for (const route of getRoutes()()) {
    // Strip dynamic and wildcard tails: "/cal/:nick" → "/cal", "/cdav/calendar" → "/cdav/calendar"
    const staticPrefix = route.path.replace(/\/:[^/].*/, "").replace(/\/\*.*/, "");
    if (pathname === staticPrefix || pathname.startsWith(staticPrefix + "/")) {
      return route.moduleId ?? "";
    }
  }
  return pathname.split("/").filter(Boolean)[0] ?? "";
}
