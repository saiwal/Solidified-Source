/**
 * MapPickerModal.tsx
 * Resolves a place (typed name via /spa/geocode, or the browser's own
 * geolocation) to coordinates, previews it, and inserts core's
 * `[map=lat lon]` BBCode.
 *
 * The preview is the same OSM embed iframe the posted map will use — no
 * Leaflet, no tile traffic beyond the one frame the user is looking at.
 */
import { createSignal, onCleanup, onMount, Show, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useNavData } from "@utsukta/spa-core/store/nav-store";
import { DEFAULT_TMS, geocode, osmEmbedSrc, type Coord } from "@utsukta/spa-core/lib/osm";

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

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); props.onClose(); }
  };
  document.addEventListener("keydown", onKeyDown);
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

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
    <Portal mount={document.body}>
      <div
        class="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("editor.map_modal_title")}
          class="w-full max-w-lg rounded-xl border border-rim bg-surface shadow-2xl
                 text-txt overflow-hidden"
        >
          <div class="px-4 py-3 border-b border-rim">
            <h2 class="text-sm font-semibold">{t("editor.map_modal_title")}</h2>
          </div>

          <div class="p-4 space-y-3">
            <div class="flex gap-2">
              <input
                ref={inputRef}
                type="search"
                value={place()}
                onInput={(e) => setPlace(e.currentTarget.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") { e.preventDefault(); void search(); }
                }}
                placeholder={t("editor.map_place_placeholder")}
                aria-label={t("editor.map_place")}
                class="flex-1 px-2 py-1.5 text-sm rounded-lg border border-rim bg-elevated
                       text-txt outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => void search()}
                disabled={!place().trim() || !!busy()}
                class="px-3 py-1.5 text-sm rounded-lg border border-rim hover:bg-elevated
                       disabled:opacity-50"
              >
                {busy() === "search" ? t("editor.map_searching") : t("editor.map_place")}
              </button>
            </div>

            <div class="flex items-center gap-3">
              <button
                type="button"
                onClick={locate}
                disabled={!!busy()}
                class="px-3 py-1.5 text-sm rounded-lg border border-rim hover:bg-elevated
                       disabled:opacity-50"
              >
                {busy() === "locate" ? t("editor.map_locating") : t("editor.map_use_browser")}
              </button>

              <label class="flex items-center gap-2 text-sm text-muted ml-auto">
                {t("editor.map_zoom")}
                <input
                  type="number"
                  min="1"
                  max="18"
                  value={zoom()}
                  onInput={(e) => setZoom(Math.min(18, Math.max(1, Number(e.currentTarget.value) || 16)))}
                  class="w-16 px-2 py-1 text-sm rounded-lg border border-rim bg-elevated
                         text-txt outline-none focus:border-accent"
                />
              </label>
            </div>

            <Show when={error()}>
              <p class="text-sm text-red-500">{error()}</p>
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
            <button
              type="button"
              onClick={props.onClose}
              class="px-3 py-1.5 text-sm rounded-lg border border-rim hover:bg-elevated"
            >
              {t("ui.cancel_btn")}
            </button>
            <button
              type="button"
              onClick={insert}
              disabled={!coord()}
              class="px-3 py-1.5 text-sm rounded-lg bg-accent text-white disabled:opacity-50"
            >
              {t("editor.map_insert")}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default MapPickerModal;
