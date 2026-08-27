import {
  createSignal,
  createMemo,
  createEffect,
  For,
  Show,
  type Component,
} from "solid-js";
import { useLocation } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import {
  MdFillFolder,
  MdFillAdd,
  MdFillLock,
  MdFillLock_open,
  MdOutlineImage,
  MdOutlineMovie,
  MdOutlineMusic_note,
  MdOutlineDescription,
  MdOutlineArchive,
  MdOutlineEdit_note,
  MdOutlineAttach_file,
} from "solid-icons/md";
import AclPicker, { entryKey, type AclMode, type AclEntry } from "@/shared/editor/components/AclPicker";
import {
  listFolderMeta,
  updatePermissions,
  aclFromPickerKeys,
  uploadFile,
  deleteItem,
  createFolder,
  davDirPath,
  davPath,
} from "../api";
import type { FileMeta, FileAcl } from "../api";
import FileActionsMenu, { type FileAction } from "../views/FileActionsMenu";
import { openShare } from "@utsukta/spa-core/store/share";
import { shareTargetForFile } from "@/shared/lib/shareLinks";
import RenameModal from "../views/RenameModal";
import MoveCopyModal from "../views/MoveCopyModal";
import CategoriesModal from "../views/CategoriesModal";
import FilePreviewModal from "@/shared/views/FilePreviewModal";
import { classifyPreview } from "@utsukta/spa-core/lib/filePreview";

type ModalKind = "rename" | "moveCopy" | "categories";

type ViewMode   = "list" | "grid";
type SortField  = "name" | "size" | "date";
type SortDir    = "asc"  | "desc";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function formatDate(s: string): string {
  if (!s || s.startsWith("0001")) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return s; }
}

function FileIcon(props: { item: FileMeta; class?: string }) {
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

function isPrivate(acl: FileAcl): boolean {
  return acl.allow_gid.length > 0 || acl.allow_cid.length > 0 ||
         acl.deny_gid.length > 0  || acl.deny_cid.length > 0;
}

// ── Nav stack ─────────────────────────────────────────────────────────────────

type FolderFrame = { hash: string; displayPath: string; label: string };

// ── Permissions panel ─────────────────────────────────────────────────────────

const PermissionsPanel: Component<{
  item: FileMeta;
  nick: string;
  onSaved: (updated: FileMeta) => void;
  onClose: () => void;
}> = (props) => {
  const { t } = useI18n();

  const [mode, setMode] = createSignal<AclMode>(
    props.item.acl.allow_cid.length > 0 || props.item.acl.allow_gid.length > 0 ||
    props.item.acl.deny_cid.length > 0  || props.item.acl.deny_gid.length > 0
      ? "custom" : "public"
  );
  const [allowKeys, setAllowKeys] = createSignal<Set<string>>(new Set([
    ...props.item.acl.allow_cid.map((h) => `c:${h}`),
    ...props.item.acl.allow_gid.map((id) => `g:${id}`),
  ]));
  const [denyKeys, setDenyKeys] = createSignal<Set<string>>(new Set([
    ...props.item.acl.deny_cid.map((h) => `c:${h}`),
    ...props.item.acl.deny_gid.map((id) => `g:${id}`),
  ]));
  const [recurse, setRecurse] = createSignal(false);
  const [busy,    setBusy]    = createSignal(false);
  const [err,     setErr]     = createSignal("");

  function toggleEntry(entry: AclEntry, list: "allow" | "deny") {
    const key = entryKey(entry);
    if (list === "allow") {
      setAllowKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
      setDenyKeys((prev)  => { const n = new Set(prev); n.delete(key); return n; });
    } else {
      setDenyKeys((prev)  => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
      setAllowKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  }

  async function save(e: Event) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const updated = await updatePermissions(
        props.nick,
        props.item.hash,
        aclFromPickerKeys(mode(), allowKeys(), denyKeys()),
        recurse()
      );
      props.onSaved(updated);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="mt-1 mb-2 mx-1 rounded-xl border border-rim bg-elevated px-4 py-4 space-y-4">
      <div class="flex items-center justify-between">
        <p class="text-sm font-semibold text-txt">
          {t("files_mod.permissions")} — <span class="font-normal text-muted">{props.item.filename}</span>
        </p>
        <button onClick={props.onClose} class="text-muted hover:text-txt text-lg leading-none">
          ×
        </button>
      </div>

      <AclPicker
        mode={mode()}
        onModeChange={setMode}
        allowEntries={allowKeys()}
        denyEntries={denyKeys()}
        onToggle={toggleEntry}
        onClear={() => { setAllowKeys(new Set<string>()); setDenyKeys(new Set<string>()); }}
      />

      <Show when={props.item.is_dir}>
        <label class="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={recurse()}
            onChange={(e) => setRecurse(e.currentTarget.checked)}
            class="accent-[var(--accent)]"
          />
          {t("files_mod.apply_recursive")}
        </label>
      </Show>

      <Show when={err()}>
        <p class="text-sm text-red-500">{err()}</p>
      </Show>

      <div class="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={busy()}
          class="px-4 py-1.5 rounded-lg bg-accent text-accent-fg text-sm
                 disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {busy() ? t("files_mod.saving") : t("files_mod.save")}
        </button>
        <button
          onClick={props.onClose}
          class="px-4 py-1.5 rounded-lg border border-rim text-sm text-muted
                 hover:bg-overlay transition-colors"
        >
          {t("files_mod.cancel")}
        </button>
      </div>
    </div>
  );
};

// ── File row ──────────────────────────────────────────────────────────────────

const FileRow: Component<{
  item: FileMeta;
  nick: string;
  canWrite: boolean;
  isOwner: boolean;
  onOpen: (item: FileMeta) => void;
  onAction: (action: FileAction, item: FileMeta) => void;
  deleting: boolean;
  permOpen: boolean;
}> = (props) => (
  <div class={`flex items-center gap-3 px-3 py-2.5 rounded-lg group transition-colors ${
    props.permOpen ? "bg-elevated" : "hover:bg-elevated"
  }`}>
    <FileIcon item={props.item} class="w-5 h-5 shrink-0 select-none" />

    <div class="flex-1 min-w-0">
      <button
        onClick={() => props.onOpen(props.item)}
        class={`text-sm font-medium text-left truncate w-full ${
          props.item.is_dir ? "text-accent hover:underline" : "text-txt"
        }`}
      >
        {props.item.filename}
      </button>
    </div>

    {/* ACL badge */}
    <span class={`hidden sm:flex items-center gap-1 text-xs shrink-0 ${
      isPrivate(props.item.acl) ? "text-accent" : "text-muted"
    }`}>
      {isPrivate(props.item.acl)
        ? <><MdFillLock size={11} /> Restricted</>
        : <><MdFillLock_open size={11} /> Public</>
      }
    </span>

    <span class="hidden sm:block text-xs text-muted w-20 text-right shrink-0">
      {props.item.is_dir ? "—" : formatSize(props.item.filesize)}
    </span>

    <span class="hidden md:block text-xs text-muted w-28 text-right shrink-0">
      {formatDate(props.item.created)}
    </span>

    <div class="flex items-center gap-1 shrink-0">
      <FileActionsMenu
        item={props.item}
        nick={props.nick}
        canWrite={props.canWrite}
        isOwner={props.isOwner}
        onAction={props.onAction}
        deleting={props.deleting}
      />
    </div>
  </div>
);

// ── Breadcrumb ────────────────────────────────────────────────────────────────

const Breadcrumb: Component<{
  stack: FolderFrame[];
  onNavigate: (idx: number) => void;
}> = (props) => (
  <nav class="flex items-center gap-1 text-sm flex-wrap min-w-0">
    <For each={props.stack}>
      {(frame, i) => (
        <>
          <Show when={i() > 0}>
            <span class="text-muted shrink-0">/</span>
          </Show>
          <Show
            when={i() < props.stack.length - 1}
            fallback={<span class="font-medium text-txt truncate">{frame.label}</span>}
          >
            <button
              onClick={() => props.onNavigate(i())}
              class="text-accent hover:underline shrink-0"
            >
              {frame.label}
            </button>
          </Show>
        </>
      )}
    </For>
  </nav>
);

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div class="space-y-1 animate-pulse">
      <For each={Array(7).fill(0)}>
        {() => (
          <div class="flex items-center gap-3 px-3 py-2.5">
            <div class="w-6 h-6 rounded bg-overlay shrink-0" />
            <div class="flex-1 h-3.5 bg-overlay rounded" />
            <div class="hidden sm:block w-16 h-3 bg-overlay rounded" />
            <div class="hidden sm:block w-20 h-3 bg-overlay rounded" />
            <div class="hidden md:block w-24 h-3 bg-overlay rounded" />
          </div>
        )}
      </For>
    </div>
  );
}

// ── Thumbnail grid ────────────────────────────────────────────────────────────

const ThumbnailGrid: Component<{
  files: FileMeta[];
  nick: string;
  canWrite: boolean;
  isOwner: boolean;
  deleting: string | null;
  permItem: FileMeta | null;
  onOpen: (item: FileMeta) => void;
  onAction: (action: FileAction, item: FileMeta) => void;
}> = (props) => (
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    <For each={props.files}>
      {(item) => {
        const isImage = () => item.filetype.startsWith("image/");
        const isActive = () => props.permItem?.hash === item.hash;
        return (
          <div
            class={`relative group rounded-xl border overflow-hidden cursor-pointer
                    transition-colors bg-elevated ${
              isActive() ? "border-accent" : "border-rim hover:border-accent/50"
            }`}
            onClick={() => props.onOpen(item)}
          >
            {/* Thumbnail or icon */}
            <div class="aspect-square w-full flex items-center justify-center overflow-hidden bg-overlay">
              <Show
                when={isImage()}
                fallback={
                  <FileIcon item={item} class="w-10 h-10 select-none" />
                }
              >
                <img
                  src={davPath(props.nick, item.display_path)}
                  alt={item.filename}
                  loading="lazy"
                  class="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    (e.currentTarget.nextSibling as HTMLElement | null)?.removeAttribute("style");
                  }}
                />
                {/* fallback shown if img errors */}
                <FileIcon item={item} class="w-10 h-10 select-none hidden" />
              </Show>
            </div>

            {/* Filename bar */}
            <div class="px-2 py-1.5 border-t border-rim/50 bg-elevated">
              <p class="text-xs font-medium text-txt truncate">{item.filename}</p>
              <Show when={!item.is_dir}>
                <p class="text-[0.625rem] text-muted">{formatSize(item.filesize)}</p>
              </Show>
            </div>

            {/* Hover action overlay — pointer-events-none so clicks pass through to card */}
            <div
              class="absolute inset-0 flex items-start justify-end p-1.5 gap-1
                     opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity pointer-events-none"
              onClick={(e) => e.stopPropagation()}
            >
              <FileActionsMenu
                item={item}
                nick={props.nick}
                canWrite={props.canWrite}
                isOwner={props.isOwner}
                onAction={props.onAction}
                deleting={props.deleting === item.hash}
                triggerClass={`p-1 rounded-md backdrop-blur-sm text-xs transition-colors pointer-events-auto ${
                  isActive() ? "bg-accent text-accent-fg" : "bg-surface/80 text-muted hover:text-txt"
                }`}
              />
            </div>

            {/* Private badge */}
            <Show when={isPrivate(item.acl)}>
              <div class="absolute bottom-8 left-1.5 flex items-center gap-0.5
                          bg-surface/80 backdrop-blur-sm text-accent text-[0.5625rem]
                          px-1.5 py-0.5 rounded-full">
                <MdFillLock size={9} />
                Restricted
              </div>
            </Show>
          </div>
        );
      }}
    </For>
  </div>
);

// ── View mode icons ───────────────────────────────────────────────────────────

function ListIcon() {
  return (
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function FilesContentWidget() {
  const nick   = usePageNick();
  const { t }  = useI18n();
  const viewerRole = useViewerRole();
  const isOwner = () => viewerRole() === "owner";

  // Navigation stack — starts at root, unless the URL names a folder.
  // ?folder=<hash>&path=<display_path> is how anything outside this module
  // deep-links into a subfolder (the widget has no path→hash resolver, so the
  // linker passes the hash it already knows). Kept as a one-level jump: the
  // breadcrumb shows root › folder rather than every ancestor.
  const location = useLocation();

  function seedStack(): FolderFrame[] {
    const root = { hash: "", displayPath: "", label: nick() };
    const params = new URLSearchParams(location.search);
    const hash = params.get("folder");
    if (!hash) return [root];
    const path = params.get("path") ?? "";
    const label = path.replace(/\/+$/, "").split("/").pop() || hash;
    return [root, { hash, displayPath: path, label }];
  }

  const [navStack, setNavStack] = createSignal<FolderFrame[]>(seedStack());

  // Same route, different ?folder — the view is not remounted, so re-seed.
  createEffect(() => {
    location.search;
    setNavStack(seedStack());
  });
  const current = createMemo(() => navStack()[navStack().length - 1]);

  // File listing — refetches whenever current folder hash changes
  const [files, { refetch }] = createQueryResource(
    "files-folder",
    () => ({ nick: nick(), hash: current().hash }),
    ({ nick: n, hash }) => listFolderMeta(n, hash)
  );

  // write_storage on the channel being viewed — any observer (local or
  // remote) with the ACL grant, not just the owner.
  const canWrite = () => files()?.canWrite ?? false;

  // Local override for optimistic updates (permissions save)
  const [overrides, setOverrides] = createSignal<Map<string, FileMeta>>(new Map());

  const displayFiles = createMemo(() =>
    (files()?.items ?? []).map((f) => overrides().get(f.hash) ?? f)
  );

  // Sorting
  const [sortField, setSortField] = createSignal<SortField>("name");
  const [sortDir,   setSortDir]   = createSignal<SortDir>("asc");

  function toggleSort(field: SortField) {
    if (sortField() === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedFiles = createMemo(() => {
    const field = sortField();
    const dir   = sortDir();
    return displayFiles().slice().sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let cmp = 0;
      if (field === "name") cmp = a.filename.localeCompare(b.filename);
      else if (field === "size") cmp = a.filesize - b.filesize;
      else cmp = a.created.localeCompare(b.created);
      return dir === "asc" ? cmp : -cmp;
    });
  });

  function navigateInto(item: FileMeta) {
    setNavStack((prev) => [
      ...prev,
      { hash: item.hash, displayPath: item.display_path, label: item.filename },
    ]);
    setPermItem(null);
  }

  function navigateTo(idx: number) {
    setNavStack((prev) => prev.slice(0, idx + 1));
    setPermItem(null);
  }

  // DAV base path for the current folder (upload / mkdir)
  const davBase = createMemo(() => davDirPath(nick(), current().displayPath));

  // New folder
  const [showNewFolder, setShowNewFolder] = createSignal(false);
  const [folderName,    setFolderName]    = createSignal("");
  const [folderBusy,    setFolderBusy]    = createSignal(false);

  // Upload
  const [uploadPct, setUploadPct] = createSignal<number | null>(null);
  const [uploadErr, setUploadErr] = createSignal("");

  // Delete
  const [deleting, setDeleting] = createSignal<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = createSignal<ViewMode>(
    (localStorage.getItem("hz-files-view") as ViewMode) ?? "list"
  );
  function toggleViewMode() {
    const next: ViewMode = viewMode() === "list" ? "grid" : "list";
    setViewMode(next);
    localStorage.setItem("hz-files-view", next);
  }

  // Permissions
  const [permItem, setPermItem] = createSignal<FileMeta | null>(null);

  async function handleDelete(item: FileMeta) {
    const label = item.is_dir ? `folder "${item.filename}"` : `"${item.filename}"`;
    if (!confirm(`Delete ${label}?`)) return;
    setDeleting(item.hash);
    try {
      await deleteItem(nick(), item.display_path);
      refetch();
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    } finally {
      setDeleting(null);
    }
  }

  async function handleCreateFolder(e: Event) {
    e.preventDefault();
    const name = folderName().trim();
    if (!name) return;
    setFolderBusy(true);
    try {
      await createFolder(davBase(), name);
      setFolderName("");
      setShowNewFolder(false);
      refetch();
    } catch (err) {
      toast.error(`Could not create folder: ${(err as Error).message}`);
    } finally {
      setFolderBusy(false);
    }
  }

  async function handleUpload(e: Event) {
    const fileList = (e.currentTarget as HTMLInputElement).files;
    if (!fileList?.length) return;
    setUploadErr("");
    for (const file of Array.from(fileList)) {
      setUploadPct(0);
      try {
        await uploadFile(davBase(), file, setUploadPct);
      } catch (err) {
        setUploadErr(`Upload failed: ${(err as Error).message}`);
      }
    }
    setUploadPct(null);
    refetch();
    (e.currentTarget as HTMLInputElement).value = "";
  }

  function handlePermSaved(updated: FileMeta) {
    setOverrides((prev) => new Map(prev).set(updated.hash, updated));
    setPermItem(null);
  }

  // Kebab menu actions
  const [activeModal, setActiveModal] = createSignal<{ kind: ModalKind; item: FileMeta } | null>(null);
  const [previewItem, setPreviewItem] = createSignal<FileMeta | null>(null);

  function openItem(item: FileMeta) {
    if (item.is_dir) { navigateInto(item); return; }
    if (classifyPreview(item.filetype, item.filename) !== "none") { setPreviewItem(item); return; }
    window.open(davPath(nick(), item.display_path), "_blank");
  }

  function handleMenuAction(action: FileAction, item: FileMeta) {
    if (action === "permissions") {
      setPermItem((prev) => (prev?.hash === item.hash ? null : item));
      return;
    }
    if (action === "delete") {
      handleDelete(item);
      return;
    }
    if (action === "share") {
      openShare(shareTargetForFile(nick(), item));
      return;
    }
    setActiveModal({ kind: action, item });
  }

  function handleRenamed() {
    setActiveModal(null);
    refetch();
  }

  function handleMoved() {
    setActiveModal(null);
    refetch();
  }

  function handleCategoriesSaved() {
    setActiveModal(null);
  }

  return (
    <div class="max-w-3xl mx-auto px-4 md:px-6 pb-6 space-y-4">

      {/* ── Header ── */}
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <Breadcrumb stack={navStack()} onNavigate={navigateTo} />

        <div class="flex items-center gap-2 shrink-0">
          {/* View mode toggle */}
          <button
            onClick={toggleViewMode}
            class="p-1.5 rounded-lg border border-rim text-muted hover:bg-elevated
                   transition-colors"
            title={viewMode() === "list" ? t("files_mod.switch_grid") as string : t("files_mod.switch_list") as string}
          >
            <Show when={viewMode() === "list"} fallback={<ListIcon />}>
              <GridIcon />
            </Show>
          </button>

          {/* Sort control — grid/thumbnail mode */}
          <Show when={viewMode() === "grid"}>
            <div class="flex items-center border border-rim rounded-lg overflow-hidden text-xs">
              {(["name", "size", "date"] as SortField[]).map((field, i) => {
                const label = field === "name"
                  ? t("files_mod.name_col") as string
                  : field === "size"
                    ? t("files_mod.size_col") as string
                    : t("files_mod.created_col") as string;
                return (
                  <button
                    onClick={() => toggleSort(field)}
                    class={`px-2.5 py-1.5 flex items-center gap-0.5 transition-colors ${
                      i > 0 ? "border-l border-rim" : ""
                    } ${
                      sortField() === field
                        ? "bg-accent text-accent-fg"
                        : "text-muted hover:bg-elevated hover:text-txt"
                    }`}
                  >
                    {label}
                    <Show when={sortField() === field}>
                      <span class="text-[0.625rem] leading-none">
                        {sortDir() === "asc" ? "↑" : "↓"}
                      </span>
                    </Show>
                  </button>
                );
              })}
            </div>
          </Show>

          <Show when={canWrite()}>
            <button
              onClick={() => setShowNewFolder((v) => !v)}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rim
                     text-sm text-muted hover:bg-elevated transition-colors"
            >
              <MdFillFolder size={14} />
              {t("files_mod.new_folder")}
            </button>

            <label class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent
                          text-accent-fg text-sm cursor-pointer hover:opacity-90 transition-opacity">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {t("files_mod.upload")}
              <input type="file" multiple class="sr-only" onChange={handleUpload} />
            </label>
          </Show>
        </div>
      </div>

      {/* ── Upload progress ── */}
      <Show when={canWrite() && uploadPct() !== null}>
        <div class="space-y-1">
          <p class="text-xs text-muted">{t("files_mod.uploading")} {uploadPct()}%</p>
          <div class="h-1 w-full bg-overlay rounded-full overflow-hidden">
            <div class="h-full bg-accent transition-all" style={{ width: `${uploadPct()}%` }} />
          </div>
        </div>
      </Show>
      <Show when={canWrite() && uploadErr()}>
        <p class="text-sm text-red-500">{uploadErr()}</p>
      </Show>

      {/* ── New folder form ── */}
      <Show when={canWrite() && showNewFolder()}>
        <form onSubmit={handleCreateFolder} class="flex gap-2">
          <input
            type="text"
            autofocus
            placeholder={t("files_mod.folder_name_placeholder") as string}
            value={folderName()}
            onInput={(e) => setFolderName(e.currentTarget.value)}
            class="flex-1 px-3 py-2 rounded-lg border border-rim bg-surface text-sm text-txt
                   placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={folderBusy() || !folderName().trim()}
            class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-accent-fg
                   text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            <MdFillAdd size={14} />
            {folderBusy() ? t("files_mod.creating") : t("files_mod.create")}
          </button>
          <button
            type="button"
            onClick={() => { setShowNewFolder(false); setFolderName(""); }}
            class="px-3 py-2 rounded-lg border border-rim text-sm text-muted
                   hover:bg-elevated transition-colors"
          >
            {t("files_mod.cancel")}
          </button>
        </form>
      </Show>

      {/* ── Column labels (list mode only) ── */}
      <Show when={viewMode() === "list"}>
        <div class="border-t border-rim" />
        <div class="flex items-center gap-3 px-3 text-[0.625rem] font-semibold uppercase tracking-wide text-muted select-none">
          <span class="w-6 shrink-0" />
          {/* Sortable: Name */}
          <button
            onClick={() => toggleSort("name")}
            class={`flex-1 flex items-center gap-0.5 text-left transition-colors hover:text-txt ${
              sortField() === "name" ? "text-txt" : ""
            }`}
          >
            {t("files_mod.name_col")}
            <Show when={sortField() === "name"}>
              <span class="ml-0.5 text-accent">{sortDir() === "asc" ? "↑" : "↓"}</span>
            </Show>
          </button>
          <span class="hidden sm:block w-20 shrink-0 text-right">{t("files_mod.access_col")}</span>
          {/* Sortable: Size */}
          <button
            onClick={() => toggleSort("size")}
            class={`hidden sm:flex w-20 shrink-0 items-center justify-end gap-0.5 transition-colors hover:text-txt ${
              sortField() === "size" ? "text-txt" : ""
            }`}
          >
            <Show when={sortField() === "size"}>
              <span class="text-accent">{sortDir() === "asc" ? "↑" : "↓"}</span>
            </Show>
            {t("files_mod.size_col")}
          </button>
          {/* Sortable: Created */}
          <button
            onClick={() => toggleSort("date")}
            class={`hidden md:flex w-28 shrink-0 items-center justify-end gap-0.5 transition-colors hover:text-txt ${
              sortField() === "date" ? "text-txt" : ""
            }`}
          >
            <Show when={sortField() === "date"}>
              <span class="text-accent">{sortDir() === "asc" ? "↑" : "↓"}</span>
            </Show>
            {t("files_mod.created_col")}
          </button>
          <span class="w-20 shrink-0" />
        </div>
      </Show>

      {/* ── File list / grid ── */}
      <Show when={!files.loading} fallback={<Skeleton />}>
        <Show
          when={!files.error}
          fallback={
            <div class="py-10 text-center space-y-2">
              <p class="text-sm text-red-500">{t("files_mod.load_failed")}</p>
              <p class="text-xs text-muted">{String(files.error)}</p>
              <button onClick={() => refetch()} class="text-xs text-accent hover:underline">
                {t("files_mod.retry")}
              </button>
            </div>
          }
        >
          <Show
            when={sortedFiles().length > 0}
            fallback={<p class="py-12 text-center text-sm text-muted">{t("files_mod.folder_empty")}</p>}
          >
            <Show
              when={viewMode() === "list"}
              fallback={
                <>
                  <ThumbnailGrid
                    files={sortedFiles()}
                    nick={nick()}
                    canWrite={canWrite()}
                    isOwner={isOwner()}
                    deleting={deleting()}
                    permItem={permItem()}
                    onOpen={openItem}
                    onAction={handleMenuAction}
                  />
                  {/* Permissions panel for grid mode — centered modal */}
                  <Show when={permItem()}>
                    <div
                      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                      onClick={() => setPermItem(null)}
                    >
                      <div class="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                        <PermissionsPanel
                          item={permItem()!}
                          nick={nick()}
                          onSaved={handlePermSaved}
                          onClose={() => setPermItem(null)}
                        />
                      </div>
                    </div>
                  </Show>
                </>
              }
            >
              <div class="space-y-0.5">
                <For each={sortedFiles()}>
                  {(item) => (
                    <>
                      <FileRow
                        item={item}
                        nick={nick()}
                        canWrite={canWrite()}
                        isOwner={isOwner()}
                        onOpen={openItem}
                        onAction={handleMenuAction}
                        deleting={deleting() === item.hash}
                        permOpen={permItem()?.hash === item.hash}
                      />
                      <Show when={permItem()?.hash === item.hash}>
                        <PermissionsPanel
                          item={item}
                          nick={nick()}
                          onSaved={handlePermSaved}
                          onClose={() => setPermItem(null)}
                        />
                      </Show>
                    </>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>

      {/* ── Kebab menu modals ── */}
      <Show when={activeModal()?.kind === "rename"}>
        <RenameModal
          item={activeModal()!.item}
          nick={nick()}
          onRenamed={handleRenamed}
          onClose={() => setActiveModal(null)}
        />
      </Show>
      <Show when={activeModal()?.kind === "moveCopy"}>
        <MoveCopyModal
          item={activeModal()!.item}
          nick={nick()}
          onDone={handleMoved}
          onClose={() => setActiveModal(null)}
        />
      </Show>
      <Show when={activeModal()?.kind === "categories"}>
        <CategoriesModal
          item={activeModal()!.item}
          nick={nick()}
          onSaved={handleCategoriesSaved}
          onClose={() => setActiveModal(null)}
        />
      </Show>

      <Show when={previewItem()}>
        {(item) => (
          <FilePreviewModal
            url={davPath(nick(), item().display_path)}
            filename={item().filename}
            mimetype={item().filetype}
            sizeBytes={item().filesize}
            onClose={() => setPreviewItem(null)}
            onEditSaved={canWrite() ? async (blob) => {
              const edited = new File([blob], item().filename, { type: blob.type });
              await uploadFile(davBase(), edited);
              refetch();
            } : undefined}
          />
        )}
      </Show>

    </div>
  );
}
