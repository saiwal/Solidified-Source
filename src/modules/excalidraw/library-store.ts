/**
 * Persists the Excalidraw shape library as a file in the channel's cloud
 * storage, so a user's library follows them across devices instead of living
 * in one browser. Plugged into <Excalidraw> via useHandleLibrary's adapter.
 */
import { serializeLibraryAsJSON } from "@excalidraw/excalidraw";
import type { LibraryItems } from "@excalidraw/excalidraw/types";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import { createFolder, davDirPath, davPath, uploadFile } from "@/modules/files/api";

const DIR = "Excalidraw";
const FILENAME = "library.excalidrawlib";
const PATH = `${DIR}/${FILENAME}`;

// useHandleLibrary re-reads through the adapter on every save to reconcile,
// so without a cache each shape added costs two DAV round trips.
let cache: LibraryItems | null = null;

async function loadFromCloud(nick: string): Promise<LibraryItems | null> {
  const res = await fetch(davPath(nick, PATH), { credentials: "include" });
  // No library saved yet — or the route fell back to serving the SPA shell.
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.startsWith("text/html")) return null;
  const json = await res.json();
  return (json?.libraryItems ?? json?.library ?? null) as LibraryItems | null;
}

async function saveToCloud(nick: string, items: LibraryItems): Promise<void> {
  try {
    await createFolder(davDirPath(nick, ""), DIR);
  } catch {
    // Already exists (MKCOL 405) — the only failure worth reacting to is the
    // upload below, which reports its own error.
  }
  const json = serializeLibraryAsJSON(items);
  await uploadFile(davDirPath(nick, DIR), new File([json], FILENAME, { type: "application/json" }));
}

export function cloudLibraryAdapter() {
  return {
    async load({ source }: { source: "load" | "save" }) {
      if (source === "save" && cache) return { libraryItems: cache };
      const nick = currentNick();
      if (!nick) return null;
      try {
        const items = await loadFromCloud(nick);
        if (items) cache = items;
        return items ? { libraryItems: items } : null;
      } catch {
        // A failed load must not break the sidebar — treat it as "empty".
        return null;
      }
    },
    async save({ libraryItems }: { libraryItems: LibraryItems }) {
      cache = libraryItems;
      const nick = currentNick();
      if (!nick) return;
      await saveToCloud(nick, libraryItems);
    },
  };
}
