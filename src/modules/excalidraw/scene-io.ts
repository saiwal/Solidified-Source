/**
 * Save/open Excalidraw scenes in the channel's cloud storage (WebDAV), reusing
 * the files module's transport. Shared by the Tools whiteboard and the composer.
 */
import {
  davDirPath,
  davPath,
  listFolder,
  updatePermissions,
  uploadFile,
  type FileAcl,
  type FileMeta,
} from "@/modules/files/api";
import type { ExcalidrawExport } from "./ExcalidrawCanvas";

export function defaultSceneName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `drawing-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.excalidraw`;
}

/**
 * Writes the scene into `dir` (a folder's display_path, "" = cloud root) and,
 * when an ACL is given, applies it to the stored file.
 *
 * Returns a warning string when the file saved but its permissions couldn't be
 * applied — a DAV PUT gives back no attach hash, so the ACL step depends on
 * finding the file again by name, which is the part that can fail.
 */
export async function saveSceneToCloud(
  nick: string,
  api: ExcalidrawExport,
  filename: string,
  dir: { hash: string; displayPath: string } = { hash: "", displayPath: "" },
  acl?: Partial<FileAcl>,
): Promise<string | null> {
  const name = filename.endsWith(".excalidraw") ? filename : `${filename}.excalidraw`;
  await uploadFile(davDirPath(nick, dir.displayPath), await api.toSceneFile(name));
  if (!acl) return null;
  try {
    const saved = (await listFolder(nick, dir.hash)).find((f) => f.filename === name);
    if (!saved) return "saved, but the file couldn't be found again to set permissions";
    await updatePermissions(nick, saved.hash, acl);
    return null;
  } catch (err) {
    return `saved, but permissions failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Loads .excalidraw files and PNGs exported with an embedded scene alike. */
export async function openSceneFromCloud(
  nick: string,
  api: ExcalidrawExport,
  file: FileMeta,
): Promise<void> {
  const res = await fetch(davPath(nick, file.display_path), { credentials: "include" });
  if (!res.ok) throw new Error(`Open ${res.status}`);
  await api.loadScene(await res.blob());
}
