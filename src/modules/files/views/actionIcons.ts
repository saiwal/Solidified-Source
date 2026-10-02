import type { JSX } from "solid-js";
import {
  MdFillLock,
  MdOutlineShare,
  MdOutlineDrive_file_rename_outline,
  MdOutlineDrive_file_move,
  MdOutlineLabel,
  MdOutlineDownload,
  MdOutlineDelete,
  MdOutlineEdit_note,
  MdOutlineBookmark_border,
  MdOutlineBookmark,
} from "solid-icons/md";
import type { FileAction } from "../fileActions";

type IconComp = (p: { size?: number }) => JSX.Element;

/** Toolbar icon + label (i18n key) per action. */
export const ACTION_UI: Record<FileAction, { icon: IconComp; label: string }> = {
  share:       { icon: MdOutlineShare,                     label: "share.action" },
  bookmark:    { icon: MdOutlineBookmark_border,           label: "files_mod.bookmark" },
  permissions: { icon: MdFillLock,                         label: "files_mod.menu_permissions" },
  wopiEdit:    { icon: MdOutlineEdit_note,                 label: "files_mod.edit_in_office" },
  rename:      { icon: MdOutlineDrive_file_rename_outline, label: "files_mod.rename" },
  moveCopy:    { icon: MdOutlineDrive_file_move,           label: "files_mod.move_or_copy" },
  categories:  { icon: MdOutlineLabel,                     label: "files_mod.categories" },
  download:    { icon: MdOutlineDownload,                  label: "files_mod.download" },
  delete:      { icon: MdOutlineDelete,                    label: "files_mod.delete" },
};
/** The bookmark action flips to these once the target is bookmarked. */
export const BOOKMARKED_UI = { icon: MdOutlineBookmark as IconComp, label: "files_mod.unbookmark" };
