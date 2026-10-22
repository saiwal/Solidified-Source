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
  assert.equal(tabs.length, 2, "one tab per item");
  assert(/aria-selected="false"/.test(tabs[0]) && /tabindex="-1"/.test(tabs[0]), "unselected tab is out of the Tab order");
  assert(/aria-selected="true"/.test(tabs[1]) && /tabindex="0"/.test(tabs[1]), "selected tab is the Tab stop");
  const bubble = (id) => out.match(new RegExp(`<i[^>]*id="${id}"[^>]*>(.*?)</i>`))?.[1] ?? "";
  assert(!/hz-count/.test(bubble("c0")), "a zero count renders nothing");
  assert.match(bubble("c5"), />5</, "a count shows its number");
  assert.match(bubble("c150"), />99\+</, "a count above max shows max+");
  console.log("check-ui: ok");
} finally {
  await server.close();
}
