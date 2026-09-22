import { type Component } from "solid-js";
import { BiRegularX } from "solid-icons/bi";
import { useI18n } from "@utsukta/spa-core/i18n";
import { FOLDER_ICON_PATH, TYPE_ICON_PATH, MessageList } from "./MessageList";

import Modal from "@/shared/views/Modal";
interface FolderMessagesModalProps {
  title: string;
  feedType: "folder" | "starred";
  file?: string;
  onClose: () => void;
}

const FolderMessagesModal: Component<FolderMessagesModalProps> = (props) => {
  const { t } = useI18n();
  const iconPath = () => (props.feedType === "starred" ? TYPE_ICON_PATH.starred : FOLDER_ICON_PATH);
  const iconColor = () => (props.feedType === "starred" ? "text-amber-500" : "text-muted");

  return (
    <Modal onClose={props.onClose} labelledBy="folder-modal-title" class="z-50">
      <div
        class="relative w-full max-w-full lg:max-w-[50%] max-h-[90svh] flex flex-col
               bg-base rounded-2xl shadow-2xl overflow-hidden focus:outline-none"
      >
        {/* Header */}
        <div class="flex items-center justify-between px-5 py-3 shrink-0 border-b border-rim bg-surface">
          <h2 id="folder-modal-title" class="text-sm font-semibold text-txt flex items-center gap-2 min-w-0">
            <svg class={`w-4 h-4 shrink-0 ${iconColor()}`} fill="currentColor" viewBox="0 0 24 24">
              <path d={iconPath()} />
            </svg>
            <span class="truncate">{props.title}</span>
          </h2>
          <button
            onClick={props.onClose}
            class="p-1.5 rounded-lg hover:bg-elevated
                   text-subtle hover:text-txt transition-colors shrink-0"
            aria-label={t("post.modal_close")}
          >
            <BiRegularX />
          </button>
        </div>

        <div class="min-h-[280px] max-h-[65vh] flex flex-col">
          <MessageList type={props.feedType} file={props.file} />
        </div>
      </div>
    </Modal>
  );
};

export default FolderMessagesModal;
