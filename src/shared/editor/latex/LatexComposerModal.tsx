/**
 * LatexComposerModal.tsx
 * Popup composer for inserting a LaTeX expression — either inline or as a
 * centered block equation. Two insertion strategies, picked by `mode`:
 *
 * - "image": renders the expression to a PNG and uploads it through the
 *   normal photo pipeline (wall_attach), then inserts a plain [img] tag
 *   pointing at the hosted URL. Used by federated content (posts, comments,
 *   articles, notes) — a raw data: URI or inline SVG is unreliable across
 *   ActivityPub receivers and image proxies, but an ordinary hosted image
 *   works everywhere.
 * - "live": inserts the raw LaTeX wrapped in $…$ / $$…$$, rendered
 *   client-side by hydrateLatex() wherever the page is actually viewed (see
 *   src/shared/lib/hydrateLatex.ts). Used by webpages/wiki, which are read
 *   in-app rather than federated as standalone objects, so a live KaTeX
 *   render beats a static raster image.
 */
import { createEffect, createSignal, onCleanup, onMount, Show, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useI18n } from "@utsukta/spa-core/i18n";
import { wallAttach } from "@/modules/files/api";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import { renderLatexPreview, renderLatexToPngFile, LatexRenderError } from "./renderLatexImage";
import { bbAlt } from "../attachments/insertHelpers";

interface Props {
  mode: "image" | "live";
  onClose: () => void;
  onInsert: (bbcode: string) => void;
}

const LatexComposerModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const [source, setSource] = createSignal("");
  const [displayMode, setDisplayMode] = createSignal(false);
  const [inserting, setInserting] = createSignal(false);
  const [uploading, setUploading] = createSignal(false);
  const [error, setError] = createSignal("");
  let previewRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  onMount(() => textareaRef?.focus());

  // Live preview — uses the app's already-loaded katex.min.css directly, no
  // font inlining needed here (that's only for the exported, standalone image).
  createEffect(() => {
    const src = source();
    const mode = displayMode();
    if (!previewRef) return;
    if (!src.trim()) {
      previewRef.textContent = t("editor.latex_preview_empty");
      previewRef.classList.remove("text-red-500");
      previewRef.classList.add("text-muted");
      return;
    }
    previewRef.classList.remove("text-muted");
    renderLatexPreview(previewRef, src, mode);
  });

  async function insertAsImage() {
    const { file, width } = await renderLatexToPngFile(source(), displayMode());
    setInserting(false);
    setUploading(true);
    const res = await wallAttach(currentNick(), file);
    const url = res.isPhoto && res.src ? res.src : null;
    if (!url) throw new LatexRenderError("Upload succeeded but returned no image URL.");
    const alt = source().trim().replace(/[[\]"\r\n]/g, " ").slice(0, 160);
    // width alone (no height) keeps the raster's aspect ratio — same
    // convention as a hand-resized image (see htmlToSource.ts's img case).
    // Without it the browser displays the PNG at its native (3x, for retina
    // sharpness) pixel size instead of the intended inline size.
    // class='bb-latex-img' (see index.css) overrides Tailwind preflight's
    // `img { display: block }`, which would otherwise both break inline flow
    // with surrounding text and defeat the [center] wrapper's text-align on
    // block equations.
    const img = `[img width='${width}' class='bb-latex-img' ${bbAlt(alt)}]${url}[/img]`;
    return displayMode() ? `\n[center]${img}[/center]\n` : img;
  }

  function insertAsLive() {
    const expr = source().trim();
    return displayMode() ? `\n$$${expr}$$\n` : `$${expr}$`;
  }

  async function insert() {
    if (!source().trim() || inserting()) return;
    setInserting(true);
    setError("");
    try {
      const bbcode = props.mode === "image" ? await insertAsImage() : insertAsLive();
      props.onInsert(bbcode);
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
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void insert(); }
  }
  document.addEventListener("keydown", onKeyDown);
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const insertLabel = () => {
    if (uploading()) return t("editor.latex_uploading");
    if (inserting()) return t("editor.latex_rendering");
    return t("editor.latex_insert_btn");
  };

  return (
    <Portal mount={document.body}>
      <div
        class="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div
          class="flex flex-col w-full max-w-lg rounded-xl border border-rim bg-surface shadow-2xl text-txt overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t("editor.latex_modal_title")}
        >
          <header class="flex items-center justify-between px-4 py-3 border-b border-rim shrink-0">
            <span class="text-sm font-semibold">{t("editor.latex_modal_title")}</span>
            <button
              type="button"
              onClick={props.onClose}
              class="p-1.5 rounded-md text-muted hover:text-txt hover:bg-elevated transition-colors"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div class="flex flex-col gap-3 p-4">
            <div class="flex items-center gap-1 self-start rounded-lg border border-rim p-0.5">
              <button
                type="button"
                onClick={() => setDisplayMode(false)}
                class={
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors " +
                  (!displayMode() ? "bg-accent text-accent-fg" : "text-muted hover:text-txt")
                }
              >
                {t("editor.latex_mode_inline")}
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode(true)}
                class={
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors " +
                  (displayMode() ? "bg-accent text-accent-fg" : "text-muted hover:text-txt")
                }
              >
                {t("editor.latex_mode_block")}
              </button>
            </div>

            <div>
              <label class="block text-xs font-medium text-muted mb-1">
                {t("editor.latex_source_label")}
              </label>
              <textarea
                ref={textareaRef}
                value={source()}
                onInput={(e) => setSource(e.currentTarget.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder={t("editor.latex_source_placeholder")}
                rows={3}
                class="w-full resize-none rounded-lg border border-rim bg-elevated px-3 py-2 text-sm font-mono
                       text-txt placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-muted mb-1">
                {t("editor.latex_preview_label")}
              </label>
              <div class="min-h-16 rounded-lg border border-rim bg-white px-3 py-3 overflow-x-auto flex items-center justify-center">
                <div ref={previewRef} class="text-sm text-black" />
              </div>
            </div>

            <Show when={error()}>
              <p class="text-xs text-red-500">{error()}</p>
            </Show>
          </div>

          <footer class="flex items-center justify-end gap-2 px-4 py-3 border-t border-rim bg-elevated shrink-0">
            <button
              type="button"
              onClick={props.onClose}
              class="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-txt hover:bg-elevated transition-colors"
            >
              {t("editor.cancel_btn")}
            </button>
            <button
              type="button"
              disabled={!source().trim() || inserting()}
              onClick={() => void insert()}
              class="px-4 py-1.5 rounded-lg text-sm font-semibold bg-accent text-accent-fg
                     hover:opacity-90 active:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {insertLabel()}
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
};

export default LatexComposerModal;
