import { useI18n } from "@utsukta/spa-core/i18n";
import { createMemo, createSignal, For, Show, lazy, type Component } from "solid-js";
import { FOLDER_ICON_PATH, TYPE_ICON_PATH, type ViewMode } from "./MessageList";
import { createFolderCounts, type FolderCount } from "@/modules/inbox/folders";

const FolderMessagesModal = lazy(() => import("./FolderMessagesModal"));

type FolderEntry = Pick<FolderCount, "name" | "count"> & { special?: "starred" };

const SkeletonListRow: Component = () => (
  <div class="px-3.5 py-2 flex items-center gap-2 animate-pulse">
    <div class="w-7 h-7 rounded-lg bg-overlay shrink-0" />
    <div class="h-2.5 bg-overlay rounded w-2/5" />
  </div>
);

const SkeletonTile: Component = () => (
  <div class="flex flex-col items-center gap-1.5 p-2 animate-pulse">
    <div class="w-10 h-10 rounded-lg bg-overlay" />
    <div class="h-2 bg-overlay rounded w-4/5" />
  </div>
);

// Embeddable folder-list panel — file-tag folders plus a pinned "Starred"
// entry backed by the item_starred flag (a separate feed from term-based
// folders, see Folders.php). No outer card chrome and no view-mode toggle:
// the parent (the "Folders" tab in HqMessagesWidget) owns both, rendering
// the toggle (MessageList's FolderViewToggle) in its own tab-bar row.
export default function HqFoldersWidget(props: { viewMode: ViewMode }) {
  const { t } = useI18n();
  const [selectedFolder, setSelectedFolder] = createSignal<FolderEntry | null>(null);
  const [foldersData] = createFolderCounts();

  const entries = createMemo<FolderEntry[]>(() => {
    const d = foldersData();
    const starred: FolderEntry = {
      name: t("hq.msg_tab_starred"),
      count: d?.starredCount ?? 0,
      special: "starred",
    };
    return [starred, ...(d?.folders ?? [])];
  });

  function openFolder(folder: FolderEntry) {
    setSelectedFolder(folder);
  }

  const iconPath = (folder: FolderEntry) =>
    folder.special === "starred" ? TYPE_ICON_PATH.starred : FOLDER_ICON_PATH;
  const iconColor = (folder: FolderEntry) =>
    folder.special === "starred" ? "text-amber-500" : "text-accent/70";

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      {/* ── Body ── */}
      <div class="flex-1 overflow-y-auto pt-1">
        <Show
          when={!foldersData.loading}
          fallback={
            <Show
              when={props.viewMode === "list"}
              fallback={
                <div class="grid grid-cols-3 sm:grid-cols-4 gap-1 p-2">
                  <For each={Array(8)}>{() => <SkeletonTile />}</For>
                </div>
              }
            >
              <For each={Array(5)}>{() => <SkeletonListRow />}</For>
            </Show>
          }
        >
          <Show
            when={props.viewMode === "list"}
            fallback={
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-1 p-2">
                <For each={entries()}>
                  {(folder) => (
                    <button
                      type="button"
                      onClick={() => openFolder(folder)}
                      class="flex flex-col items-center gap-1.5 p-2 rounded-xl
                             hover:bg-overlay transition-colors text-center"
                    >
                      <div class="relative">
                        <svg class={`w-10 h-10 ${iconColor(folder)}`} fill="currentColor" viewBox="0 0 24 24">
                          <path d={iconPath(folder)} />
                        </svg>
                        <Show when={folder.count > 0}>
                          <span
                            class="absolute -top-1 -right-1.5 min-w-[1.1rem] h-4 rounded-full text-[0.5625rem] font-bold
                                   flex items-center justify-center px-1 tabular-nums bg-accent text-surface"
                          >
                            {folder.count}
                          </span>
                        </Show>
                      </div>
                      <span class="text-[0.6875rem] text-txt truncate max-w-full w-full">{folder.name}</span>
                    </button>
                  )}
                </For>
              </div>
            }
          >
            <For each={entries()}>
              {(folder) => (
                <>
                  <button
                    type="button"
                    onClick={() => openFolder(folder)}
                    class="w-full text-left px-3.5 py-2 flex items-center gap-2.5
                           hover:bg-overlay transition-colors"
                  >
                    <svg class={`w-5 h-5 shrink-0 ${iconColor(folder)}`} fill="currentColor" viewBox="0 0 24 24">
                      <path d={iconPath(folder)} />
                    </svg>
                    <span class="flex-1 text-[0.8125rem] text-txt truncate">{folder.name}</span>
                    <Show when={folder.count > 0}>
                      <span class="text-[0.625rem] text-muted tabular-nums shrink-0">{folder.count}</span>
                    </Show>
                  </button>
                  <div class="mx-3.5 h-px bg-rim" />
                </>
              )}
            </For>
          </Show>
        </Show>
      </div>

      <Show when={selectedFolder()}>
        {(folder) => (
          <FolderMessagesModal
            title={folder().name}
            feedType={folder().special === "starred" ? "starred" : "folder"}
            file={folder().special === "starred" ? undefined : folder().name}
            onClose={() => setSelectedFolder(null)}
          />
        )}
      </Show>
    </div>
  );
}
