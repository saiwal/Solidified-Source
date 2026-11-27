// shared/store/disabled-frontend-modules.ts
//
// Persists the set of `frontendFeature` modules (e.g. tools, games, inbox —
// pure-frontend modules with no backing Hubzilla app) whose state the user has
// flipped *away from the module's own default*, to pconfig (cat "spa", key
// "disabled_frontend_modules" — the name predates per-module defaults), with a
// localStorage cache so gating doesn't flash the wrong state before pconfig
// loads. Toggled from the Integrations settings section; the default lives in
// `frontendFeature.defaultEnabled` and the XOR is in frontendFeatureEnabled().

import { createSignal } from "solid-js";
import { apiFetch } from "../lib/fetch";
import { getModule } from "../module-registry";

const STORAGE_KEY = "hz-disabled-frontend-modules";

function parseIds(raw: unknown): string[] {
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

function readCache(): Set<string> {
  try {
    return new Set(parseIds(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return new Set();
  }
}

function writeCache(ids: string[]): void {
  try {
    if (ids.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage full / private mode — cache is best-effort
  }
}

const [disabledFrontendModules, setDisabledFrontendModules] = createSignal<Set<string>>(readCache());
// False until the server value lands. The cache is empty on a fresh browser,
// so before then a default-off module the user switched on reads as off —
// ModuleGuard must not redirect on that guess.
const [frontendModulesLoaded, setFrontendModulesLoaded] = createSignal(false);
export { disabledFrontendModules, frontendModulesLoaded };

// Called from auth-store with the pconfig value at boot — the server wins,
// including its absence (a reset on another device must clear this cache too).
export function initDisabledFrontendModules(raw: string | undefined): void {
  const parsed = raw !== undefined ? parseIds(raw) : [];
  setDisabledFrontendModules(new Set(parsed));
  setFrontendModulesLoaded(true);
  writeCache(parsed);
}

export function setFrontendModuleEnabled(id: string, enabled: boolean): void {
  // The id is stored only when the requested state differs from the module's
  // own default, so a default-off module records an override when switched on.
  const override = enabled !== (getModule(id)?.frontendFeature?.defaultEnabled !== false);
  const next = new Set(disabledFrontendModules());
  if (override) next.add(id);
  else next.delete(id);
  setDisabledFrontendModules(next);
  writeCache([...next]);
  apiFetch("/spa/settings/integrations", {
    method: "POST",
    // `enabled` kept for older cached bundles hitting a newer server.
    body: JSON.stringify({ action: "toggle-frontend", id, enabled, override }),
  }).catch(() => {});
}
