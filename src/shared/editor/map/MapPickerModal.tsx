/**
 * MapPickerModal.tsx
 * Resolves a place (typed name via /spa/geocode, or the browser's own
 * geolocation) to coordinates, previews it, and inserts core's
 * `[map=lat lon]` BBCode.
 *
 * The preview is the same OSM embed iframe the posted map will use — no
 * Leaflet, no tile traffic beyond the one frame the user is looking at.
 */
import { createSignal, onMount, Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useNavData } from "@utsukta/spa-core/store/nav-store";
import { DEFAULT_TMS, geocode, osmEmbedSrc, type Coord } from "@utsukta/spa-core/lib/osm";

import { Modal, ModalPanel } from "@ui/Modal";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
interface Props {
  onClose: () => void;
  onInsert: (bbcode: string) => void;
}

const MapPickerModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const navData = useNavData();
  const [place, setPlace] = createSignal("");
  const [coord, setCoord] = createSignal<Coord | null>(null);
  const [zoom, setZoom] = createSignal(navData()?.osm?.zoom ?? 16);
  const [busy, setBusy] = createSignal<"search" | "locate" | null>(null);
  const [error, setError] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  const tms = () => navData()?.osm?.tmsserver || DEFAULT_TMS;
  const marker = () => navData()?.osm?.marker ?? 1;

  onMount(() => inputRef?.focus());

  const search = async () => {
    const q = place().trim();
    if (!q || busy()) return;
    setBusy("search");
    setError("");
    try {
      const hit = await geocode(q);
      if (hit) setCoord(hit);
      else { setCoord(null); setError(t("editor.map_not_found")); }
    } catch {
      setCoord(null);
      setError(t("editor.map_not_found"));
    } finally {
      setBusy(null);
    }
  };

  // Same call shape as PostComposer's location field.
  const locate = () => {
    if (!navigator.geolocation || busy()) return;
    setBusy("locate");
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoord({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setBusy(null);
      },
      () => { setBusy(null); setError(t("editor.map_not_found")); },
    );
  };

  const insert = () => {
    const c = coord();
    if (!c) return;
    props.onInsert(`[map=${c.lat} ${c.lon}]`);
    props.onClose();
  };

  return (
    <Modal onClose={props.onClose} class="z-[80]">
      <ModalPanel title={t("editor.map_modal_title")} size="lg" class="text-txt overflow-hidden">
        <div class="p-4 space-y-3">
          <div class="flex gap-2">
            <Input class="flex-1" ref={inputRef} type="search" value={place()} onInput={(e) => setPlace(e.currentTarget.value)} onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); void search(); }
              }} placeholder={t("editor.map_place_placeholder")} aria-label={t("editor.map_place")} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void search()}
              disabled={!place().trim() || !!busy()}
            >
              {busy() === "search" ? t("editor.map_searching") : t("editor.map_place")}
            </Button>
          </div>

          <div class="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={locate} disabled={!!busy()}>
              {busy() === "locate" ? t("editor.map_locating") : t("editor.map_use_browser")}
            </Button>

            <label class="flex items-center gap-2 text-sm text-muted ml-auto">
              {t("editor.map_zoom")}
              <Input
                class="w-16"
                type="number"
                min="1"
                max="18"
                value={zoom()}
                onInput={(e) => setZoom(Math.min(18, Math.max(1, Number(e.currentTarget.value) || 16)))}
              />
            </label>
          </div>

          <Show when={error()}>
            <p class="text-sm text-danger-txt">{error()}</p>
          </Show>

          <Show when={coord()}>
            {(c) => (
              <div class="space-y-1">
                <iframe
                  src={osmEmbedSrc(c(), tms(), marker())}
                  class="w-full h-[260px] rounded-lg border border-rim"
                />
                <p class="text-xs text-muted">{c().lat}, {c().lon}</p>
              </div>
            )}
          </Show>
        </div>

        <div class="px-4 py-3 border-t border-rim flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            {t("ui.cancel_btn")}
          </Button>
          <Button size="sm" onClick={insert} disabled={!coord()}>
            {t("editor.map_insert")}
          </Button>
        </div>
      </ModalPanel>
    </Modal>
  );
};

export default MapPickerModal;
