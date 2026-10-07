/**
 * DiagramComposerModal.tsx
 * Popup composer for a Mermaid diagram, with live preview. Mirrors
 * LatexComposerModal's two strategies (same EditorCapabilities.latexMode):
 *
 * - "image": renders to PNG and uploads it through wall_attach, so posts,
 *   comments and DMs carry an ordinary hosted image every hub can show. The
 *   toolbar keeps the source in a collapsed block under it.
 * - "live": hands back the source alone; the toolbar inserts a mermaid code
 *   block that hydrateMermaid() renders wherever the page is viewed.
 *
 * The toolbar builds the markup (it knows the body's format); this only
 * returns the source and, in image mode, the uploaded image.
 */
import { createEffect, createSignal, createUniqueId, onCleanup, onMount, Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { wallAttach } from "@/modules/files/api";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import { renderMermaidSvg, renderMermaidToPngFile, unwrapDiagram, DiagramRenderError } from "./renderMermaidImage";
import { MdOutlineClose } from "solid-icons/md";
import Modal from "@/shared/views/Modal";

export interface DiagramInsert {
  source: string;
  img?: { url: string; width: number };
}

interface Props {
  mode: "image" | "live";
  onClose: () => void;
  onInsert: (d: DiagramInsert) => void;
}

const SAMPLE = "flowchart LR\n    A[Start] --> B{OK?}\n    B -->|yes| C[Done]\n    B -->|no| A";

const DiagramComposerModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const [source, setSource] = createSignal("");
  const [busy, setBusy] = createSignal<"" | "rendering" | "uploading">("");
  const [error, setError] = createSignal("");
  const [previewError, setPreviewError] = createSignal("");
  let previewRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  onMount(() => textareaRef?.focus());

  // Debounced: mermaid re-lays-out the whole diagram per call. `run` drops a
  // render that finishes after a newer keystroke started another.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run = 0;
  createEffect(() => {
    const src = unwrapDiagram(source());
    clearTimeout(timer);
    if (!previewRef) return;
    if (!src.trim()) {
      previewRef.textContent = t("editor.diagram_preview_empty");
      setPreviewError("");
      return;
    }
    const mine = ++run;
    timer = setTimeout(() => {
      renderMermaidSvg(src)
        .then((svg) => {
          if (mine !== run || !previewRef) return;
          previewRef.innerHTML = svg; // mermaid's own (strict) sanitiser already ran
          setPreviewError("");
        })
        .catch((err) => {
          if (mine === run) setPreviewError(err instanceof Error ? err.message : String(err));
        });
    }, 300);
  });
  onCleanup(() => clearTimeout(timer));

  async function insert() {
    const src = unwrapDiagram(source());
    if (!src || busy()) return;
    setError("");
    try {
      if (props.mode === "live") {
        await renderMermaidSvg(src); // refuse to insert a diagram that won't render
        props.onInsert({ source: src });
      } else {
        setBusy("rendering");
        const { file, width } = await renderMermaidToPngFile(src);
        setBusy("uploading");
        const res = await wallAttach(currentNick(), file);
        if (!res.isPhoto || !res.src) throw new DiagramRenderError("Upload succeeded but returned no image URL.");
        props.onInsert({ source: src, img: { url: res.src, width } });
      }
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void insert(); }
  }
  document.addEventListener("keydown", onKeyDown);
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const insertLabel = () =>
    busy() === "uploading" ? t("editor.diagram_uploading")
    : busy() === "rendering" ? t("editor.diagram_rendering")
    : t("editor.diagram_insert_btn");

  const titleId = createUniqueId();
  return (
    <Modal onClose={props.onClose} labelledBy={titleId} class="z-[80]">
      <div class="flex flex-col w-full max-w-2xl max-h-[90vh] rounded-xl border border-rim bg-surface shadow-2xl text-txt overflow-hidden">
        <header class="flex items-center justify-between px-4 py-3 border-b border-rim shrink-0">
          <span id={titleId} class="text-sm font-semibold">{t("editor.diagram_modal_title")}</span>
          <button
            type="button"
            onClick={props.onClose}
            class="p-1.5 rounded-md text-muted hover:text-txt hover:bg-elevated transition-colors"
            aria-label={t("layout.close")}
          >
            <MdOutlineClose class="w-4 h-4" />
          </button>
        </header>

        <div class="flex flex-col gap-3 p-4 overflow-y-auto">
          <div>
            <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label for={`${titleId}-src`} class="text-xs font-medium text-muted">
                {t("editor.diagram_source_label")}
              </label>
              <a
                href="https://mermaid.js.org/intro/syntax-reference.html"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-accent hover:underline"
              >
                {t("editor.diagram_syntax_help")}
              </a>
            </div>
            <textarea
              id={`${titleId}-src`}
              ref={textareaRef}
              value={source()}
              onInput={(e) => setSource(e.currentTarget.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={SAMPLE}
              rows={7}
              spellcheck={false}
              class="w-full resize-y rounded-lg border border-rim bg-elevated px-3 py-2 text-sm font-mono
                     text-txt placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
            />
          </div>

          <div>
            <span class="block text-xs font-medium text-muted mb-1">{t("editor.diagram_preview_label")}</span>
            <div class="min-h-24 max-h-80 rounded-lg border border-rim bg-white p-3 overflow-auto flex items-center justify-center">
              <div ref={previewRef} class="text-sm text-gray-500 max-w-full [&_svg]:max-w-full [&_svg]:h-auto" />
            </div>
            <Show when={previewError()}>
              <p class="mt-1 text-xs text-red-500 font-mono whitespace-pre-wrap break-words">{previewError()}</p>
            </Show>
          </div>

          <Show when={error()}>
            <p class="text-xs text-red-500 break-words">{error()}</p>
          </Show>
        </div>

        <footer class="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-rim bg-elevated shrink-0">
          <button
            type="button"
            onClick={props.onClose}
            class="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-txt hover:bg-elevated transition-colors"
          >
            {t("editor.cancel_btn")}
          </button>
          <button
            type="button"
            disabled={!source().trim() || !!busy()}
            onClick={() => void insert()}
            class="px-4 py-1.5 rounded-lg text-sm font-semibold bg-accent text-accent-fg
                   hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {insertLabel()}
          </button>
        </footer>
      </div>
    </Modal>
  );
};

export default DiagramComposerModal;
