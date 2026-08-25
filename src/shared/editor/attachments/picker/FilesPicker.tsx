import {
  createEffect,
  createSignal,
  Show,
  For,
  type Component,
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { listFolder } from "@/modules/files/api";
import type { FileMeta } from "@/modules/files/api";
import { useI18n } from "@utsukta/spa-core/i18n";

export type FilesPickerAccept = "files" | "photos" | "both";

interface BreadcrumbEntry {
  name: string;
  hash: string;
  /** Path within the cloud, e.g. "Documents/Invoices" — "" at root. */
  displayPath: string;
}

export interface PickerFolder {
  hash: string;
  displayPath: string;
}

interface Props {
  nick: string;
  accept: FilesPickerAccept;
  selected: () => Set<string>;
  onToggle: (file: FileMeta) => void;
  /** Fired on navigation, for callers picking a destination folder. */
  onFolderChange?: (folder: PickerFolder) => void;
}

const FilesPicker: Component<Props> = (props) => {
  const { t } = useI18n();
  const [crumbs, setCrumbs] = createSignal<BreadcrumbEntry[]>([]);
  const currentHash = () => crumbs()[crumbs().length - 1]?.hash ?? "";
  const currentPath = () => crumbs()[crumbs().length - 1]?.displayPath ?? "";
  createEffect(() =>
    props.onFolderChange?.({ hash: currentHash(), displayPath: currentPath() }),
  );

  const [items] = createQueryResource(
    "files-folder",
    () => ({ nick: props.nick, hash: currentHash() }),
    ({ nick, hash }) => listFolder(nick, hash),
  );

  function enterFolder(folder: FileMeta) {
    setCrumbs((prev) => [
      ...prev,
      { name: folder.filename, hash: folder.hash, displayPath: folder.display_path },
    ]);
  }

  function navToCrumb(idx: number) {
    if (idx < 0) {
      setCrumbs([]);
    } else {
      setCrumbs((prev) => prev.slice(0, idx + 1));
    }
  }

  function isSelectable(file: FileMeta): boolean {
    if (file.is_dir) return false;
    if (props.accept === "photos") return file.is_photo;
    return true;
  }

  const dirs = () => (items() ?? []).filter((f) => f.is_dir);
  const files = () =>
    (items() ?? []).filter((f) => !f.is_dir && isSelectable(f));
  const filtered = () => [...dirs(), ...files()];

  return (
    <div class="flex flex-col h-full min-h-0">
      {/* Breadcrumb */}
      <div class="flex items-center gap-1 pb-3 text-sm flex-wrap">
        <button
          type="button"
          onClick={() => navToCrumb(-1)}
          class={
            "hover:text-txt transition-colors " +
            (crumbs().length === 0 ? "text-txt font-medium" : "text-accent")
          }
        >
          {t("editor.files_root")}
        </button>
        <For each={crumbs()}>
          {(crumb, i) => (
            <>
              <span class="text-muted">/</span>
              <button
                type="button"
                onClick={() => navToCrumb(i())}
                class={
                  "hover:text-txt transition-colors truncate max-w-[120px] " +
                  (i() === crumbs().length - 1
                    ? "text-txt font-medium"
                    : "text-accent")
                }
              >
                {crumb.name}
              </button>
            </>
          )}
        </For>
      </div>

      {/* File listing */}
      <div class="flex-1 overflow-y-auto min-h-0 space-y-0.5">
        <Show
          when={!items.loading}
          fallback={<ListSkeleton count={6} />}
        >
          <Show
            when={filtered().length > 0}
            fallback={<EmptyState label={t("editor.empty_folder")} />}
          >
            <For each={filtered()}>
              {(item) => {
                if (item.is_dir) {
                  return (
                    <button
                      type="button"
                      onClick={() => enterFolder(item)}
                      class="w-full flex items-center gap-3 px-2 py-2 rounded-lg
                             hover:bg-elevated transition-colors text-left group"
                    >
                      <FolderIcon />
                      <span class="flex-1 min-w-0">
                        <span class="text-sm text-txt truncate block">{item.filename}</span>
                      </span>
                      <svg class="w-4 h-4 text-muted group-hover:text-txt transition-colors shrink-0"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                }

                const selected = () => props.selected().has(item.hash);
                return (
                  <button
                    type="button"
                    onClick={() => props.onToggle(item)}
                    class={
                      "w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left " +
                      (selected()
                        ? "bg-accent/10 border border-accent/30"
                        : "hover:bg-elevated border border-transparent")
                    }
                  >
                    <FileTypeIcon filetype={item.filetype} filename={item.filename} isPhoto={item.is_photo} />
                    <span class="flex-1 min-w-0">
                      <span class="text-sm text-txt truncate block">{item.filename}</span>
                      <span class="text-[0.625rem] text-muted">
                        {formatBytes(item.filesize)}
                        {item.edited ? ` · ${new Date(item.edited).toLocaleDateString()}` : ""}
                      </span>
                    </span>
                    <Show when={selected()}>
                      <div class="w-5 h-5 rounded-full bg-accent flex items-center justify-center shrink-0">
                        <svg class="w-3 h-3 text-accent-fg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </Show>
                  </button>
                );
              }}
            </For>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default FilesPicker;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FolderIcon() {
  return (
    <svg class="w-8 h-8 text-yellow-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

function FileTypeIcon(props: { filetype: string; filename: string; isPhoto: boolean }) {
  const color = () => {
    if (props.isPhoto) return "text-blue-400";
    const t = props.filetype.toLowerCase();
    if (t.includes("pdf")) return "text-red-400";
    if (t.includes("word") || t.includes("doc")) return "text-blue-400";
    if (t.includes("sheet") || t.includes("excel") || t.includes("csv")) return "text-green-400";
    if (t.includes("zip") || t.includes("archive")) return "text-yellow-400";
    if (t.includes("audio")) return "text-purple-400";
    if (t.includes("video")) return "text-pink-400";
    return "text-muted";
  };
  const ext = () => props.filename.split(".").pop()?.toUpperCase().slice(0, 4) ?? "";
  return (
    <div class={`w-8 h-8 shrink-0 flex flex-col items-center justify-center ${color()}`}>
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span class="text-[0.5rem] font-mono leading-none -mt-1">{ext()}</span>
    </div>
  );
}

function ListSkeleton(props: { count: number }) {
  return (
    <div class="space-y-1">
      <For each={Array.from({ length: props.count })}>
        {() => (
          <div class="flex items-center gap-3 px-2 py-2">
            <div class="w-8 h-8 rounded bg-elevated animate-pulse shrink-0" />
            <div class="flex-1 space-y-1">
              <div class="h-3 bg-elevated animate-pulse rounded w-3/4" />
              <div class="h-2 bg-elevated animate-pulse rounded w-1/3" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function EmptyState(props: { label: string }) {
  return (
    <div class="flex flex-col items-center justify-center py-12 text-muted">
      <svg class="w-10 h-10 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
      </svg>
      <p class="text-sm">{props.label}</p>
    </div>
  );
}
