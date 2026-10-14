import { createContext, useContext, createSignal, createEffect } from "solid-js";
import type { ParentComponent } from "solid-js";
import { createStore } from "solid-js/store";
import * as i18n from "@solid-primitives/i18n";
import { localeRegistry } from "./locales/index";
import type { Locale, RawDictionary } from "./locales/index";

export type { Locale };

// Never imported at runtime — referenced only so tsc still checks each
// locale's index.ts, which is what makes a whole missing namespace file a
// build error (the per-file `RawDictionary["x"]` annotation only covers keys).
export type LocaleIndexes = [
  typeof import("./locales/en/index").dict,
  typeof import("./locales/de/index").dict,
  typeof import("./locales/hi/index").dict,
];

export const LOCALES = (
  Object.entries(localeRegistry) as [Locale, { label: string; flag: string }][]
).map(([value, { label, flag }]) => ({ value, label, flag }));

type Dictionary = i18n.Flatten<RawDictionary>;
type Namespace = keyof RawDictionary;

type I18nCtx = {
  t: i18n.Translator<Dictionary>;
  locale: () => Locale;
  setLocale: (l: Locale) => void;
};

const I18nContext = createContext<I18nCtx>();
const FALLBACK: Locale = "en";
const LOCALE_STORAGE_KEY = "hz-locale";

/** Namespaces every page needs (shell, nav, widget picker, stream, composer).
 *  Loaded before first render; everything else loads with the module using it. */
const CORE: Namespace[] = [
  "nav", "layout", "ui", "widgets", "help", "tour", "post",
  "editor", "share", "connection", "filters", "notify",
];

// One lazy chunk per (locale, namespace). index.ts files are type-only (above).
const files = import.meta.glob<Record<string, object>>([
  "./locales/*/*.ts",
  "!./locales/*/index.ts",
  "!./locales/pirate/*",
  "!./locales/namespaces/*",
]);

function fetchNs(loc: Locale, ns: string): Promise<object | undefined> {
  if (loc === "arr") {
    return Promise.all([fetchNs("en", ns), import("./locales/pirate/index")])
      .then(([en, p]) => en && p.piratizeTree(en));
  }
  const load = files[`./locales/${loc}/${ns}.ts`];
  return load ? load().then((m) => m[ns]) : Promise.resolve(undefined);
}

// dicts[locale][namespace] — filled as namespaces load, read reactively by t().
const [dicts, setDicts] = createStore<Partial<Record<Locale, Record<string, object>>>>({});
const pending = new Map<string, Promise<void>>();

/** Loads the given namespaces for a locale (default: the current one).
 *  Unknown namespaces resolve as no-ops, so callers can pass module ids blindly. */
export function ensureNamespaces(nss: readonly string[], loc: Locale = locale()): Promise<void> {
  return Promise.all(
    nss.map((ns) => {
      if (dicts[loc]?.[ns]) return;
      const key = `${loc}/${ns}`;
      let p = pending.get(key);
      if (!p) {
        p = fetchNs(loc, ns)
          .then((d) => {
            if (d) setDicts(loc, (prev) => ({ ...prev, [ns]: d }));
          })
          .catch((e) => console.warn(`[i18n] failed to load ${key}`, e))
          .finally(() => pending.delete(key));
        pending.set(key, p);
      }
      return p;
    }),
  ).then(() => {});
}

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && saved in localeRegistry) return saved as Locale;
  } catch {}
  return FALLBACK;
}

// Module-level so module-registry can preload for the current locale.
const [locale, setLocaleSignal] = createSignal<Locale>(getInitialLocale());

/** Resolves once the core namespaces of the initial locale are loaded — await before render(). */
export const i18nReady = (): Promise<void> => ensureNamespaces(CORE);

/** True once a locale has been explicitly set (manually, or synced from classic Hubzilla). */
export function hasStoredLocalePreference(): boolean {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Maps a classic-Hubzilla language code (from App::$language — e.g. "de",
 * "pt-br") to one of the SPA's implemented locales, falling back to English
 * when there's no match (e.g. a language classic supports via core gettext
 * but the SPA hasn't added an `apps`/i18n namespace for yet).
 */
export function resolveSupportedLocale(code: string | null | undefined): Locale {
  if (!code) return FALLBACK;
  const lc = code.toLowerCase();
  if (lc in localeRegistry) return lc as Locale;
  const base = lc.split(/[-_]/)[0];
  if (base in localeRegistry) return base as Locale;
  return FALLBACK;
}

function lookup(loc: Locale, path: string[]): unknown {
  let v: any = dicts[loc];
  for (const p of path) v = v?.[p];
  return v;
}

const t = ((key: string, args?: Record<string, unknown>) => {
  const path = key.split(".");
  const loc = locale();
  let v = lookup(loc, path);
  if (v === undefined) {
    // Namespace not loaded yet (a module that didn't declare it, or a dynamic
    // key): fetch it; the store write re-runs this. English shows meanwhile
    // if it happens to be loaded, else the raw key.
    if (!dicts[loc]?.[path[0]]) void ensureNamespaces([path[0]], loc);
    v = lookup(FALLBACK, path);
  }
  if (typeof v !== "string") {
    if (dicts[loc]?.[path[0]]) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  return args ? i18n.resolveTemplate(v, args as any) : v;
}) as i18n.Translator<Dictionary>;

const setLocale = (l: Locale) => {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, l);
  } catch {}
  // Load what the current locale already shows before switching, so the
  // previous language stays up instead of a flash of raw keys.
  const shown = Object.keys(dicts[locale()] ?? {});
  void ensureNamespaces(shown, l).then(() => setLocaleSignal(l));
};

export const I18nProvider: ParentComponent = (props) => {
  createEffect(() => {
    document.documentElement.lang = locale();
  });

  return (
    <I18nContext.Provider value={{ t, locale, setLocale }}>
      {props.children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
};
