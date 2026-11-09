/**
 * PinPicker.tsx
 * One draggable pin on a Leaflet map: click the map to drop it, drag it to
 * adjust. A `value` set from outside (search, geolocation) recentres the map;
 * one set by clicking or dragging leaves the view where the user put it.
 * Callers lazy-load the file that imports this, so Leaflet stays out of the
 * main bundle.
 */
import { createEffect, onCleanup, onMount } from "solid-js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coord } from "@utsukta/spa-core/lib/osm";
import { ATTRIBUTION, TILES } from "./MapView";

// Static markup only. A divIcon sidesteps Leaflet's default marker images,
// whose URLs the bundler breaks.
const PIN = L.divIcon({
  className: "",
  html: `<svg viewBox="0 0 24 24" width="32" height="32" style="color:var(--color-accent);filter:drop-shadow(0 1px 1px rgb(0 0 0/.4))"><path fill="currentColor" stroke="#fff" stroke-width="1.5" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>`,
  iconSize: [32, 32],
  iconAnchor: [16, 30],
});

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export default function PinPicker(props: {
  value: Coord | null;
  onChange: (c: Coord) => void;
  label: string;
  class?: string;
}) {
  let el!: HTMLDivElement;
  let map: L.Map | undefined;
  let pin: L.Marker | undefined;
  let fromMap = false;

  const pick = (ll: L.LatLng) => {
    const w = ll.wrap();
    fromMap = true;
    props.onChange({ lat: round6(w.lat), lon: round6(w.lng) });
  };

  onMount(() => {
    map = L.map(el, { worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => pick(e.latlng));
    // Mounted inside an opening <dialog>: the first measured size is often 0.
    const ro = new ResizeObserver(() => map?.invalidateSize());
    ro.observe(el);
    onCleanup(() => { ro.disconnect(); map?.remove(); });
  });

  createEffect(() => {
    const c = props.value;
    if (!map) return;
    if (!c) { pin?.remove(); pin = undefined; return; }
    if (pin) pin.setLatLng([c.lat, c.lon]);
    else {
      pin = L.marker([c.lat, c.lon], { draggable: true, icon: PIN, title: props.label }).addTo(map);
      pin.on("dragend", () => pick(pin!.getLatLng()));
    }
    if (!fromMap) map.setView([c.lat, c.lon], Math.max(map.getZoom(), 15));
    fromMap = false;
  });

  // `isolate`: Leaflet's panes run z-index up to 1000 (see MapView).
  return (
    <div
      ref={el}
      role="application"
      aria-label={props.label}
      class={`isolate rounded-lg border border-rim cursor-crosshair ${props.class ?? "h-[300px]"}`}
    />
  );
}
