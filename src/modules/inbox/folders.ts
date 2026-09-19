// One fetch of /spa/folders?counts=1, shared by the inbox sidebar and HQ's
// Folders tab. They used to each hold their own copy under a different
// TanStack key ("inbox-folders" / "hq-folder-counts"), so opening HQ with the
// folder tab visible ran the same non-trivial count query twice. Same key =
// one request, and one cache entry both invalidate.
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";

export interface FolderCount {
  name: string;
  count: number;
  unread: number;
}

export interface FolderData {
  folders: FolderCount[];
  starredCount: number;
  unread_direct: number;
}

export const EMPTY_FOLDERS: FolderData = {
  folders: [],
  starredCount: 0,
  unread_direct: 0,
};

async function fetchFolderCounts(): Promise<FolderData> {
  const res = await apiFetch("/spa/folders?counts=1");
  if (!res.ok) return EMPTY_FOLDERS;
  const { data, meta } = await res.json();
  return {
    folders: Array.isArray(data) ? data : [],
    starredCount: Number(meta?.starred_count) || 0,
    unread_direct: meta?.unread_direct ?? 0,
  };
}

export const createFolderCounts = () =>
  createQueryResource<FolderData>("inbox-folders", fetchFolderCounts, {
    initialValue: EMPTY_FOLDERS,
  });
