import { createEffect, createResource, createSignal, For, lazy, onCleanup, Show, Suspense, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { marked } from "marked";
import ePub, { type Rendition } from "epubjs";
import { MdFillOpen_in_full, MdFillClose_fullscreen, MdOutlineEdit } from "solid-icons/md";
import { HiOutlineChevronLeft, HiOutlineChevronRight } from "solid-icons/hi";
import { classifyPreview, TEXT_PREVIEW_MAX_BYTES } from "@utsukta/spa-core/lib/filePreview";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { toast } from "@utsukta/spa-core/store/toast";
import { mountPlyr } from "@utsukta/spa-core/lib/usePlyr";

import type { ExcalidrawExport } from "@/modules/excalidraw/ExcalidrawCanvas";

const ImageEditor = lazy(() => import("@/shared/views/ImageEditor"));
const ExcalidrawCanvas = lazy(() => import("@/modules/excalidraw/ExcalidrawCanvas"));
const VideoEditor = lazy(() =>
  import("@/modules/tools/components/VideoEditor").then((m) => ({ default: m.VideoEditor })),
);

interface Props {
  url: string;
  filename: string;
  mimetype: string;
  sizeBytes?: number;
  onClose: () => void;
  /** Image edits only. If provided, the edited blob is handed here to persist (e.g. overwrite in Cloud/Files); otherwise it's offered as a download. */
  onEditSaved?: (blob: Blob) => Promise<void>;
}

async function fetchText(url: string, filename: string): Promise<string> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  // Some routes (e.g. the stream's /attach/{hash} fetched via JS rather than
  // a real navigation) fall back to serving the SPA's own HTML shell instead
  // of the file. A generic "text/*" check wouldn't catch that, since
  // text/html would pass it — reject explicitly, unless an .html/.htm file
  // is genuinely what was attached.
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.startsWith("text/html") && !/\.html?$/i.test(filename)) {
    throw new Error(`server returned "${contentType}" instead of the file`);
  }
  return res.text();
}

function logFetchFailure(kind: string, url: string, err: unknown) {
  // eslint-disable-next-line no-console
  console.error(`FilePreviewModal: ${kind} fetch failed for`, url, err);
}

async function fetchAsFile(url: string, filename: string, mimetype: string): Promise<File> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const blob = await res.blob();
  return new File([blob], filename, { type: mimetype || blob.type });
}

// PDFs from some backend routes (e.g. the stream's /attach/{hash}) come back
// with Content-Disposition: attachment, which makes an <iframe src=url>
// render blank — the browser hijacks the load into a download instead of
// displaying it. A blob: URL carries no HTTP headers at all, so it always
// renders inline regardless of what the origin response said.
async function fetchBlobUrl(url: string, expectedMimePrefix: string): Promise<string> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  // If the route falls back to serving the SPA shell (auth/routing issue,
  // wrong hash, etc.) instead of the actual file, don't hand an HTML
  // document to the iframe — it'll try to boot a second, broken copy of the
  // whole app inside itself. Fail with a clear error instead.
  if (!contentType.toLowerCase().startsWith(expectedMimePrefix)) {
    throw new Error(`server returned "${contentType || "unknown"}" instead of ${expectedMimePrefix}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

async function fetchArrayBuffer(url: string, expectedMimePrefix: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith(expectedMimePrefix)) {
    throw new Error(`server returned "${contentType || "unknown"}" instead of ${expectedMimePrefix}`);
  }
  return res.arrayBuffer();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const FilePreviewModal: Component<Props> = (props) => {
  const kind = () => classifyPreview(props.mimetype, props.filename);
  const tooLarge = () => (props.sizeBytes ?? 0) > TEXT_PREVIEW_MAX_BYTES;
  const isText = () => kind() === "text" || kind() === "markdown";
  const editable = () => kind() === "image" || kind() === "video";
  const [wide, setWide] = createSignal(false);
  const [imgFailed, setImgFailed] = createSignal(false);
  const [editingImage, setEditingImage] = createSignal<File | null>(null);
  const [editingVideo, setEditingVideo] = createSignal<File | null>(null);
  const [savingEdit, setSavingEdit] = createSignal(false);
  const [sceneError, setSceneError] = createSignal("");

  // .excalidraw scenes (and scene-embedded PNGs) render in a read-only canvas
  // rather than downloading as raw JSON.
  async function loadScene(api: ExcalidrawExport) {
    try {
      const res = await fetch(props.url, { credentials: "include" });
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (contentType.startsWith("text/html")) {
        throw new Error(`server returned "${contentType}" instead of the file`);
      }
      await api.loadScene(await res.blob());
    } catch (err) {
      logFetchFailure("excalidraw", props.url, err);
      setSceneError(err instanceof Error ? err.message : String(err));
    }
  }

  const [text] = createResource(
    () => (isText() && !tooLarge() ? props.url : undefined),
    (url) => fetchText(url, props.filename),
  );

  const [pdfBlobUrl] = createResource(
    () => (kind() === "pdf" ? props.url : undefined),
    (url) => fetchBlobUrl(url, "application/pdf"),
  );
  onCleanup(() => { if (pdfBlobUrl.state === "ready") URL.revokeObjectURL(pdfBlobUrl()!); });

  const [epubBuffer] = createResource(
    () => (kind() === "epub" ? props.url : undefined),
    (url) => fetchArrayBuffer(url, "application/epub+zip"),
  );
  let epubContainer: HTMLDivElement | undefined;
  let rendition: Rendition | undefined;
  createEffect(() => {
    const buf = epubBuffer();
    if (!buf || !epubContainer) return;
    const book = ePub(buf);
    rendition = book.renderTo(epubContainer, { width: "100%", height: "100%", flow: "scrolled-doc" });
    // epub.js renders each section into its own iframe document, which can't
    // see the host page's CSS custom properties — resolve them to literal
    // colors here and inject as an epub.js theme instead.
    const hostStyle = getComputedStyle(document.documentElement);
    const cssVar = (name: string) => hostStyle.getPropertyValue(name).trim();
    rendition.themes.default({
      body: { background: `${cssVar("--color-surface")} !important`, color: `${cssVar("--color-txt")} !important` },
      a: { color: `${cssVar("--color-accent")} !important` },
    });
    rendition.display();
    onCleanup(() => { rendition?.destroy(); book.destroy(); rendition = undefined; });
  });

  createEffect(() => { if (text.error) logFetchFailure("text", props.url, text.error); });
  createEffect(() => { if (pdfBlobUrl.error) logFetchFailure("pdf", props.url, pdfBlobUrl.error); });
  createEffect(() => { if (epubBuffer.error) logFetchFailure("epub", props.url, epubBuffer.error); });

  async function openEditor() {
    try {
      const file = await fetchAsFile(props.url, props.filename, props.mimetype);
      if (kind() === "image") setEditingImage(file);
      else if (kind() === "video") setEditingVideo(file);
    } catch {
      toast.error("Could not load file for editing");
    }
  }

  async function handleImageEditConfirm(blob: Blob) {
    setEditingImage(null);
    if (props.onEditSaved) {
      setSavingEdit(true);
      try {
        await props.onEditSaved(blob);
        toast.success("Saved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSavingEdit(false);
      }
      return;
    }
    downloadBlob(blob, props.filename);
  }

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div class={`w-full max-h-[90vh] flex flex-col rounded-xl border border-rim bg-surface shadow-2xl overflow-hidden transition-[max-width] ${
          wide() ? "max-w-[95vw]" : "max-w-4xl"
        }`}>
          <header class="flex items-center justify-between px-4 py-3 border-b border-rim shrink-0">
            <span class="text-sm font-semibold text-txt truncate">{props.filename}</span>
            <div class="flex items-center gap-3 shrink-0 ml-2">
              <Show when={editable()}>
                <button
                  onClick={openEditor}
                  disabled={savingEdit()}
                  title="Edit"
                  class="text-muted hover:text-txt disabled:opacity-50"
                >
                  <MdOutlineEdit size={18} />
                </button>
              </Show>
              <button
                onClick={() => setWide((v) => !v)}
                title={wide() ? "Collapse" : "Expand to full width"}
                class="text-muted hover:text-txt"
              >
                <Show when={wide()} fallback={<MdFillOpen_in_full size={18} />}>
                  <MdFillClose_fullscreen size={18} />
                </Show>
              </button>
              <a
                href={props.url}
                download={props.filename}
                class="text-xs text-muted hover:text-txt underline"
              >
                Download
              </a>
              <button onClick={props.onClose} class="text-muted hover:text-txt text-lg leading-none">
                ×
              </button>
            </div>
          </header>

          <div class="flex-1 min-h-0 overflow-auto p-4">
            <Show when={kind() === "image"}>
              <Show
                when={!imgFailed()}
                fallback={<p class="text-sm text-muted">Image failed to load. Use Download instead.</p>}
              >
                <img
                  src={props.url}
                  alt={props.filename}
                  onError={() => setImgFailed(true)}
                  class="max-h-[80vh] w-full object-contain rounded-lg"
                />
              </Show>
            </Show>

            <Show when={kind() === "pdf"}>
              <Show
                when={pdfBlobUrl.state !== "errored"}
                fallback={
                  <p class="text-sm text-red-500">
                    Couldn't load preview.{" "}
                    <a href={props.url} download={props.filename} class="underline">Download instead</a>
                  </p>
                }
              >
                <Show when={pdfBlobUrl.state === "ready"} fallback={<p class="text-sm text-muted">Loading…</p>}>
                  <iframe src={pdfBlobUrl()!} class="w-full h-[80vh] rounded-lg border border-rim" />
                </Show>
              </Show>
            </Show>

            <Show when={kind() === "epub"}>
              <Show
                when={epubBuffer.state !== "errored"}
                fallback={
                  <p class="text-sm text-red-500">
                    Couldn't load preview.{" "}
                    <a href={props.url} download={props.filename} class="underline">Download instead</a>
                  </p>
                }
              >
                <Show when={epubBuffer.state === "ready"} fallback={<p class="text-sm text-muted">Loading…</p>}>
                  <div class="flex items-center gap-2 h-[80vh]">
                    <button
                      onClick={() => rendition?.prev()}
                      title="Previous page"
                      class="shrink-0 text-muted hover:text-txt"
                    >
                      <HiOutlineChevronLeft size={24} />
                    </button>
                    <div ref={epubContainer} class="flex-1 h-full rounded-lg border border-rim" />
                    <button
                      onClick={() => rendition?.next()}
                      title="Next page"
                      class="shrink-0 text-muted hover:text-txt"
                    >
                      <HiOutlineChevronRight size={24} />
                    </button>
                  </div>
                </Show>
              </Show>
            </Show>

            <Show when={kind() === "excalidraw"}>
              <Show
                when={!sceneError()}
                fallback={
                  <p class="text-sm text-red-500">
                    Couldn't load drawing.{" "}
                    <a href={props.url} download={props.filename} class="underline">Download instead</a>
                  </p>
                }
              >
                <div class="h-[80vh] rounded-lg border border-rim overflow-hidden">
                  <Suspense fallback={<p class="text-sm text-muted p-4">Loading…</p>}>
                    <ExcalidrawCanvas viewMode onReady={(api) => void loadScene(api)} />
                  </Suspense>
                </div>
              </Show>
            </Show>

            <Show when={kind() === "video"}>
              <video
                ref={(el) => onCleanup(mountPlyr(el))}
                src={props.url}
                controls
                preload="none"
                class="max-h-[80vh] w-full rounded-lg"
              />
            </Show>

            <Show when={kind() === "audio"}>
              <audio
                ref={(el) => onCleanup(mountPlyr(el))}
                src={props.url}
                controls
                preload="none"
                class="w-full"
              />
            </Show>

            <Show when={isText()}>
              <Show
                when={!tooLarge()}
                fallback={<p class="text-sm text-muted">File is too large to preview. Use Download instead.</p>}
              >
                <Show
                  when={text.state !== "errored"}
                  fallback={
                    <p class="text-sm text-red-500">
                      Couldn't load preview.{" "}
                      <a href={props.url} download={props.filename} class="underline">Download instead</a>
                    </p>
                  }
                >
                  <Show when={text.state === "ready"} fallback={<p class="text-sm text-muted">Loading…</p>}>
                    <Show
                      when={kind() === "markdown"}
                      fallback={
                        <ol class="text-xs font-mono overflow-auto max-h-[80vh] text-txt list-decimal marker:text-muted/50 pl-8">
                          <For each={text()!.split("\n")}>
                            {(line) => <li class="whitespace-pre-wrap break-all pl-2">{line || " "}</li>}
                          </For>
                        </ol>
                      }
                    >
                      <div
                        class="prose prose-sm dark:prose-invert max-w-none text-txt"
                        innerHTML={sanitizeHtml(marked.parse(text()!) as string)}
                      />
                    </Show>
                  </Show>
                </Show>
              </Show>
            </Show>
          </div>
        </div>
      </div>

      <Show when={editingImage()}>
        {(file) => (
          <Suspense>
            <ImageEditor
              file={file()}
              onConfirm={handleImageEditConfirm}
              onCancel={() => setEditingImage(null)}
            />
          </Suspense>
        )}
      </Show>

      <Show when={editingVideo()}>
        {(file) => (
          <div class="fixed inset-0 z-[1000] flex flex-col bg-surface overflow-y-auto">
            <div class="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-rim bg-surface">
              <button
                type="button"
                onClick={() => setEditingVideo(null)}
                class="flex items-center gap-1.5 text-sm text-muted hover:text-txt transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>
            <div class="p-4">
              <Suspense>
                <VideoEditor initialFile={file()} />
              </Suspense>
            </div>
          </div>
        )}
      </Show>
    </Portal>
  );
};

export default FilePreviewModal;
