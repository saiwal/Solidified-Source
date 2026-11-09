/**
 * MapPickerModal.tsx
 * Resolves a place (typed name via /spa/geocode, the browser's own
 * geolocation, or a pin dropped/dragged on the map) to coordinates and
 * inserts core's `[map=lat lon]` BBCode — or hands the coordinates to
 * `onPick` (photo location, a post's location).
 */
import { createSignal, onMount, Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useNavData } from "@utsukta/spa-core/store/nav-store";
import { geocode, type Coord } from "@utsukta/spa-core/lib/osm";
import PinPicker from "@/shared/views/PinPicker";

import { Modal, ModalPanel } from "@ui/Modal";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
interface Props {
  onClose: () => void;
  /** Composer use: receives `[map=lat lon]`. */
  onInsert?: (bbcode: string) => void;
  /** Picking a position for something else (a photo's location): gets the
   *  coordinates instead, and the button reads `actionLabel`. */
  onPick?: (c: Coord) => void;
  actionLabel?: string;
  initial?: Coord | null;
}

const MapPickerModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const navData = useNavData();
  const [place, setPlace] = createSignal("");
  const [coord, setCoord] = createSignal<Coord | null>(props.initial ?? null);
  const [zoom, setZoom] = createSignal(navData()?.osm?.zoom ?? 16);
  const [busy, setBusy] = createSignal<"search" | "locate" | null>(null);
  const [error, setError] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

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
    if (props.onPick) props.onPick(c);
    else props.onInsert?.(`[map=${c.lat} ${c.lon}]`);
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

            {/* Zoom only shapes the [map] embed — meaningless when picking a position */}
            <Show when={!props.onPick}>
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
            </Show>
          </div>

          <Show when={error()}>
            <p class="text-sm text-danger-txt">{error()}</p>
          </Show>

          <PinPicker value={coord()} onChange={(c) => { setCoord(c); setError(""); }} label={t("editor.map_pick_hint")} />
          <p class="text-xs text-muted">
            {coord() ? `${coord()!.lat}, ${coord()!.lon}` : t("editor.map_pick_hint")}
          </p>
        </div>

        <div class="px-4 py-3 border-t border-rim flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            {t("ui.cancel_btn")}
          </Button>
          <Button size="sm" onClick={insert} disabled={!coord()}>
            {props.actionLabel ?? t("editor.map_insert")}
          </Button>
        </div>
      </ModalPanel>
    </Modal>
  );
};

export default MapPickerModal;
