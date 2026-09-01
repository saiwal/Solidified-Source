// npx esbuild packages/spa-core/src/store/widget-layout.test.ts --bundle --platform=node \
//   --format=esm --outfile=/tmp/wl.test.mjs && node /tmp/wl.test.mjs
//
// Bundled rather than run through --experimental-strip-types like the lib/
// tests: this module's extensionless relative imports (../lib/fetch) are
// resolved by vite at build time, and node can't resolve them on its own.
// Nothing here calls the fetch/signal half — only the tolerant parser.
import assert from "node:assert";
import { parseWidgetLayout, entrySpan, entryConfig } from "./widget-layout";

const wrap = (entries: unknown[]) => ({ version: 1, modules: { hq: { header: entries } } });
const slot = (raw: unknown) => parseWidgetLayout(raw)?.modules.hq?.header;
const parseSlots = (slots: Record<string, unknown>) =>
  parseWidgetLayout({ version: 1, modules: { hq: slots } })?.modules.hq;

// Plain-string singletons are untouched — layouts saved before spans existed.
assert.deepEqual(slot(wrap(["a.b"])), ["a.b"]);

// A valid span round-trips, and rides alongside config.
const withSpan = slot(wrap([{ id: "a.b", key: "a.b", span: 6 }]))!;
assert.equal(entrySpan(withSpan[0]!), 6);
const both = slot(wrap([{ id: "a.b", key: "a.b#x1", config: { n: 1 }, span: 3 }]))!;
assert.equal(entrySpan(both[0]!), 3);
assert.deepEqual(entryConfig(both[0]!), { n: 1 });

// Out-of-range, non-integer and non-numeric spans are dropped, but the rest of
// the entry survives — a bad span must never cost the user their widget.
for (const bad of [0, 13, -1, 6.5, "6", null, NaN]) {
  const e = slot(wrap([{ id: "a.b", key: "a.b", config: { n: 1 }, span: bad }]))!;
  assert.equal(e.length, 1, `span ${String(bad)} dropped the entry`);
  assert.equal(entrySpan(e[0]!), undefined, `span ${String(bad)} was kept`);
  assert.deepEqual(entryConfig(e[0]!), { n: 1 });
}

// Absent span means full width, expressed as undefined rather than 12.
assert.equal(entrySpan(slot(wrap([{ id: "a.b", key: "a.b" }]))![0]!), undefined);
assert.equal(entrySpan("a.b"), undefined);

// ── Retired slots fold into header rather than being dropped ────────────────
// gridTop and contentTop used to be separate regions directly above the page
// content. A user who had widgets in them must not lose them on upgrade.
{
  const m = parseSlots({ header: ["a.h"], gridTop: ["a.g"], contentTop: ["a.c"] })!;
  assert.deepEqual(m.header, ["a.h"], "header is a separate region and keeps its own");
  assert.deepEqual(m.contentTop, ["a.g", "a.c"], "gridTop sat above contentTop");
  assert.equal("gridTop" in m, false);
}

// The fold is order-independent: the stored JSON's key order must not change
// the result.
assert.deepEqual(
  parseSlots({ contentTop: ["a.c"], gridTop: ["a.g"] })!.contentTop,
  ["a.g", "a.c"],
);

// A widget present in both slots is kept once, not duplicated.
assert.deepEqual(parseSlots({ contentTop: ["a.x"], gridTop: ["a.x"] })!.contentTop, ["a.x"]);

// Folding into a slot the user never had is still a plain move.
assert.deepEqual(parseSlots({ gridTop: ["a.g"] })!.contentTop, ["a.g"]);

// Untouched slots are unaffected by the fold's sort.
{
  const m = parseSlots({ right: ["a.r"], footer: ["a.f"], gridTop: ["a.g"] })!;
  assert.deepEqual(m.right, ["a.r"]);
  assert.deepEqual(m.footer, ["a.f"]);
  assert.deepEqual(m.contentTop, ["a.g"]);
}

console.log("widget-layout: ok");
