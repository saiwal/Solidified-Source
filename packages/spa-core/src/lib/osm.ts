// lib/osm.ts
//
// OpenStreetMap embeds for [map] BBCode, mirroring core's openstreetmap addon
// (addon/openstreetmap/openstreetmap.php) so SPA-rendered and server-rendered
// maps look the same.
//
// Pure url/coordinate helpers only — bbcode.ts imports these, so nothing here
// may pull in solid or a store. The DOM side lives in useOsmMap.ts.

export const DEFAULT_TMS = "https://www.openstreetmap.org";
export const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

export interface Coord { lat: number; lon: number }

/** Parse core's "lat lon" (and the "lat/lon" form bb_map_coords also accepts). */
export function parseCoord(raw: string): Coord | null {
  const parts = raw.trim().split(/[\s/,]+/);
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Link to the full map view — core's openstreetmap_location() form. */
export function osmLink(c: Coord, zoom = 16, tms = DEFAULT_TMS): string {
  return `${tms}/?mlat=${c.lat}&mlon=${c.lon}#map=${zoom}/${c.lat}/${c.lon}`;
}

/** Nominatim search link for a location that has no coordinates. */
export function osmSearchLink(location: string, nom = NOMINATIM_SEARCH): string {
  return `${nom}?q=${encodeURIComponent(location)}`;
}

/** Embedded-map src — the ±0.01 bbox core's openstreetmap_generate_map() uses. */
export function osmEmbedSrc(c: Coord, tms = DEFAULT_TMS, marker = 1): string {
  const bbox = [c.lon - 0.01, c.lat - 0.01, c.lon + 0.01, c.lat + 0.01].join(",");
  const m = marker > 0 ? `&marker=${c.lat},${c.lon}` : "";
  return `${tms}/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik${m}`;
}

/** Server-side forward geocode (see Api/Handlers/Geocode.php). */
export async function geocode(place: string, signal?: AbortSignal): Promise<Coord | null> {
  const res = await fetch(`/spa/geocode?place=${encodeURIComponent(place)}`, { signal });
  if (!res.ok) return null;
  const json = await res.json();
  const d = json?.data ?? json;
  return parseCoord(`${d?.lat} ${d?.lon}`);
}
