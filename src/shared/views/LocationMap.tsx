/**
 * LocationMap.tsx
 * One-pin map for a free-text location ("lat lon" or a place name): the same
 * OSM embed iframe [map] uses, so no Leaflet. Place names resolve through
 * /spa/geocode; nothing renders if that fails or maps are off.
 */
import { createResource, Show } from "solid-js";
import { DEFAULT_TMS, geocode, osmEmbedSrc, osmLink, parseCoord } from "@utsukta/spa-core/lib/osm";
import { useMapsEnabled } from "@utsukta/spa-core/lib/useOsmMap";
import { useNavData } from "@utsukta/spa-core/store/nav-store";

export default function LocationMap(props: { location: string; class?: string; /** Link text; defaults to the location. */ label?: string }) {
  const enabled = useMapsEnabled();
  const navData = useNavData();
  const [coord] = createResource(
    () => (enabled() && props.location.trim()) || null,
    async (loc) => parseCoord(loc) ?? (await geocode(loc).catch(() => null)),
  );
  const tms = () => navData()?.osm?.tmsserver || DEFAULT_TMS;

  return (
    <Show when={coord()}>
      {(c) => (
        <div class={props.class}>
          <iframe
            src={osmEmbedSrc(c(), tms(), navData()?.osm?.marker ?? 1)}
            loading="lazy"
            title={props.location}
            class="w-full h-48 rounded border border-rim"
          />
          <a href={osmLink(c(), navData()?.osm?.zoom ?? 16, tms())} target="_blank" rel="noopener noreferrer"
            class="text-xs text-muted hover:underline">
            {props.label ?? props.location}
          </a>
        </div>
      )}
    </Show>
  );
}
