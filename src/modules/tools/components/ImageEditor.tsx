import { createSignal, For, onCleanup, Show } from "solid-js";
import { MdFillImage, MdFillCheck, MdFillFolder } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import SharedImageEditor from "@/shared/views/ImageEditor";
import {
  variantSrc,
  fetchPhotoSummary,
  fetchAlbums,
  uploadNewPhoto,
  type Photo,
  type Album,
} from "@/modules/photos/api/api";
import { currentNick } from "@utsukta/spa-core/store/auth-store";

export function ImageEditor() {
  const { t } = useI18n();
  const s = (key: Parameters<typeof t>[0]) => String(t(key));

  // ── Source (what the user is editing) ──────────────────────────────────────
  const [file, setFile] = createSignal<File | null>(null);

  // ── Result (after Filerobot save) ──────────────────────────────────────────
  const [resultBlob, setResultBlob] = createSignal<Blob | null>(null);
  const [resultUrl, setResultUrl] = createSignal<string | null>(null);

  // ── Album browser state ────────────────────────────────────────────────────
  const [albums, setAlbums] = createSignal<Album[]>([]);
  const [albumsLoading, setAlbumsLoading] = createSignal(false);
  const [newAlbumName, setNewAlbumName] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [savedAlbum, setSavedAlbum] = createSignal<string | null>(null);
  const [saveError, setSaveError] = createSignal<string | null>(null);

  // ── Photo picker state ─────────────────────────────────────────────────────
  const [showPicker, setShowPicker] = createSignal(false);
  const [pickerPhotos, setPickerPhotos] = createSignal<Photo[]>([]);
  const [pickerLoading, setPickerLoading] = createSignal(false);

  onCleanup(() => {
    const url = resultUrl();
    if (url) URL.revokeObjectURL(url);
  });

  // ── File helpers ───────────────────────────────────────────────────────────
  const openFile = (f: File) => {
    if (!f.type.startsWith("image/")) return;
    const prev = resultUrl();
    if (prev) URL.revokeObjectURL(prev);
    setResultUrl(null);
    setResultBlob(null);
    setSavedAlbum(null);
    setSaveError(null);
    setShowPicker(false);
    setFile(f);
  };

  const fileInput = (onChange: (f: File) => void) => (
    <input
      type="file"
      accept="image/*"
      class="sr-only"
      onChange={(e) => {
        const f = e.currentTarget.files?.[0];
        if (f) onChange(f);
        e.currentTarget.value = "";
      }}
    />
  );

  // ── Filerobot callbacks ────────────────────────────────────────────────────
  const handleConfirm = (blob: Blob) => {
    const prev = resultUrl();
    if (prev) URL.revokeObjectURL(prev);
    setResultBlob(blob);
    setResultUrl(URL.createObjectURL(blob));
    setSavedAlbum(null);
    setSaveError(null);
    setFile(null);

    // Pre-fetch albums in the background so the browser is ready immediately
    const nick = currentNick();
    if (nick && !albums().length) {
      setAlbumsLoading(true);
      fetchAlbums(nick)
        .then(setAlbums)
        .catch(() => {})
        .finally(() => setAlbumsLoading(false));
    }
  };

  const handleCancel = () => setFile(null);

  // ── Download ───────────────────────────────────────────────────────────────
  const download = () => {
    const blob = resultBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edited.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── Save to album ──────────────────────────────────────────────────────────
  const saveToAlbum = async (albumName: string) => {
    const blob = resultBlob();
    const nick = currentNick();
    if (!blob || !nick || saving()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await uploadNewPhoto(nick, blob, albumName);
      setSavedAlbum(albumName || s("tools.img_photos"));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : s("tools.img_save_error"));
    } finally {
      setSaving(false);
    }
  };

  // ── Photo picker ───────────────────────────────────────────────────────────
  const openPicker = async () => {
    setShowPicker(true);
    if (pickerPhotos().length) return;
    const nick = currentNick();
    if (!nick) return;
    setPickerLoading(true);
    try {
      setPickerPhotos(await fetchPhotoSummary(nick));
    } catch {
      // silently fail
    } finally {
      setPickerLoading(false);
    }
  };

  const selectPhoto = async (photo: Photo) => {
    setPickerLoading(true);
    try {
      const res = await fetch(photo.src, { credentials: "include" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = blob.type.split("/")[1] ?? "jpg";
      openFile(new File([blob], `${photo.filename}.${ext}`, { type: blob.type }));
    } catch {
      setPickerLoading(false);
    }
  };

  // ── Shared classes ─────────────────────────────────────────────────────────
  const btnOutline =
    "px-3 py-1.5 text-sm border border-rim rounded-lg text-muted hover:bg-elevated hover:text-txt transition-colors";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Show when={file()}>
        {(f) => (
          <SharedImageEditor
            file={f()}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        )}
      </Show>

      <Show when={!file()}>
        <div class="flex flex-col gap-5 max-w-3xl w-full mx-auto">

          {/* ── Post-edit result ────────────────────────────────────────────── */}
          <Show
            when={resultUrl()}
            fallback={
              /* ── Drop zone / photo picker ─────────────────────────────── */
              <div class="flex flex-col gap-3">
                <label
                  class="flex flex-col items-center justify-center gap-3 h-48 rounded-xl border-2 border-dashed border-rim text-muted cursor-pointer hover:border-rim-strong hover:text-txt transition-colors"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer?.files[0];
                    if (f) openFile(f);
                  }}
                >
                  <MdFillImage class="text-4xl text-muted" aria-hidden="true" />
                  <span class="text-sm">{s("tools.img_drop")}</span>
                  {fileInput(openFile)}
                </label>

                <Show when={currentNick()}>
                  <button
                    onClick={openPicker}
                    class="text-sm text-accent hover:underline self-center"
                  >
                    {s("tools.img_from_photos")}
                  </button>
                </Show>

                <Show when={showPicker()}>
                  <div class="border border-rim rounded-xl p-4 flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-medium text-txt">
                        {s("tools.img_from_photos")}
                      </span>
                      <button
                        onClick={() => setShowPicker(false)}
                        aria-label="Close"
                        class="text-muted hover:text-txt transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                    <Show
                      when={!pickerLoading()}
                      fallback={<p class="text-sm text-muted text-center py-4">{s("tools.img_loading")}</p>}
                    >
                      <Show
                        when={pickerPhotos().length > 0}
                        fallback={<p class="text-sm text-muted text-center py-4">{s("tools.img_no_photos")}</p>}
                      >
                        <div class="grid grid-cols-4 gap-2">
                          <For each={pickerPhotos()}>
                            {(photo) => (
                              <button
                                onClick={() => selectPhoto(photo)}
                                class="aspect-square rounded-lg overflow-hidden bg-elevated hover:ring-2 hover:ring-accent transition-all"
                                title={photo.filename}
                              >
                                <img
                                  src={variantSrc(photo.src, 3)}
                                  alt={photo.filename}
                                  class="w-full h-full object-cover"
                                />
                              </button>
                            )}
                          </For>
                        </div>
                      </Show>
                    </Show>
                  </div>
                </Show>
              </div>
            }
          >
            {(url) => (
              <div class="flex flex-col gap-5">
                {/* Preview */}
                <div class="flex items-center justify-center rounded-xl overflow-hidden bg-elevated">
                  <img src={url()} alt="Edited" class="max-w-full max-h-72 object-contain" />
                </div>

                {/* ── Album browser (logged-in only) ──────────────────────── */}
                <Show when={currentNick()}>
                  <Show
                    when={!savedAlbum()}
                    fallback={
                      <div class="flex items-center gap-2 text-sm text-txt border border-rim rounded-xl px-4 py-3">
                        <MdFillCheck class="text-green-500 shrink-0" />
                        <span>
                          {s("tools.img_saved")}
                          {" "}
                          <strong>{savedAlbum()}</strong>
                        </span>
                      </div>
                    }
                  >
                    <div class="border border-rim rounded-xl overflow-hidden">
                      {/* Header */}
                      <div class="px-4 py-3 border-b border-rim bg-elevated">
                        <h3 class="text-sm font-medium text-txt">
                          {s("tools.img_pick_album")}
                        </h3>
                      </div>

                      {/* Album list */}
                      <div class="max-h-56 overflow-y-auto">
                        <Show
                          when={!albumsLoading()}
                          fallback={
                            <p class="text-sm text-muted text-center py-6">
                              {s("tools.img_loading")}
                            </p>
                          }
                        >
                          <Show when={albums().length > 0}>
                            <For each={albums()}>
                              {(album) => (
                                <button
                                  onClick={() => saveToAlbum(album.album)}
                                  disabled={saving()}
                                  class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-elevated transition-colors text-left disabled:opacity-50 border-b border-rim last:border-0"
                                >
                                  <Show
                                    when={album.thumb}
                                    fallback={
                                      <div class="w-10 h-10 rounded bg-elevated shrink-0 flex items-center justify-center text-muted">
                                        <MdFillFolder class="w-5 h-5" />
                                      </div>
                                    }
                                  >
                                    <img
                                      src={album.thumb!}
                                      alt=""
                                      class="w-10 h-10 rounded object-cover shrink-0"
                                    />
                                  </Show>
                                  <span class="flex-1 min-w-0">
                                    <span class="block text-sm text-txt truncate">{album.album}</span>
                                    <span class="block text-xs text-muted">{album.total}</span>
                                  </span>
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="w-4 h-4 text-muted shrink-0"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                  >
                                    <polyline points="9 18 15 12 9 6" />
                                  </svg>
                                </button>
                              )}
                            </For>
                          </Show>
                        </Show>
                      </div>

                      {/* New album row */}
                      <div class="px-4 py-3 border-t border-rim flex gap-2">
                        <input
                          type="text"
                          placeholder={s("tools.img_new_album_ph")}
                          value={newAlbumName()}
                          onInput={(e) => setNewAlbumName(e.currentTarget.value)}
                          class="flex-1 bg-surface border border-rim text-txt placeholder-muted rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
                        />
                        <button
                          onClick={() => saveToAlbum(newAlbumName().trim())}
                          disabled={saving() || !newAlbumName().trim()}
                          class="px-4 py-1.5 bg-accent text-accent-fg rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
                        >
                          {saving() ? s("tools.img_saving") : s("tools.img_save_to_photos")}
                        </button>
                      </div>

                      <Show when={saveError()}>
                        <p class="text-xs text-red-500 px-4 pb-3">{saveError()}</p>
                      </Show>
                    </div>
                  </Show>
                </Show>

                {/* ── Action buttons ──────────────────────────────────────── */}
                <div class="flex gap-3 flex-wrap">
                  <button
                    onClick={download}
                    class="px-4 py-1.5 bg-accent text-accent-fg rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    {s("tools.img_download")}
                  </button>
                  <button
                    onClick={() => {
                      const blob = resultBlob();
                      if (!blob) return;
                      setFile(new File([blob], "edited.jpg", { type: "image/jpeg" }));
                    }}
                    class={btnOutline}
                  >
                    {s("tools.img_edit_again")}
                  </button>
                  <label class={`${btnOutline} cursor-pointer`}>
                    {s("tools.img_edit_another")}
                    {fileInput(openFile)}
                  </label>
                </div>
              </div>
            )}
          </Show>

        </div>
      </Show>
    </>
  );
}
