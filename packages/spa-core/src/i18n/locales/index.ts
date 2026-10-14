import type { RawDictionary } from "./namespaces/types";

export type { RawDictionary };

// Namespaces load lazily per locale — see ensureNamespaces() in ../index.tsx,
// which globs ./<locale>/<namespace>.ts. A new locale needs its folder (with an
// index.ts for the completeness check) plus an entry here.
export const localeRegistry = {
  en:  { label: "English", flag: "🇬🇧" },
  hi:  { label: "हिन्दी",  flag: "🇮🇳" },
  de:  { label: "Deutsch", flag: "🇩🇪" },
  arr: { label: "Pirate", flag: "🏴‍☠️" }, // derived from en, see pirate/index.ts
  // ← add new locales here
} satisfies Record<string, { label: string; flag: string }>;

export type Locale = keyof typeof localeRegistry;
