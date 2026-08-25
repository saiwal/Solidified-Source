import { createSignal, lazy, Show, Suspense } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import ExcalidrawCanvas, { type ExcalidrawExport } from "@/modules/excalidraw/ExcalidrawCanvas";
import { openSceneFromCloud } from "@/modules/excalidraw/scene-io";

const FilePickerModal = lazy(() => import("@/shared/editor/attachments/picker/FilePickerModal"));
const SaveToCloudDialog = lazy(() => import("@/modules/excalidraw/SaveToCloudDialog"));

export function ExcalidrawTool() {
  const { t } = useI18n();
  const [exportApi, setExportApi] = createSignal<ExcalidrawExport>();
  const [saveOpen, setSaveOpen] = createSignal(false);
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [error, setError] = createSignal("");
  const [status, setStatus] = createSignal("");

  async function run(fn: () => Promise<void>) {
    setError("");
    setStatus("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const download = async () => {
    const file = await exportApi()?.toPngFile("drawing.png");
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const btn =
    "border border-rim text-muted hover:bg-elevated hover:text-txt rounded-xl px-5 py-2 text-sm " +
    "transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div class="flex flex-col gap-3 h-[75vh]">
      <div class="flex-1 min-h-0 rounded-xl border border-rim overflow-hidden">
        <ExcalidrawCanvas onReady={setExportApi} />
      </div>
      <Show when={error()}>
        <p class="text-xs text-red-500">{error()}</p>
      </Show>
      <Show when={status()}>
        <p class="text-xs text-muted">{status()}</p>
      </Show>
      <div class="flex items-center justify-end gap-2">
        <button onClick={() => setPickerOpen(true)} class={btn}>
          {t("editor.excalidraw_open")}
        </button>
        <button onClick={() => setSaveOpen(true)} class={btn}>
          {t("editor.excalidraw_save_cloud")}
        </button>
        <button onClick={() => void download()} class={btn}>
          {t("tools.excalidraw_download")}
        </button>
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
    </div>
  );
}
