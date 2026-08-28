// lib/useOsmMap.ts
//
// Turns the <a class="map-embed"> anchors bbcode.ts emits for [map] into real
// embedded maps.
//
// Why the two-step: sanitizeHtml strips <iframe> and every data-* attribute on
// purpose — widening that allowlist would let any remote post embed an
// arbitrary frame. So bbcode.ts emits a plain anchor (which also keeps the
// post readable when the feature is off) and this hook swaps in an iframe
// built as a DOM node, after sanitising, the way usePlyr enhances a body.

import { createEffect, onCleanup } from "solid-js";
import { isModuleActive } from "../module-registry";
import { useInstalledApps, useNavData } from "../store/nav-store";
import { disabledFrontendModules } from "../store/disabled-frontend-modules";
import { DEFAULT_TMS, geocode, osmEmbedSrc, osmLink, parseCoord, type Coord } from "./osm";

function buildFrame(c: Coord, label: string, tms: string, zoom: number, marker: number): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "map my-2";

  const frame = document.createElement("iframe");
  frame.src = osmEmbedSrc(c, tms, marker);
  frame.loading = "lazy";
  frame.className = "w-full h-[300px] rounded border border-base-300";
  wrap.appendChild(frame);

  const link = document.createElement("a");
  link.href = osmLink(c, zoom, tms);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "text-xs opacity-70 hover:underline";
  link.textContent = label;
  wrap.appendChild(link);

  return wrap;
}

/**
 * Replace every `a.map-embed` inside `ref` with an embedded map.
 * Coordinate links resolve from their own href; place-name links need one
 * /spa/geocode round trip and stay plain links if it fails.
 *
 * A bare `[map]` (an empty div.map) means "this item's own location" — pass
 * `coord` to fill those from the post's coord field.
 *
 * Shaped like usePlyr(ref, body): call it from a component with the rendered
 * body element's ref accessor and an accessor for the body that produced it.
 */
export function useOsmMap(
  ref: () => HTMLElement | undefined,
  body: () => string,
  coord?: () => string | undefined,
): void {
  const installedApps = useInstalledApps();
  const navData = useNavData();

  createEffect(() => {
    body();
    const el = ref();
    if (!el) return;
    if (!isModuleActive("openstreetmap", installedApps(), disabledFrontendModules())) return;

    // null when the core openstreetmap addon is off site-wide — then its CSP
    // hook never whitelisted the tile server, so leave the plain links alone.
    const cfg = navData()?.osm;
    if (!cfg) return;
    const tms = cfg.tmsserver || DEFAULT_TMS;
    const zoom = cfg.zoom ?? 16;
    const marker = cfg.marker ?? 1;

    const own = coord?.() ? parseCoord(coord()!) : null;
    if (own) {
      for (const div of el.querySelectorAll<HTMLElement>("div.map:empty")) {
        div.replaceWith(buildFrame(own, `${own.lat}, ${own.lon}`, tms, zoom, marker));
      }
    }

    const anchors = Array.from(el.querySelectorAll<HTMLAnchorElement>("a.map-embed"));
    if (!anchors.length) return;

    const ac = new AbortController();
    onCleanup(() => ac.abort());

    for (const a of anchors) {
      const coordAttr = a.getAttribute("href")?.includes("#map=")
        ? a.textContent ?? ""
        : "";
      const c = coordAttr ? parseCoord(coordAttr) : null;

      if (c) {
        a.replaceWith(buildFrame(c, a.textContent || `${c.lat}, ${c.lon}`, tms, zoom, marker));
        continue;
      }

      // Place name — needs a lookup. Leave the link in place if it fails.
      const place = a.textContent?.trim();
      if (!place) continue;
      geocode(place, ac.signal)
        .then((hit) => { if (hit && a.isConnected) a.replaceWith(buildFrame(hit, place, tms, zoom, marker)); })
        .catch(() => { /* offline or not found — the plain link stands */ });
    }
  });
}
