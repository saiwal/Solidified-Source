/**
 * ExcalidrawComposerModal.tsx
 * Popup composer for inserting an Excalidraw drawing — draw, export the
 * canvas to a PNG, upload through the normal photo pipeline (wall_attach,
 * same as LatexComposerModal's "image" mode), then insert a plain [img] tag
 * pointing at the hosted URL.
 */
import { createSignal, lazy, onCleanup, Show, Suspense, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useI18n } from "@utsukta/spa-core/i18n";
import { wallAttach } from "@/modules/files/api";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import ExcalidrawCanvas, { type ExcalidrawExport } from "@/modules/excalidraw/ExcalidrawCanvas";
import { bbAlt } from "../attachments/insertHelpers";
import { defaultSceneName, openSceneFromCloud } from "@/modules/excalidraw/scene-io";

const FilePickerModal = lazy(() => import("../attachments/picker/FilePickerModal"));
const SaveToCloudDialog = lazy(() => import("@/modules/excalidraw/SaveToCloudDialog"));

interface Props {
  onClose: () => void;
  onInsert: (bbcode: string) => void;
}

const ExcalidrawComposerModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const [exportApi, setExportApi] = createSignal<ExcalidrawExport>();
  const [inserting, setInserting] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [maximized, setMaximized] = createSignal(false);
  const [saveOpen, setSaveOpen] = createSignal(false);
  const [status, setStatus] = createSignal("");
  const [pickerOpen, setPickerOpen] = createSignal(false);

  async function run(fn: () => Promise<void>) {
    setError("");
    setStatus("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }


  // "image" posts a flat PNG (with the scene embedded, so it stays editable);
  // "file" posts the .excalidraw scene itself as a downloadable attachment.
  async function insert(mode: "image" | "file") {
    const api = exportApi();
    if (!api || inserting() || uploading()) return;
    setInserting(true);
    setError("");
    try {
      const file =
        mode === "image"
          ? await api.toPngFile("excalidraw.png")
          : await api.toSceneFile(defaultSceneName());
      setInserting(false);
      setUploading(true);
      const res = await wallAttach(currentNick(), file);
      if (mode === "image") {
        const url = res.isPhoto && res.src ? res.src : null;
        if (!url) throw new Error("Upload succeeded but returned no image URL.");
        props.onInsert(`[img ${bbAlt("Excalidraw drawing")}]${url}[/img]`);
      } else {
        props.onInsert(`[attachment]${res.hash},${res.revision}[/attachment]`);
      }
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInserting(false);
      setUploading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") { props.onClose(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void insert("image"); }
  }
  document.addEventListener("keydown", onKeyDown);
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const insertLabel = () => {
    if (uploading()) return t("editor.excalidraw_uploading");
    if (inserting()) return t("editor.excalidraw_rendering");
    return t("editor.excalidraw_insert_btn");
  };

  return (
    <Portal mount={document.body}>
      <div
        class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60"
        classList={{ "p-4": !maximized() }}
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div
          class="flex flex-col w-full rounded-xl border border-rim bg-surface shadow-2xl text-txt overflow-hidden transition-all"
          classList={
            maximized()
              ? { "max-w-none": true, "h-full": true, "rounded-none": true }
              : { "max-w-3xl": true, "h-[80vh]": true }
          }
          role="dialog"
          aria-modal="true"
          aria-label={t("editor.excalidraw_modal_title")}
        >
          <header class="flex items-center justify-between px-4 py-3 border-b border-rim shrink-0">
            <span class="text-sm font-semibold">{t("editor.excalidraw_modal_title")}</span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMaximized((v) => !v)}
                title={maximized() ? t("editor.excalidraw_restore") : t("editor.excalidraw_maximize")}
                class="p-1.5 rounded-md text-muted hover:text-txt hover:bg-elevated transition-colors"
              >
                <Show
                  when={!maximized()}
                  fallback={
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 4v4a1 1 0 0 1-1 1H4M15 4v4a1 1 0 0 0 1 1h4M9 20v-4a1 1 0 0 0-1-1H4M15 20v-4a1 1 0 0 1 1-1h4" />
                    </svg>
                  }
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
                  </svg>
                </Show>
              </button>
              <button
                type="button"
                onClick={props.onClose}
                class="p-1.5 rounded-md text-muted hover:text-txt hover:bg-elevated transition-colors"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          <div class="flex-1 min-h-0 p-4">
            <ExcalidrawCanvas minimal onReady={setExportApi} />
          </div>

          <Show when={error()}>
            <p class="px-4 text-xs text-red-500">{error()}</p>
          </Show>
          <Show when={status()}>
            <p class="px-4 text-xs text-muted">{status()}</p>
          </Show>

          <footer class="flex items-center gap-2 px-4 py-3 border-t border-rim bg-elevated shrink-0">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              class="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-txt hover:bg-surface transition-colors"
            >
              {t("editor.excalidraw_open")}
            </button>
            <button
              type="button"
              onClick={() => setSaveOpen(true)}
              class="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-txt hover:bg-surface transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("editor.excalidraw_save_cloud")}
            </button>
            <div class="flex-1" />
            <button
              type="button"
              onClick={props.onClose}
              class="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-txt hover:bg-elevated transition-colors"
            >
              {t("editor.cancel_btn")}
            </button>
            <button
              type="button"
              disabled={inserting() || uploading()}
              onClick={() => void insert("file")}
              class="px-3 py-1.5 rounded-lg text-sm border border-rim text-muted hover:text-txt hover:bg-surface
                     transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("editor.excalidraw_insert_file_btn")}
            </button>
            <button
              type="button"
              disabled={inserting() || uploading()}
              onClick={() => void insert("image")}
              class="px-4 py-1.5 rounded-lg text-sm font-semibold bg-accent text-accent-fg
                     hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {insertLabel()}
            </button>
          </footer>
        </div>
      </div>

      <Show when={saveOpen() && exportApi()}>
        <Suspense>
          <SaveToCloudDialog
            nick={currentNick()}
            api={exportApi()!}
            onClose={() => setSaveOpen(false)}
            onSaved={(warning) => {
              setError(warning ?? "");
              if (!warning) setStatus(t("editor.excalidraw_saved"));
            }}
          />
        </Suspense>
      </Show>

      <Show when={pickerOpen()}>
        <Suspense>
          <FilePickerModal
            nick={currentNick()}
            accept="files"
            onClose={() => setPickerOpen(false)}
            onSelectPhotos={() => setPickerOpen(false)}
            onSelectFiles={(files) => {
              setPickerOpen(false);
              const api = exportApi();
              const f = files[0];
              if (!api || !f) return;
              void run(() => openSceneFromCloud(currentNick(), api, f));
            }}
          />
        </Suspense>
      </Show>
    </Portal>
  );
};

export default ExcalidrawComposerModal;
