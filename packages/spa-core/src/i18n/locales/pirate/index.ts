// A joke locale, derived from `en` at load time rather than hand-translated:
// the dictionary shape is type-enforced across ~3400 lines, and nobody is
// pirate-translating that by hand — nor keeping it in sync afterwards.
import { dict as en } from "../en/index";
import type { RawDictionary } from "../namespaces/types";
import { piratize } from "./piratize";

// Every dictionary leaf is a string (see namespaces/types.ts) — no other case.
const walk = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [
      k,
      typeof v === "string" ? piratize(v) : walk(v as Record<string, unknown>),
    ]),
  );

export const dict = walk(en as unknown as Record<string, unknown>) as unknown as RawDictionary;
