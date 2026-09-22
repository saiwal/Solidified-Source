import { onCleanup, onMount, type Component } from "solid-js";
import { MdOutlineClose } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";

import Modal from "@/shared/views/Modal";
interface Props {
  /** attach.id — the WOPI file id the `wopi` addon expects at /wopi/:id */
  fileId: number;
  /** Origin of the WOPI client, used to filter incoming postMessages. */
  clientUrl: string;
  onClose: () => void;
}

/**
 * Full-screen WOPI client (Collabora) frame. /wopi/:id is served by the `wopi`
 * addon, which mints an access token and 302s to the client — so the iframe
 * points at our own hub and the redirect happens inside it.
 */
const WopiEditorOverlay: Component<Props> = (props) => {
  const { t } = useI18n();

  onMount(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Collabora posts {MessageId: "UI_Close"} when its own close button is hit
    // (the addon launches it with closebutton=true).
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== props.clientUrl) return;
      try {
        if (JSON.parse(e.data)?.MessageId === "UI_Close") props.onClose();
      } catch {
        /* not ours */
      }
    };
    window.addEventListener("message", onMessage);

    onCleanup(() => {
      window.removeEventListener("message", onMessage);
      document.body.style.overflow = prevOverflow;
    });
  });

  return (
    <Modal onClose={props.onClose} bare label={t("files_mod.edit_in_office") as string}
           class="fixed inset-0 w-full h-full z-[1000] bg-surface">
        <iframe
          src={`/wopi/${props.fileId}`}
          title={t("files_mod.edit_in_office") as string}
          class="w-full h-full border-0"
        />
        <button
          type="button"
          onClick={props.onClose}
          title={t("share.close") as string}
          class="absolute top-2 right-2 p-1.5 rounded-full bg-surface/80 border border-rim text-muted hover:text-txt shadow"
        >
          <MdOutlineClose size={16} />
        </button>
    </Modal>
  );
};

export default WopiEditorOverlay;
