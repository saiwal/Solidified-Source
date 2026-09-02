import { Show, type Component, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";
import {
  MdFillMore_vert,
  MdFillLock,
  MdOutlineShare,
  MdOutlineDrive_file_rename_outline,
  MdOutlineDrive_file_move,
  MdOutlineLabel,
  MdOutlineDownload,
  MdOutlineDelete,
  MdOutlineEdit_note,
} from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { downloadUrl, wopiEditable } from "../api";
import type { FileMeta, WopiConfig } from "../api";

export type FileAction =
  | "permissions" | "share" | "rename" | "moveCopy" | "categories" | "delete" | "wopiEdit";

interface Props {
  item: FileMeta;
  nick: string;
  onAction: (action: FileAction, item: FileMeta) => void;
  /** write_storage grant — gates Rename/Move-Copy/Categories/Delete for any observer holding it, not just the owner. */
  canWrite: boolean;
  /** True ownership — ACL/Permissions changes stay owner-only regardless of write_storage. */
  isOwner: boolean;
  /** WOPI client config from the folder listing; null when the addon is off. */
  wopi: WopiConfig | null;
  deleting?: boolean;
  triggerClass?: string;
}

const FileActionsMenu: Component<Props> = (props) => {
  const { t } = useI18n();
  const { open, setOpen, toggle: toggleOpen, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "bottom-end", offset: 4 });

  function toggle(e: MouseEvent) {
    e.stopPropagation(); // file rows have their own click handler
    toggleOpen();
  }

  function act(action: FileAction) {
    setOpen(false);
    props.onAction(action, props.item);
  }

  return (
    <>
      <button
        type="button"
        ref={setTriggerRef}
        onClick={toggle}
        title={t("files_mod.more_actions") as string}
        class={props.triggerClass ?? "p-1.5 rounded text-muted hover:text-txt hover:bg-overlay transition-colors"}
      >
        <MdFillMore_vert size={14} />
      </button>
      <Portal>
        <Show when={open()}>
          <div
            ref={setPanelRef}
            class="z-[9999] min-w-[11rem] bg-surface border border-rim rounded-lg shadow-lg py-1"
            style={floatStyle()}
          >
            <MenuItem icon={<MdOutlineShare size={14} />} label={t("share.action") as string} onClick={() => act("share")} />
            {/* ACL changes stay owner-only, even with write_storage access */}
            <Show when={props.isOwner}>
              <MenuItem icon={<MdFillLock size={14} />} label={t("files_mod.menu_permissions") as string} onClick={() => act("permissions")} />
            </Show>
            <Show when={props.canWrite}>
              <Show when={wopiEditable(props.wopi, props.item)}>
                <MenuItem icon={<MdOutlineEdit_note size={14} />} label={t("files_mod.edit_in_office") as string} onClick={() => act("wopiEdit")} />
              </Show>
              <MenuItem icon={<MdOutlineDrive_file_rename_outline size={14} />} label={t("files_mod.rename") as string} onClick={() => act("rename")} />
              <MenuItem icon={<MdOutlineDrive_file_move size={14} />} label={t("files_mod.move_or_copy") as string} onClick={() => act("moveCopy")} />
              <MenuItem icon={<MdOutlineLabel size={14} />} label={t("files_mod.categories") as string} onClick={() => act("categories")} />
            </Show>
            <a
              href={downloadUrl(props.nick, props.item.hash)}
              download={props.item.is_dir ? `${props.item.filename}.zip` : props.item.filename}
              class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-overlay transition-colors text-left text-txt"
              onClick={() => setOpen(false)}
            >
              <MdOutlineDownload size={14} />
              <span>{t("files_mod.download")}</span>
            </a>
            <Show when={props.canWrite}>
              <MenuItem
                icon={<MdOutlineDelete size={14} />}
                label={t("files_mod.delete") as string}
                onClick={() => act("delete")}
                disabled={props.deleting}
                danger
              />
            </Show>
          </div>
        </Show>
      </Portal>
    </>
  );
};

export default FileActionsMenu;

function MenuItem(props: { icon: JSX.Element; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      class={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-overlay transition-colors text-left disabled:opacity-40 ${
        props.danger ? "text-red-500" : "text-txt"
      }`}
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}
