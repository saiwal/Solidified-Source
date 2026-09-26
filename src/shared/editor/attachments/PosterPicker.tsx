/**
 * Pick a different poster frame for a video attachment after it's uploaded.
 * Plays the local File when we still have it (fresh upload), else the hub copy
 * — same-origin /attach or /cloud, so the canvas isn't tainted.
 */
import { createSignal, createUniqueId, onCleanup, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import Modal from "@/shared/views/Modal";
import { MdOutlineClose } from "solid-icons/md";
import { grabFrame } from "./videoPoster";
import type { Attachment } from "./types";

interface Props {
  attachment: Attachment;
  onPick: (frame: File) => Promise<void>;
  onClose: () => void;
}

const PosterPicker: Component<Props> = (props) => {
  const { t } = useI18n();
  const titleId = createUniqueId();
  const [busy, setBusy] = createSignal(false);
  let videoEl: HTMLVideoElement | undefined;

  const file = props.attachment.file;
  const src = file ? URL.createObjectURL(file) : props.attachment.insertUrl;
  if (file) onCleanup(() => URL.revokeObjectURL(src!));

  async function useFrame() {
    if (!videoEl || busy()) return;
    setBusy(true);
    try {
      const base = props.attachment.filename.replace(/\.[^.]+$/, "") || "video";
      const frame = await grabFrame(videoEl, `${base}-poster.jpg`);
      if (!frame) throw new Error("no frame");
      await props.onPick(frame);
      props.onClose();
    } catch {
      toast.error(t("editor.poster_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={props.onClose} labelledBy={titleId} class="z-[80]">
      <div class="flex flex-col w-full max-w-lg rounded-xl border border-rim bg-surface shadow-2xl text-txt overflow-hidden">
        <header class="flex items-center justify-between px-4 py-3 border-b border-rim shrink-0">
          <span id={titleId} class="text-sm font-semibold">{t("editor.poster_title")}</span>
          <button
            type="button"
            onClick={props.onClose}
            aria-label={t("layout.close")}
            class="p-1.5 rounded-md text-muted hover:text-txt hover:bg-elevated transition-colors"
          >
            <MdOutlineClose class="w-4 h-4" />
          </button>
        </header>
        <div class="flex flex-col gap-3 p-4">
          <video ref={videoEl} src={src} controls playsinline preload="auto" class="w-full max-h-72 rounded-lg bg-black" />
          <p class="text-xs text-muted">{t("editor.poster_hint")}</p>
          <div class="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={useFrame}
              disabled={busy()}
              class="px-4 py-1.5 rounded-lg text-sm font-medium bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {t("editor.poster_use_frame")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PosterPicker;
