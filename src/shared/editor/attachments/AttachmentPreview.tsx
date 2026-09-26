import { createSignal, onCleanup, Show, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import type { Attachment } from "./types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineArticle, MdOutlineClose, MdOutlineWarning_amber } from "solid-icons/md";

interface Props {
  attachment: Attachment;
  onRemove: () => void;
  onInsert?: (bbcode: string) => void;
  onAltTextChange: (text: string) => void;
  /** Opens the poster frame picker — video chips only. */
  onPickPoster?: () => void;
  insertBBCode: (id: string) => string;
}

const AttachmentPreview: Component<Props> = (props) => {
  const { t } = useI18n();
  const a = () => props.attachment;
  const isUploading = () => a().status === "uploading";
  const isError = () => a().status === "error";

  const [altOpen, setAltOpen] = createSignal(false);
  let chipRef: HTMLDivElement | undefined;
  let popoverRef: HTMLDivElement | undefined;

  const popoverStyle = () => {
    if (!chipRef) return "";
    const r = chipRef.getBoundingClientRect();
    const popH = 148;
    const popW = 220;
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= popH + 8 ? r.bottom + 6 : r.top - popH - 6;
    const left = Math.min(r.left, window.innerWidth - popW - 8);
    return `position:fixed;top:${top}px;left:${left}px;width:${popW}px;z-index:9999`;
  };

  function openAlt() {
    setAltOpen(true);
    // Defer listener so the triggering pointerdown doesn't immediately close the popover
    setTimeout(() => {
      function onPointerDown(e: PointerEvent) {
        if (!popoverRef?.contains(e.target as Node)) {
          setAltOpen(false);
          document.removeEventListener("pointerdown", onPointerDown);
        }
      }
      document.addEventListener("pointerdown", onPointerDown);
      // Store cleanup reference so it can be removed if component unmounts
      cleanupPointerDown = () => document.removeEventListener("pointerdown", onPointerDown);
    });
  }

  let cleanupPointerDown: (() => void) | undefined;
  onCleanup(() => cleanupPointerDown?.());

  const hasAlt = () => (a().altText?.trim().length ?? 0) > 0;

  return (
    <div
      ref={chipRef}
      class={
        "relative flex flex-col items-center gap-1 p-1.5 rounded-lg border text-center w-20 shrink-0 " +
        (isError()
          ? "border-red-500/40 bg-red-500/5"
          : "border-rim bg-surface hover:bg-elevated transition-colors")
      }
      title={a().filename}
    >
      {/* Thumbnail or file icon */}
      <div class="w-14 h-14 rounded-md overflow-hidden flex items-center justify-center bg-elevated shrink-0">
        <Show
          when={(() => {
            const src = a().thumbUrl ?? (a().isImage ? a().insertUrl : undefined) ?? a().posterUrl;
            return src ? src : false;
          })()}
          fallback={<FileIcon filename={a().filename} />}
          keyed
        >
          {(src) => (
            <img
              src={src}
              alt={a().altText || a().filename}
              class="w-full h-full object-cover"
            />
          )}
        </Show>

        {/* Upload progress overlay */}
        <Show when={isUploading()}>
          <div class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
            <ProgressRing pct={a().progress} />
          </div>
        </Show>

        {/* Error overlay */}
        <Show when={isError()}>
          <div class="absolute inset-0 flex items-center justify-center rounded-lg bg-red-900/40">
            <MdOutlineWarning_amber class="w-5 h-5 text-red-400" />
          </div>
        </Show>
      </div>

      {/* Filename */}
      <span class="text-[0.625rem] text-muted leading-tight line-clamp-2 w-full break-all">
        {a().filename}
      </span>

      {/* Alt text badge — only for ready images */}
      <Show when={!isUploading() && !isError() && a().isImage}>
        <button
          type="button"
          onClick={openAlt}
          title={hasAlt() ? `Alt: ${a().altText}` : t("editor.add_alt_text")}
          class={
            "text-[0.625rem] px-1.5 py-0.5 rounded w-full truncate transition-colors " +
            (hasAlt()
              ? "bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25"
              : "bg-elevated text-muted hover:text-txt hover:bg-surface border border-rim")
          }
        >
          {hasAlt() ? `ALT ✓` : "ALT"}
        </button>
      </Show>

      {/* Insert button — for ready images, videos, and audio */}
      <Show when={!isUploading() && !isError() && (a().isImage || a().isVideo || a().isAudio) && props.onInsert}>
        <button
          type="button"
          title={t("editor.insert_into_editor")}
          onClick={() => props.onInsert!(props.insertBBCode(a().id))}
          class="text-[0.625rem] px-1.5 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors w-full truncate"
        >
          {t("editor.insert_btn")}
        </button>
      </Show>

      {/* Poster frame — for ready videos */}
      <Show when={!isUploading() && !isError() && a().isVideo && props.onPickPoster}>
        <button
          type="button"
          onClick={() => props.onPickPoster!()}
          class="text-[0.625rem] px-1.5 py-0.5 rounded bg-elevated text-muted hover:text-txt hover:bg-surface border border-rim transition-colors w-full truncate"
        >
          {t("editor.poster_btn")}
        </button>
      </Show>

      {/* Remove button */}
      <button
        type="button"
        title={t("editor.remove_attachment")}
        onClick={props.onRemove}
        class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface border border-rim
               flex items-center justify-center text-muted hover:text-red-400 hover:border-red-400
               transition-colors shadow-sm"
      >
        <MdOutlineClose class="w-2.5 h-2.5" />
      </button>

      {/* Alt text popover */}
      <Show when={altOpen()}>
        <Portal mount={topLayer()}>
          <div
            ref={popoverRef}
            style={popoverStyle()}
            class="bg-surface border border-rim rounded-xl shadow-2xl p-3 flex flex-col gap-2"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-txt">{t("editor.alt_text_label")}</span>
              <button
                type="button"
                onClick={() => setAltOpen(false)}
                class="p-0.5 rounded text-muted hover:text-txt transition-colors"
              >
                <MdOutlineClose class="w-3.5 h-3.5" />
              </button>
            </div>

            <p class="text-[0.6875rem] text-muted leading-snug">
              {t("editor.alt_text_desc")}
            </p>

            <textarea
              rows={3}
              placeholder={t("editor.alt_text_placeholder")}
              value={a().altText ?? ""}
              onInput={(e) => props.onAltTextChange(e.currentTarget.value)}
              autofocus
              class="w-full text-xs rounded-lg border border-rim bg-elevated text-txt
                     placeholder:text-muted/60 p-2 outline-none resize-none
                     focus:border-accent transition-colors"
            />
          </div>
        </Portal>
      </Show>
    </div>
  );
};

export default AttachmentPreview;

// ── Helpers ───────────────────────────────────────────────────────────────────

function FileIcon(props: { filename: string }) {
  const ext = () => props.filename.split(".").pop()?.toLowerCase() ?? "";
  const color = () => {
    const e = ext();
    if (["pdf"].includes(e)) return "text-red-400";
    if (["doc", "docx"].includes(e)) return "text-blue-400";
    if (["xls", "xlsx", "csv"].includes(e)) return "text-green-400";
    if (["zip", "tar", "gz", "7z"].includes(e)) return "text-yellow-400";
    if (["mp3", "ogg", "flac", "wav"].includes(e)) return "text-purple-400";
    if (["mp4", "webm", "mov", "avi"].includes(e)) return "text-pink-400";
    return "text-muted";
  };

  return (
    <div class={`flex flex-col items-center gap-0.5 ${color()}`}>
      <MdOutlineArticle class="w-8 h-8" />
      <span class="text-[0.5625rem] font-mono uppercase">{ext()}</span>
    </div>
  );
}

function ProgressRing(props: { pct: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = () => (props.pct / 100) * circ;

  return (
    <svg width="36" height="36" class="-rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="white" stroke-opacity="0.2" stroke-width="3" />
      <circle
        cx="18" cy="18" r={r}
        fill="none"
        stroke="white"
        stroke-width="3"
        stroke-dasharray={`${dash()} ${circ}`}
        stroke-linecap="round"
      />
    </svg>
  );
}
