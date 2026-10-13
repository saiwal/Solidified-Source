// What a screenshot or clip produced: a preview, then Download or Share.
// Share uploads the file to the hub (wall_attach, like every other media
// insert) and opens the post composer with it — so recipients see it without
// any access to the Jellyfin server.
import { Show, createSignal, onCleanup } from "solid-js";
import { MdOutlineDownload, MdOutlineShare, MdOutlineClose } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { useAuth, currentNick, isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import Modal from "@/shared/views/Modal";
import PostComposer from "@/shared/editor/composers/PostComposer";
import { bbAlt, bbcodeToInsert } from "@/shared/editor/attachments/insertHelpers";
import { wallAttach } from "@/modules/files/api";
import type { JfItem } from "../api";
import { statusText } from "../share";
import { primaryPill, ghostPill, iconBtn } from "../ui";
import { Motion, pop } from "../anim";

export default function CaptureDialog(props: { file: File; item: JfItem | undefined; onClose: () => void }) {
  const { t } = useI18n();
  const auth = useAuth();
  const url = URL.createObjectURL(props.file);
  onCleanup(() => URL.revokeObjectURL(url));
  const isVideo = () => props.file.type.startsWith("video/");
  const [busy, setBusy] = createSignal(false);
  const [body, setBody] = createSignal<string | null>(null);

  const share = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      const res = await wallAttach(currentNick(), props.file);
      const caption = props.item ? statusText(props.item, t) : "";
      let media: string;
      if (isVideo()) {
        if (!res.src) throw new Error("no video url");
        media = `[zvideo]${res.src}[/zvideo]`; // passes through every format as bbcode
      } else {
        if (!res.isPhoto || !res.src) throw new Error("no image url");
        media = `[img ${bbAlt(props.item?.Name ?? "")}]${res.src}[/img]`;
      }
      setBody(bbcodeToInsert(`${media}\n${caption}`, isFeatureEnabled("markdown") ? "text/markdown" : "text/bbcode"));
    } catch {
      toast.error(t("jellyfin.capture_upload_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Show when={!body()}>
        <Modal onClose={props.onClose} label={isVideo() ? t("jellyfin.clip") : t("jellyfin.screenshot")}
          class="z-[70] flex items-center justify-center p-4 bg-black/40">
          <Motion.div {...pop} class="w-full max-w-2xl space-y-4 p-5 rounded-3xl bg-surface shadow-2xl">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-txt">{isVideo() ? t("jellyfin.clip") : t("jellyfin.screenshot")}</h2>
              <button type="button" class={iconBtn} title={t("jellyfin.close")} onClick={props.onClose}><MdOutlineClose size={20} /></button>
            </div>
            <div class="rounded-2xl overflow-hidden bg-black">
              <Show when={isVideo()} fallback={<img src={url} alt="" class="w-full max-h-[60vh] object-contain" />}>
                <video src={url} controls autoplay loop playsinline class="w-full max-h-[60vh]" />
              </Show>
            </div>
            <p class="text-xs text-muted">{(props.file.size / 1048576).toFixed(1)} MB</p>
            <div class="flex flex-wrap justify-end gap-2">
              <a href={url} download={props.file.name} class={ghostPill}>
                <MdOutlineDownload size={18} /> {t("jellyfin.download")}
              </a>
              <button type="button" class={primaryPill} disabled={busy()} onClick={() => void share()}>
                <MdOutlineShare size={18} /> {busy() ? t("jellyfin.share_preparing") : t("jellyfin.share")}
              </button>
            </div>
          </Motion.div>
        </Modal>
      </Show>
      <Show when={body()}>
        {(b) => (
          <PostComposer open={true} onClose={props.onClose} onPosted={props.onClose}
            profileUid={auth()?.uid ?? 0} initialBody={b()} scopeKey="jellyfin:capture" />
        )}
      </Show>
    </>
  );
}
