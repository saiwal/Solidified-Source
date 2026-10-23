// node scripts/check-ui.mjs — asserts the @ui primitives wire labels, hints,
// errors and form semantics (fixture: packages/spa-ui/src/ui.check.tsx), via a Vite SSR render.
import { createServer } from "vite";
import solid from "vite-plugin-solid";
import { uiShadow } from "@utsukta/spa-ui/vite-plugin";
import assert from "node:assert";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const server = await createServer({
  root, configFile: false, logLevel: "error",
  plugins: [uiShadow({ themeUiDir: path.join(root, "src/ui") }), solid({ ssr: true })],
  resolve: { conditions: ["solid"] },
  optimizeDeps: { noDiscovery: true },
  ssr: { noExternal: ["solid-js"] },
  server: { middlewareMode: true },
});
try {
  const { html } = await server.ssrLoadModule("/packages/spa-ui/src/ui.check.tsx");
  const out = html();
  const fors = [...out.matchAll(/for="([^"]+)"/g)].map((m) => m[1]);
  const ids = [...out.matchAll(/<(?:input|select)[^>]*?\sid="([^"]+)"/g)].map((m) => m[1]);
  assert(ids.includes(fors[0]), "label targets its control");
  assert.equal(ids.filter((i) => i === fors[1]).length, 1, "a pair of controls shares no id");
  assert.match(out, /aria-describedby="[^"]+-note"/, "hint is the control's description");
  assert.match(out, /aria-invalid="true"/, "error marks the control invalid");
  assert(ids.includes("explicit"), "an explicit id wins");
  const sw = out.match(/<input[^>]*role="switch"[^>]*>/)?.[0] ?? "";
  assert.match(sw, /type="checkbox"/, "a switch is a native checkbox");
  assert.match(sw, /name="opt"/, "a switch keeps its form name");
  assert.match(sw, /value="1"/, "a switch submits 1 when on");
  assert.match(sw, /checked/, "a switch renders its checked state");
  const hintId = out.match(/<span[^>]*\sid="([^"]+)"[^>]*>Opt hint/)?.[1];
  assert(hintId && sw.includes(`aria-describedby="${hintId}"`), "toggle hint describes the switch");
  const tabs = [...out.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
  assert.match(out, /role="tablist"[^>]*aria-label="Views"/, "tablist is named");
  assert.equal(tabs.length, 4, "one tab per item, across both tablists");
  assert(/aria-selected="false"/.test(tabs[0]) && /tabindex="-1"/.test(tabs[0]), "unselected tab is out of the Tab order");
  assert(/aria-selected="true"/.test(tabs[1]) && /tabindex="0"/.test(tabs[1]), "selected tab is the Tab stop");
  const linked = [...out.matchAll(/<button[^>]*role="tab"[^>]*>.*?<\/button>/g)].map((m) => m[0]).slice(2);
  assert(/id="t-tab-b"/.test(linked[1]) && /aria-controls="t-panel-b"/.test(linked[1]), "a tab with an id controls its panel");
  assert(!/aria-controls/.test(tabs[0]), "a tab without an id controls nothing");
  assert.match(linked[0], /hz-count[^>]*>3</, "a tab shows its count");
  assert.match(out, /role="tabpanel"[^>]*id="t-panel-b"[^>]*aria-labelledby="t-tab-b"|aria-labelledby="t-tab-b"[^>]*id="t-panel-b"[^>]*role="tabpanel"/s, "panel is labelled by its tab");
  const bubble = (id) => out.match(new RegExp(`<i[^>]*id="${id}"[^>]*>(.*?)</i>`))?.[1] ?? "";
  assert(!/hz-count/.test(bubble("c0")), "a zero count renders nothing");
  assert.match(bubble("c5"), />5</, "a count shows its number");
  assert.match(bubble("c150"), />99\+</, "a count above max shows max+");
  const chips = [...out.matchAll(/<button[^>]*class="[^"]*hz-chip[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.equal(chips.length, 3, "Chip renders a button, RemovableChip does not");
  assert(/aria-pressed="true"/.test(chips[0]), "a selected chip is pressed");
  assert(/bg-accent\b/.test(chips[0]) && !/bg-accent-muted/.test(chips[0]), "a selected chip is a solid accent fill");
  assert(!/aria-pressed/.test(chips[1]), "an unselected chip only gets aria-pressed when told");
  assert(/rainbow-pill/.test(chips[2]), "a rainbow chip uses the rainbow-pill treatment");
  assert.match(out, /hz-chip-count[^>]*>3</, "a chip shows its count");
  assert.match(
    out,
    /<span[^>]*class="[^"]*hz-chip[^"]*"[^>]*>[\s\S]*?aria-label="Remove Alice"/,
    "RemovableChip is a container with a labelled remove button",
  );
  const skeleton = out.match(/<div[^>]*class="[^"]*hz-skeleton[^"]*"[^>]*>/)?.[0] ?? "";
  assert(/aria-hidden="true"/.test(skeleton), "a skeleton is decorative");
  assert.equal((out.match(/hz-skeleton-line/g) ?? []).length, 2, "SkeletonText renders its lines");
  const banner = out.match(/<div[^>]*hz-banner[^>]*>/)?.[0] ?? "";
  assert(/role="status"/.test(banner), "a banner is a status region by default");
  assert(/bg-warning-muted/.test(banner), "a banner uses its tone");
  assert.match(out, /Heads up/, "a banner title renders");
  const search = out.match(/<input[^>]*type="search"[^>]*>/)?.[0] ?? "";
  assert(/aria-label="Search"/.test(search), "the search field is named");
  assert(/aria-label="Clear"/.test(out), "the search clear button is named");
  assert(/aria-label="Copy link"/.test(out), "the copy button is named");
  assert.match(out, /<span[^>]*sr-only[^>]*role="status"/, "the copy button announces the copied state");
  const popTrigger = out.match(/<button[^>]*aria-label="Open panel"[^>]*>/)?.[0] ?? "";
  assert(/aria-expanded="false"/.test(popTrigger), "a closed popover trigger is collapsed");
  assert(/aria-controls="[^"]+"/.test(popTrigger), "a popover trigger controls its panel");
  assert(!/Panel body/.test(out), "a closed popover renders no panel");
  const closedBtn = out.match(/<button[^>]*id="c-closed-btn"[^>]*>/)?.[0] ?? "";
  const openBtn = out.match(/<button[^>]*id="c-open-btn"[^>]*>/)?.[0] ?? "";
  const controls = (tag) => tag.match(/aria-controls="([^"]+)"/)?.[1] ?? "";
  assert(/aria-expanded="false"/.test(closedBtn), "a closed collapsible reports collapsed");
  assert(!new RegExp(`id="${controls(closedBtn)}"`).test(out), "a closed collapsible unmounts its panel");
  assert(/aria-expanded="true"/.test(openBtn), "an open collapsible reports expanded");
  assert(new RegExp(`id="${controls(openBtn)}"`).test(out), "an open collapsible renders its panel");
  assert(/Collapsible body/.test(out), "the collapsible panel shows its content");
  const progress = out.match(/<div[^>]*role="progressbar"[^>]*>/)?.[0] ?? "";
  assert(/aria-label="Uploading"/.test(progress), "a progress bar is named");
  assert(/aria-valuenow="40"/.test(progress) && /aria-valuemax="100"/.test(progress), "a progress bar reports its value");
  const error = out.match(/<div[^>]*role="alert"[^>]*hz-error[^>]*>|<div[^>]*hz-error[^>]*role="alert"[^>]*>/)?.[0] ?? "";
  assert(/role="alert"/.test(error), "an error state is an alert");
  assert(/Try again/.test(out) && /Network error/.test(out), "an error state shows its detail and retry");
  const input = out.match(/<input[^>]*class="[^"]*hz-input[^"]*"[^>]*>/)?.[0] ?? "";
  assert(/border-b/.test(input) && !/rounded-lg/.test(input), "a field is an underline, not a box");
  assert(/bg-transparent/.test(input), "an underline field has no fill");
  assert(/aria-label="Tip target"/.test(out) && !/Hint/.test(out), "a tooltip renders only its trigger until shown");
  assert(/aria-haspopup="menu"/.test(out), "a menu button advertises its menu");
  assert(/aria-expanded="false"/.test(out), "a menu button starts collapsed");
  assert.match(out, /<button[^>]*hz-row[^>]*>[\s\S]*?Row title/, "a list row renders as a button when clickable");
  assert.match(out, /Meta/, "a list row shows its meta line");
  assert.match(out, /Load more/, "load-more renders its button");
  assert(!/Gone/.test(out), "load-more renders nothing once the list is exhausted");
  assert(/aria-sort="ascending"/.test(out), "a sorted column reports its direction");
  assert.match(out, /Alpha/, "a data table renders its cells");
  assert.match(out, /hz-stat[\s\S]*?42[\s\S]*?Total/, "a stat shows its value and label");
  const swatch = out.match(/<input[^>]*type="color"[^>]*>/)?.[0] ?? "";
  assert(/aria-label="Accent colour"/.test(swatch), "a colour swatch names its picker");
  assert.match(out, /Accent colour/, "a colour swatch shows its label");
  const drop = out.match(/<input[^>]*type="file"[^>]*>/)?.[0] ?? "";
  assert(/aria-label="Upload files"/.test(drop), "a drop zone names its picker");
  assert.match(out, /or drag them/, "a drop zone shows its hint");
  console.log("check-ui: ok");
} finally {
  await server.close();
}
