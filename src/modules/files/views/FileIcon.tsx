import {
  MdFillFolder,
  MdOutlineImage,
  MdOutlineMovie,
  MdOutlineMusic_note,
  MdOutlineDescription,
  MdOutlineArchive,
  MdOutlineEdit_note,
  MdOutlineAttach_file,
} from "solid-icons/md";
import type { FileMeta } from "../api";

export default function FileIcon(props: { item: FileMeta; class?: string }) {
  const cls = () => props.class ?? "w-5 h-5";
  if (props.item.is_dir) return <MdFillFolder class={cls()} />;
  const ct = props.item.filetype;
  if (ct.startsWith("image/")) return <MdOutlineImage class={cls()} />;
  if (ct.startsWith("video/")) return <MdOutlineMovie class={cls()} />;
  if (ct.startsWith("audio/")) return <MdOutlineMusic_note class={cls()} />;
  if (ct === "application/pdf") return <MdOutlineDescription class={cls()} />;
  if (ct.includes("zip") || ct.includes("tar")) return <MdOutlineArchive class={cls()} />;
  if (ct.startsWith("text/")) return <MdOutlineEdit_note class={cls()} />;
  return <MdOutlineAttach_file class={cls()} />;
}
