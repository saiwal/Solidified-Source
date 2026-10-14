// A joke locale, derived from `en` at load time rather than hand-translated:
// the dictionary shape is type-enforced across ~3400 lines, and nobody is
// pirate-translating that by hand — nor keeping it in sync afterwards.
// Applied per namespace, as each `en` namespace loads (see i18n/index.tsx).
import { piratize } from "./piratize";

// Every dictionary leaf is a string (see namespaces/types.ts) — no other case.
export const piratizeTree = (o: object): object =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [
      k,
      typeof v === "string" ? piratize(v) : piratizeTree(v),
    ]),
  );
