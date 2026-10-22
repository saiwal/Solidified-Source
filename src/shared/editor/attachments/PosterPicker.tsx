/**
 * Pick a different poster frame for a video attachment after it's uploaded.
 * Plays the local File when we still have it (fresh upload), else the hub copy
 * — same-origin /attach or /cloud, so the canvas isn't tainted.
 */
import { createSignal, onCleanup, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { Modal, ModalPanel } from "@ui/Modal";
import { grabFrame } from "./videoPoster";
import type { Attachment } from "./types";
import { Button } from "@ui/Button";

interface Props {
  attachment: Attachment;
  onPick: (frame: File) => Promise<void>;
  onClose: () => void;
}

const PosterPicker: Component<Props> = (props) => {
  const { t } = useI18n();
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
    <Modal onClose={props.onClose} class="z-[80]">
      <ModalPanel
        title={t("editor.poster_title")}
        onClose={props.onClose}
        size="lg"
        class="flex flex-col text-txt overflow-hidden"
      >
        <div class="flex flex-col gap-3 p-4">
          <video ref={videoEl} src={src} controls playsinline preload="auto" class="w-full max-h-72 rounded-lg bg-black" />
          <p class="text-xs text-muted">{t("editor.poster_hint")}</p>
          <div class="flex flex-wrap justify-end gap-2">
            <Button size="sm" onClick={useFrame} disabled={busy()}>
              {t("editor.poster_use_frame")}
            </Button>
          </div>
        </div>
      </ModalPanel>
    </Modal>
  );
};

export default PosterPicker;
