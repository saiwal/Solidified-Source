/**
 * PhotoLocation.tsx
 * The photo view's location chip: "📍 Plaka, Athens ▾" under the filename
 * line, folding out a small map. The name is a cached reverse geocode
 * (/spa/geocode?lat&lon); until it lands — or when maps are off — the chip
 * shows the coordinates. People who may edit the photo can add, move or
 * remove the position with the composer's map picker.
 */
import { createResource, createSignal, lazy, Show } from "solid-js";
import { MdOutlineLocation_on, MdFillKeyboard_arrow_down } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { osmLink, parseCoord, reverseGeocode, type Coord } from "@utsukta/spa-core/lib/osm";
import { useMapsEnabled } from "@utsukta/spa-core/lib/useOsmMap";
import { toast } from "@utsukta/spa-core/store/toast";
import { Button } from "@ui/Button";
import LocationMap from "@/shared/views/LocationMap";
import { updateLocationAction } from "../store/store";

const MapPickerModal = lazy(() => import("@/shared/editor/map/MapPickerModal"));

const fmtCoord = (c: Coord) =>
  `${Math.abs(c.lat).toFixed(4)}° ${c.lat >= 0 ? "N" : "S"}, ${Math.abs(c.lon).toFixed(4)}° ${c.lon >= 0 ? "E" : "W"}`;

export default function PhotoLocation(props: { nick: string; resourceId: string; coord?: string; canWrite: boolean }) {
  const { t } = useI18n();
  const mapsOn = useMapsEnabled();
  const coord = () => (props.coord ? parseCoord(props.coord) : null);
  const [name] = createResource(() => (mapsOn() && coord()) || null, (c) => reverseGeocode(c).catch(() => null));
  const [open, setOpen] = createSignal(false);
  const [picking, setPicking] = createSignal(false);

  const label = () => name() || (coord() ? fmtCoord(coord()!) : "");

  async function save(c: Coord | null) {
    setPicking(false);
    try {
      await updateLocationAction(props.nick, props.resourceId, c ? `${c.lat} ${c.lon}` : "");
      if (!c) setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <Show
        when={coord()}
        fallback={
          <Show when={props.canWrite}>
            <Button variant="ghost" size="sm" class="-ml-2" title={t("photos.location_hint")} onClick={() => setPicking(true)}>
              <MdOutlineLocation_on size={14} /> {t("photos.location_add")}
            </Button>
          </Show>
        }
      >
        {(c) => (
          <div class="mt-1">
            {/* With maps off there's nothing to fold out: the chip links to OSM instead */}
            <Show
              when={mapsOn()}
              fallback={
                <a href={osmLink(c())} target="_blank" rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-xs text-muted hover:text-accent-txt">
                  <MdOutlineLocation_on size={14} class="shrink-0" /> {label()}
                </a>
              }
            >
              <button type="button" aria-expanded={open()} onClick={() => setOpen((o) => !o)}
                class="inline-flex items-center gap-1 text-xs text-muted hover:text-accent-txt rounded focus-visible:outline-2 focus-visible:outline-accent">
                <MdOutlineLocation_on size={14} class="shrink-0" />
                <span>{label()}</span>
                <MdFillKeyboard_arrow_down size={14} class="transition-transform" classList={{ "rotate-180": open() }} />
              </button>
            </Show>

            <Show when={open() && mapsOn()}>
              <div class="mt-2 space-y-1">
                <LocationMap location={`${c().lat} ${c().lon}`} label={t("photos.location_open_osm")} />
                <Show when={props.canWrite}>
                  <div class="flex flex-wrap items-center gap-1 -ml-2">
                    <Button variant="ghost" size="sm" onClick={() => setPicking(true)}>{t("photos.location_edit")}</Button>
                    <Button variant="ghost" size="sm" onClick={() => save(null)}>{t("photos.location_remove")}</Button>
                    <span class="text-xs text-muted px-2">{t("photos.location_local_note")}</span>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        )}
      </Show>

      <Show when={picking()}>
        <MapPickerModal
          initial={coord()}
          onPick={(c) => void save(c)}
          actionLabel={t("photos.location_save")}
          onClose={() => setPicking(false)}
        />
      </Show>
    </>
  );
}
