/**
 * MapView.tsx
 * Multi-pin Leaflet map, fitted to its points. Callers lazy() this file so
 * Leaflet only loads on pages that show a map, and gate it on
 * useMapsEnabled() (spa-core/lib/useOsmMap) like the single-pin [map] embeds.
 *
 * Tiles come straight from tile.openstreetmap.org: the openstreetmap addon's
 * `tmsserver` is the site URL its iframe embeds use, not a {z}/{x}/{y}
 * template. Core's opt-in CSP leaves img-src open, so no hook is needed.
 *
 * Labels and thumbnails are federated/user text: they go in as DOM nodes
 * (textContent / img.src), never as HTML strings, which Leaflet would
 * innerHTML.
 */
import { createEffect, onCleanup, onMount } from "solid-js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  lat: number;
  lon: number;
  label: string;
  /** Image url — the pin becomes a round thumbnail instead of a dot. */
  thumb?: string;
  onClick?: () => void;
}

// ponytail: hardcoded public tiles; add an admin tile-template setting if a hub wants its own server
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function thumbIcon(src: string): L.DivIcon {
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.loading = "lazy";
  img.className = "w-10 h-10 rounded-full object-cover border-2 border-surface shadow";
  return L.divIcon({ html: img, className: "", iconSize: [40, 40], iconAnchor: [20, 20] });
}

export default function MapView(props: { points: MapPoint[]; class?: string }) {
  let el!: HTMLDivElement;
  let map: L.Map | undefined;
  let layer: L.LayerGroup | undefined;

  onMount(() => {
    map = L.map(el, { worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    layer = L.layerGroup().addTo(map);
  });

  createEffect(() => {
    if (!map || !layer) return;
    layer.clearLayers();
    const accent = getComputedStyle(el).getPropertyValue("--color-accent").trim() || "#3b82f6";
    for (const p of props.points) {
      const m = p.thumb
        ? L.marker([p.lat, p.lon], { icon: thumbIcon(p.thumb), title: p.label })
        : L.circleMarker([p.lat, p.lon], { radius: 7, color: accent, fillOpacity: 0.8 });
      if (p.label) {
        const tip = document.createElement("span");
        tip.textContent = p.label;
        m.bindTooltip(tip);
      }
      if (p.onClick) m.on("click", p.onClick);
      m.addTo(layer);
    }
    if (props.points.length) {
      map.fitBounds(L.latLngBounds(props.points.map((p) => [p.lat, p.lon])), { padding: [40, 40], maxZoom: 14 });
    }
  });

  onCleanup(() => map?.remove());

  // `isolate`: Leaflet's panes run z-index up to 1000 and would otherwise
  // paint over the app's sticky headers and menus.
  return <div ref={el} class={`isolate rounded border border-rim ${props.class ?? "h-[60vh] min-h-[320px]"}`} />;
}
