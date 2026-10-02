import {
  createSignal,
  createMemo,
  createEffect,
  untrack,
  on,
  For,
  Show,
  type Component,
  type JSX,
} from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useQueryClient } from "@tanstack/solid-query";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import {
  MdFillAdd,
  MdFillLock,
  MdFillLock_open,
  MdOutlineArrow_back,
  MdOutlineArrow_forward,
  MdOutlineRefresh,
  MdOutlineFilter_list,
  MdOutlineClose,
  MdOutlineCreate_new_folder,
  MdOutlineUpload_file,
  MdOutlineSort_by_alpha,
  MdOutlineStorage,
  MdOutlineSchedule,
  MdOutlineGrid_view,
  MdOutlineView_list,
  MdOutlineCheck_box,
  MdOutlineIndeterminate_check_box,
} from "solid-icons/md";
import AclPicker, { entryKey, aclModeFrom, aclEntryKeys, aclIsRestricted, fetchAclNames, type AclMode, type AclEntry } from "@/shared/editor/components/AclPicker";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import {
  listFolderMeta,
  fetchFileMeta,
  downloadItems,
  parentPath,
  updatePermissions,
  aclFromPickerKeys,
  uploadFile,
  deleteItem,
  createFolder,
  davDirPath,
  davPath,
  cloudPath,
  cloudPathSegments,
  resolveFolderPath,
} from "../api";
import type { FileMeta, FileAcl, FolderFrame } from "../api";
import { ACTION_UI, BOOKMARKED_UI } from "../views/actionIcons";
import { FILE_ACTIONS, actionShown, actionEnabled, type FileAction } from "../fileActions";
import { isLocalUser } from "@utsukta/spa-core/store/auth-store";
import FileIcon from "../views/FileIcon";
import FolderTree from "../views/FolderTree";
import { useCloudBookmarks } from "../bookmarks";
import { openShare } from "@utsukta/spa-core/store/share";
import { shareTargetForFile } from "@/shared/lib/shareLinks";
import RenameModal from "../views/RenameModal";
import MoveCopyModal from "../views/MoveCopyModal";
import CategoriesModal from "../views/CategoriesModal";
import FilePreviewModal from "@/shared/views/FilePreviewModal";
import WopiEditorOverlay from "@/shared/views/WopiEditorOverlay";
import { classifyPreview } from "@utsukta/spa-core/lib/filePreview";
import { persistedSignal, oneOf } from "@utsukta/spa-core/lib/persisted";

import Modal from "@/shared/views/Modal";
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

// The i18n key naming what an ACL actually grants, rather than a flat
// "Restricted" that lumps "Only me" in with "everyone I follow".
const ACL_LABEL_KEY = {
  public:      "editor.acl_public",
  connections: "editor.acl_connections",
  me:          "editor.acl_me",
  custom:      "editor.acl_custom",
} as const satisfies Record<AclMode, string>;

/** Just the words — for use inside an existing badge chrome. */
const AclLabel: Component<{
  acl: FileAcl;
  defaultAcl: FileAcl;
  selfHash: string | undefined;
}> = (props) => {
  const { t } = useI18n();
  return <>{t(ACL_LABEL_KEY[aclModeFrom(props.acl, props.selfHash, props.defaultAcl)])}</>;
};

/** Icon + label for the file-list ACL column. */
const AclBadge: Component<{
  acl: FileAcl;
  defaultAcl: FileAcl;
  selfHash: string | undefined;
}> = (props) => {
  const restricted = () => aclIsRestricted(props.acl);
  return (
    <span class={`hidden sm:flex items-center gap-1 text-xs shrink-0 ${
      restricted() ? "text-accent" : "text-muted"
    }`}>
      {restricted() ? <MdFillLock size={11} /> : <MdFillLock_open size={11} />}
      <AclLabel acl={props.acl} defaultAcl={props.defaultAcl} selfHash={props.selfHash} />
    </span>
  );
};

// ── Nav stack ─────────────────────────────────────────────────────────────────

// ── Permissions panel ─────────────────────────────────────────────────────────

const PermissionsPanel: Component<{
  /** One item, or a selection — saved item by item. */
  items: FileMeta[];
  nick: string;
  defaultAcl: FileAcl;
  /** Called once anything saved; `failed` are the items the server refused. */
  onSaved: (updated: FileMeta[], failed: FileMeta[]) => void;
  onClose: () => void;
}> = (props) => {
  const { t } = useI18n();

  // A selection whose ACLs differ starts from "Only me", not from whichever
  // item happens to be first — saving by accident then narrows, never widens.
  const sameAcl = (a: FileAcl, b: FileAcl) =>
    (["allow_cid", "allow_gid", "deny_cid", "deny_gid"] as const)
      .every((k) => [...a[k]].sort().join() === [...b[k]].sort().join());
  const mixed = props.items.some((f) => !sameAcl(f.acl, props.items[0].acl));
  const first = props.items[0];

  // "Only me" is stored as allow_cid = [the owner's own hash], so the viewer's
  // hash is what separates it from a one-contact custom ACL.
  const selfHash = useNavViewer();
  const initialMode: AclMode = mixed ? "me" : aclModeFrom(first.acl, selfHash()?.hash, props.defaultAcl);
  const initialKeys = mixed
    ? { allow: new Set<string>(), deny: new Set<string>() }
    : aclEntryKeys(first.acl, initialMode);
  const [mode, setMode] = createSignal<AclMode>(initialMode);
  const [allowKeys, setAllowKeys] = createSignal<Set<string>>(initialKeys.allow);
  const [denyKeys, setDenyKeys] = createSignal<Set<string>>(initialKeys.deny);

  // Resolve the stored contact hashes to names. Without this every chip falls
  // back to a truncated hash (AclPicker's key fallback) — two of those look
  // like the same entry twice.
  const [seed] = createQueryResource(
    "acl-names",
    () => (mixed ? "" : [...first.acl.allow_cid, ...first.acl.deny_cid].join(",")) || null,
    (csv: string) => fetchAclNames(csv.split(",")),
  );
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
    const acl = aclFromPickerKeys(mode(), allowKeys(), denyKeys());
    const updated: FileMeta[] = [];
    const failed: FileMeta[] = [];
    let lastErr = "";
    for (const item of props.items) {
      try {
        // Recursion only means something on a folder.
        updated.push(await updatePermissions(props.nick, item.hash, acl, recurse() && item.is_dir));
      } catch (e) {
        failed.push(item);
        lastErr = (e as Error).message;
      }
    }
    setBusy(false);
    // Nothing saved: stay open with the error, as a single item always did.
    if (!updated.length) { setErr(lastErr); return; }
    props.onSaved(updated, failed);
  }

  return (
    <div class="mt-1 mb-2 mx-1 rounded-xl border border-rim bg-elevated px-4 py-4 space-y-4">
      <div class="flex items-center justify-between">
        <p class="text-sm font-semibold text-txt">
          {t("files_mod.permissions")} — <span class="font-normal text-muted">{
            props.items.length > 1
              ? t("files_mod.selected_count", { count: props.items.length })
              : first.filename
          }</span>
        </p>
        <button onClick={props.onClose} class="text-muted hover:text-txt text-lg leading-none" aria-label={t("layout.close")}>
          ×
        </button>
      </div>

      <Show when={mixed}>
        <p class="text-xs text-muted">{t("files_mod.perm_mixed")}</p>
      </Show>

      <AclPicker
        mode={mode()}
        onModeChange={setMode}
        allowEntries={allowKeys()}
        denyEntries={denyKeys()}
        seedEntries={seed()}
        onToggle={toggleEntry}
        onClear={() => { setAllowKeys(new Set<string>()); setDenyKeys(new Set<string>()); }}
      />

      <Show when={props.items.some((f) => f.is_dir)}>
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

// ── Selection checkbox ────────────────────────────────────────────────────────

/**
 * Shared by the list row, the grid tile and the select-all header. Stops
 * propagation because both the row and the tile are themselves click targets
 * that would otherwise open the file.
 */
const SelectBox: Component<{
  checked: boolean;
  onToggle: () => void;
  label: string;
  class?: string;
}> = (props) => (
  <input
    type="checkbox"
    checked={props.checked}
    aria-label={props.label}
    title={props.label}
    onClick={(e) => e.stopPropagation()}
    onChange={props.onToggle}
    class={`w-4 h-4 shrink-0 accent-accent cursor-pointer ${props.class ?? ""}`}
  />
);

// ── File row ──────────────────────────────────────────────────────────────────

const FileRow: Component<{
  item: FileMeta;
  nick: string;
  defaultAcl: FileAcl;
  selfHash: string | undefined;
  onOpen: (item: FileMeta) => void;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
}> = (props) => {
  const { t } = useI18n();
  return (
  <div class={`flex items-center gap-3 px-3 py-2.5 rounded-lg group transition-colors ${
    props.selected ? "bg-accent/10" : "hover:bg-elevated"
  }`}>
    <Show when={props.selectable} fallback={<span class="w-4 shrink-0" />}>
      <SelectBox
        checked={props.selected}
        onToggle={props.onSelect}
        label={t("files_mod.select_item", { name: props.item.filename }) as string}
      />
    </Show>

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

    {/* ACL badge — names the actual audience, not just "restricted or not" */}
    <AclBadge acl={props.item.acl} defaultAcl={props.defaultAcl} selfHash={props.selfHash} />

    <span class="hidden sm:block text-xs text-muted w-20 text-right shrink-0">
      {props.item.is_dir ? "—" : formatSize(props.item.filesize)}
    </span>

    <span class="hidden md:block text-xs text-muted w-28 text-right shrink-0">
      {formatDate(props.item.created)}
    </span>

  </div>
  );
};

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
  defaultAcl: FileAcl;
  selfHash: string | undefined;
  onOpen: (item: FileMeta) => void;
  selectable: boolean;
  selected: Set<string>;
  onSelect: (hash: string) => void;
}> = (props) => {
  const { t } = useI18n();
  return (
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    <For each={props.files}>
      {(item) => {
        const isImage = () => item.filetype.startsWith("image/");
        const isSelected = () => props.selected.has(item.hash);
        return (
          <div
            class={`relative group rounded-xl border overflow-hidden cursor-pointer
                    transition-colors bg-elevated ${
              isSelected()
                ? "border-accent ring-2 ring-accent/40"
                : "border-rim hover:border-accent/50"
            }`}
            onClick={() => props.onOpen(item)}
          >
            {/* Selection checkbox — always visible once anything is selected,
                otherwise it appears on hover so it doesn't clutter the grid. */}
            <Show when={props.selectable}>
              <div class={`absolute top-1.5 left-1.5 z-10 transition-opacity ${
                isSelected() || props.selected.size > 0
                  ? "opacity-100"
                  : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
              }`}>
                <SelectBox
                  checked={isSelected()}
                  onToggle={() => props.onSelect(item.hash)}
                  label={t("files_mod.select_item", { name: item.filename }) as string}
                  class="bg-surface/90 rounded"
                />
              </div>
            </Show>
            {/* Thumbnail or icon */}
            <div class="aspect-square w-full flex items-center justify-center overflow-hidden bg-overlay">
              <Show
                when={isImage()}
                fallback={
                  <FileIcon item={item} class="w-10 h-10 select-none" />
                }
              >
                <img
                  src={item.thumb ?? davPath(props.nick, item.display_path)}
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

            {/* Private badge — only for restricted files; public needs no mark */}
            <Show when={aclIsRestricted(item.acl)}>
              <div class="absolute bottom-8 left-1.5 flex items-center gap-0.5
                          bg-surface/80 backdrop-blur-sm text-accent text-[0.5625rem]
                          px-1.5 py-0.5 rounded-full">
                <MdFillLock size={9} />
                <AclLabel acl={item.acl} defaultAcl={props.defaultAcl} selfHash={props.selfHash} />
              </div>
            </Show>
          </div>
        );
      }}
    </For>
  </div>
  );
};

// ── Toolbar ───────────────────────────────────────────────────────────────────

// Buttons are never boxed in groups: a group can't wrap, so on a narrow
// screen it clipped its own buttons. Each one stands alone and the row wraps.
const GROUP = "contents";

/** Every toolbar control: icon only, label as tooltip + accessible name. */
function ToolButton(props: { label: string; active?: boolean; danger?: boolean; disabled?: boolean; onClick: () => void; children: JSX.Element }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      onClick={props.onClick}
      class={`p-1.5 rounded-lg transition-colors disabled:opacity-40
              ${props.active ? "bg-accent text-accent-fg"
                : props.danger ? "bg-elevated text-muted hover:bg-red-500/15 hover:text-red-500"
                : "bg-elevated text-muted hover:bg-accent/15 hover:text-txt"}`}
    >
      {props.children}
    </button>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function FilesContentWidget() {
  const nick   = usePageNick();
  const { t }  = useI18n();
  const viewerRole = useViewerRole();
  const isOwner = () => viewerRole() === "owner";

  // Navigation stack — the folder path in the URL (/cloud/:nick/tmp/folder 2)
  // is the source of truth, so a shared link, an attachment link or the back
  // button all land on the right folder. In-app navigation keeps the stack
  // (hashes already known) and pushes the matching URL; the effect below only
  // resolves when the URL names a folder we are not already showing.
  const location = useLocation();
  const navigate = useNavigate();

  const rootFrame = (): FolderFrame => ({ hash: "", displayPath: "", label: nick() });
  const [navStack, setNavStack] = createSignal<FolderFrame[]>([rootFrame()]);

  const current = createMemo(() => navStack()[navStack().length - 1]);

  // Tracks the URL only: if it also tracked current(), an in-app stack change
  // would re-run this against the not-yet-updated URL and resolve the *old*
  // folder back in. `resolveSeq` drops resolves overtaken by a newer URL.
  let resolveSeq = 0;
  createEffect(() => {
    const segs = cloudPathSegments(location.pathname, nick());
    const seq = ++resolveSeq;
    if (segs.join("/") === untrack(current).displayPath) return; // our own navigate()
    if (!segs.length) { setNavStack([rootFrame()]); return; }
    resolveFolderPath(nick(), segs).then(({ frames, file }) => {
      if (seq !== resolveSeq) return;
      setNavStack([rootFrame(), ...frames]);
      // A file URL (e.g. a bookmark) previews it. Never window.open() here —
      // outside a click it is popup-blocked, so other files just show in place.
      if (file && classifyPreview(file.filetype, file.filename) !== "none") setPreviewItem(file);
    });
  });

  // File listing — refetches whenever current folder hash changes
  const [files] = createQueryResource(
    "files-folder",
    () => ({ nick: nick(), hash: current().hash }),
    ({ nick: n, hash }) => listFolderMeta(n, hash)
  );

  // View filter: narrows the open folder by name. Cleared on folder change.
  const [query, setQuery] = createSignal("");
  const [filterOpen, setFilterOpen] = createSignal(false);
  createEffect(on(() => current().hash, () => setQuery(""), { defer: true }));

  // Mutations call this. Every cached listing, not just this folder's: the
  // tree shows other folders (a rename/move changes the parent's listing),
  // and the open folder's own row and the tree search go stale the same way.
  const queryClient = useQueryClient();
  const refetch = () => {
    for (const key of ["files-folder", "files-meta", "files-search"])
      queryClient.invalidateQueries({ queryKey: [key] });
  };

  // write_storage on the channel being viewed — any observer (local or
  // remote) with the ACL grant, not just the owner.
  const canWrite = () => files()?.canWrite ?? false;
  const wopi = () => files()?.wopi ?? null;

  // What scope "contacts" writes for this channel, and the viewer's own hash —
  // together they turn a stored ACL back into the mode the user picked.
  const EMPTY_ACL: FileAcl = { allow_cid: [], allow_gid: [], deny_cid: [], deny_gid: [] };
  const defaultAcl = () => files()?.defaultAcl ?? EMPTY_ACL;
  const selfHash = useNavViewer();

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
    const q = query().trim().toLocaleLowerCase();
    return displayFiles()
      .filter((f) => !q || f.filename.toLocaleLowerCase().includes(q))
      .sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let cmp = 0;
      if (field === "name") cmp = a.filename.localeCompare(b.filename);
      else if (field === "size") cmp = a.filesize - b.filesize;
      else cmp = a.created.localeCompare(b.created);
      return dir === "asc" ? cmp : -cmp;
    });
  });

  function navigateInto(item: FileMeta) {
    if (item.folder !== current().hash) {
      navigate(cloudPath(nick(), item.display_path));
      return;
    }
    setNavStack((prev) => [
      ...prev,
      { hash: item.hash, displayPath: item.display_path, label: item.filename },
    ]);
    navigate(cloudPath(nick(), item.display_path));
    setPermItems(null);
    clearSelection();
  }

  function navigateTo(idx: number) {
    setNavStack((prev) => prev.slice(0, idx + 1));
    navigate(cloudPath(nick(), current().displayPath));
    setPermItems(null);
    clearSelection();
  }

  // Folder tree: jump straight to any folder (frames come pre-resolved).
  function selectFrames(frames: FolderFrame[]) {
    setNavStack([rootFrame(), ...frames]);
    navigate(cloudPath(nick(), current().displayPath));
    setPermItems(null);
    clearSelection();
  }

  let uploadInput!: HTMLInputElement;

  const bookmarks = useCloudBookmarks();

  // ── Toolbar actions: the selection, or the open folder when none ──────────
  // The open folder isn't in any listing, so its row is fetched on its own.
  // Matched against current() so a still-loading fetch can't stand in for the
  // previous folder; the root has no row and gets a stand-in (bookmark only).
  const [folderMetaRes] = createQueryResource(
    "files-meta",
    () => (current().hash ? { nick: nick(), hash: current().hash } : null),
    ({ nick: n, hash }) => fetchFileMeta(n, hash)
  );
  const folderTarget = (): FileMeta | null => {
    if (!current().hash) return { hash: "", display_path: "", filename: nick(), is_dir: true } as FileMeta;
    const m = folderMetaRes();
    return m?.hash === current().hash ? m : null;
  };
  const actingOnFolder = () => selectedItems().length === 0;
  const targets = (): FileMeta[] =>
    actingOnFolder() ? (folderTarget() ? [folderTarget()!] : []) : selectedItems();
  const viewer = () => ({ canWrite: canWrite(), isOwner: isOwner(), isLocal: isLocalUser() });
  // Only what can act on the current target — the row reshapes as the
  // selection changes, which on a phone beats a strip of greyed-out icons.
  const toolbarActions = () => FILE_ACTIONS.filter((a) =>
    actionShown(a, viewer()) && actionEnabled(a, targets(), actingOnFolder(), wopi()));

  function actionUi(id: FileAction) {
    const items = targets();
    return id === "bookmark" && items.length === 1 && bookmarks.find(nick(), items[0].display_path)
      ? BOOKMARKED_UI : ACTION_UI[id];
  }
  function actionLabel(id: FileAction): string {
    const items = targets();
    const label = t(actionUi(id).label as "files_mod.delete") as string;
    if (!items.length) return label;
    return `${label}: ${items.length > 1
      ? t("files_mod.selected_count", { count: items.length })
      : items[0].filename}`;
  }

  function runToolbarAction(id: FileAction) {
    const items = targets();
    if (id === "permissions") { setPermItems(items); return; }
    if (items.length > 1) {
      if (id === "download") downloadItems(nick(), items);
      else if (id === "moveCopy") setActiveModal({ kind: "moveCopy", item: items[0], items });
      else if (id === "delete") void handleBulkDelete();
      return;
    }
    if (!items.length) return;

    handleMenuAction(id, items[0]);
  }

  // Renaming or moving the open folder changes its URL — follow it there.
  async function followOpenFolder(hash: string) {
    if (!hash || hash !== current().hash) return;
    try {
      const m = await fetchFileMeta(nick(), hash);
      if (m.display_path !== current().displayPath) navigate(cloudPath(nick(), m.display_path));
    } catch { /* moved out of view — stay put */ }
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

  // ── Bulk selection ──────────────────────────────────────────────────────────
  // Keyed by hash, not index: sorting and refetches reorder the list freely.
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const selectedItems = createMemo(() =>
    sortedFiles().filter((f) => selected().has(f.hash))
  );
  function toggleSelected(hash: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(hash) ? next.delete(hash) : next.add(hash);
      return next;
    });
  }
  const allSelected = () =>
    sortedFiles().length > 0 && sortedFiles().every((f) => selected().has(f.hash));
  function toggleSelectAll() {
    setSelected(allSelected() ? new Set<string>() : new Set(sortedFiles().map((f) => f.hash)));
  }
  // A selection is only meaningful within one folder — the hashes on screen are
  // the only ones the bar can act on.
  const clearSelection = () => setSelected(new Set<string>());

  // View mode
  const [viewMode, setViewMode] = persistedSignal<ViewMode>(
    "hz-files-view",
    "list",
    oneOf<ViewMode>("list", "grid"),
  );
  function toggleViewMode() {
    setViewMode(viewMode() === "list" ? "grid" : "list");
  }

  // Permissions
  // One item or a whole selection.
  const [permItems, setPermItems] = createSignal<FileMeta[] | null>(null);

  async function handleDelete(item: FileMeta) {
    const label = item.is_dir ? `folder "${item.filename}"` : `"${item.filename}"`;
    if (!confirm(`Delete ${label}?`)) return;
    setBulkBusy(true);
    try {
      await deleteItem(nick(), item.display_path);
      refetch();
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  }

  // Bulk delete. Sequential for the same reason as move/copy: no batch
  // endpoint, and one failure shouldn't abandon the rest of the selection.
  const [bulkBusy, setBulkBusy] = createSignal(false);
  async function handleBulkDelete() {
    const items = selectedItems();
    if (!items.length) return;
    if (!confirm(t("files_mod.bulk_delete_confirm", { count: items.length }) as string)) return;

    setBulkBusy(true);
    const failed: FileMeta[] = [];
    for (const item of items) {
      try {
        await deleteItem(nick(), item.display_path);
      } catch {
        failed.push(item);
      }
    }
    setBulkBusy(false);
    // Only the ones that failed stay selected, so a retry repeats exactly them.
    setSelected(new Set(failed.map((f) => f.hash)));
    if (failed.length) {
      toast.error(t("files_mod.bulk_partial_fail", {
        count: failed.length,
        names: failed.map((f) => f.filename).join(", "),
      }) as string);
    }
    refetch();
  }

  function handleBulkMoved(failed: FileMeta[]) {
    setActiveModal(null);
    setSelected(new Set(failed.map((f) => f.hash)));
    if (failed.length) {
      toast.error(t("files_mod.bulk_partial_fail", {
        count: failed.length,
        names: failed.map((f) => f.filename).join(", "),
      }) as string);
    }
    refetch();
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

  function handlePermSaved(updated: FileMeta[], failed: FileMeta[]) {
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const f of updated) next.set(f.hash, f);
      return next;
    });
    setPermItems(null);
    // As bulk move/delete: only the failures stay selected, ready to retry.
    if (failed.length) {
      setSelected(new Set(failed.map((f) => f.hash)));
      toast.error(t("files_mod.bulk_partial_fail", {
        count: failed.length,
        names: failed.map((f) => f.filename).join(", "),
      }) as string);
    }
    queryClient.invalidateQueries({ queryKey: ["files-meta"] });
  }

  // Single-item actions (the toolbar's runToolbarAction routes here)
  // `items` is only set for a multi-selection; otherwise the modal is for the
  // one row it belongs to. Rename/categories are single-item by nature.
  const [activeModal, setActiveModal] =
    createSignal<{ kind: ModalKind; item: FileMeta; items?: FileMeta[] } | null>(null);
  const [previewItem, setPreviewItem] = createSignal<FileMeta | null>(null);
  const [wopiItem, setWopiItem] = createSignal<FileMeta | null>(null);

  function openItem(item: FileMeta) {
    if (item.is_dir) { navigateInto(item); return; }
    if (classifyPreview(item.filetype, item.filename) !== "none") { setPreviewItem(item); return; }
    window.open(davPath(nick(), item.display_path), "_blank");
  }

  function handleMenuAction(action: FileAction, item: FileMeta) {
    if (action === "permissions") {
      setPermItems([item]);
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
    if (action === "wopiEdit") {
      setWopiItem(item);
      return;
    }
    if (action === "download") {
      downloadItems(nick(), [item]);
      return;
    }
    if (action === "bookmark") {
      void bookmarks.toggle(nick(), item.display_path, item.filename);
      return;
    }
    setActiveModal({ kind: action, item });
  }

  function handleRenamed() {
    const hash = activeModal()?.item.hash ?? "";
    setActiveModal(null);
    refetch();
    void followOpenFolder(hash);
  }

  function handleMoved(_failed: FileMeta[]) {
    const hash = activeModal()?.item.hash ?? "";
    setActiveModal(null);
    refetch();
    void followOpenFolder(hash);
  }

  function handleCategoriesSaved() {
    setActiveModal(null);
  }

  return (
    <div class="max-w-6xl mx-auto px-4 md:px-6 pb-6 flex gap-6">

      {/* ── Folder tree (desktop only) ── */}
      <aside class="hidden md:block w-56 lg:w-64 shrink-0 self-start sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <FolderTree
          nick={nick()}
          stack={navStack()}
          onSelect={selectFrames}
          onOpenPath={(path) => navigate(cloudPath(nick(), path))}
          onOpenFile={(f) => { navigate(cloudPath(nick(), parentPath(f.display_path))); openItem(f); }}
        />
      </aside>

    <div class="flex-1 min-w-0 space-y-4">

      {/* ── Header: where you are, then history + refresh ── */}
      <div class="flex items-center gap-1.5 min-w-0">
        <div class="min-w-0 flex-1">
          <Breadcrumb stack={navStack()} onNavigate={navigateTo} />
        </div>
        <div class={GROUP}>
          <ToolButton label={t("files_mod.nav_back") as string} onClick={() => history.back()}>
            <MdOutlineArrow_back size={16} />
          </ToolButton>
          <ToolButton label={t("files_mod.nav_forward") as string} onClick={() => history.forward()}>
            <MdOutlineArrow_forward size={16} />
          </ToolButton>
          <ToolButton label={t("files_mod.refresh") as string} onClick={() => refetch()}>
            <MdOutlineRefresh size={16} />
          </ToolButton>
        </div>
      </div>

      {/* ── Toolbar (sticky): selection + what acts on it + view + create ──
          Sticky so a selection deep in a long folder stays actionable. */}
      <div class="sticky top-0 z-20 -mx-1 px-1 py-1.5 bg-base flex items-center gap-1.5 flex-wrap">
        <div class={GROUP}>
          <Show when={sortedFiles().length}>
            <ToolButton
              label={(allSelected() ? t("files_mod.unselect_all") : t("files_mod.select_all")) as string}
              onClick={toggleSelectAll}
            >
              <Show when={allSelected()} fallback={<MdOutlineCheck_box size={16} />}>
                <MdOutlineIndeterminate_check_box size={16} />
              </Show>
            </ToolButton>
          </Show>
        </div>

        {/* Selection chip — while it shows, the actions act on the selection */}
        <Show when={selectedItems().length > 0}>
          <div class="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg border border-accent/40 bg-accent/10 text-xs text-txt">
            <span class="font-medium tabular-nums">{t("files_mod.selected_count", { count: selectedItems().length })}</span>
            <button
              type="button"
              onClick={clearSelection}
              title={t("files_mod.clear_selection") as string}
              aria-label={t("files_mod.clear_selection") as string}
              class="p-0.5 rounded text-muted hover:text-txt hover:bg-overlay transition-colors"
            >
              <MdOutlineClose size={14} />
            </button>
          </div>
        </Show>

        {/* Actions — on the selection, else on the open folder */}
        <div class={GROUP}>
          <For each={toolbarActions()}>
            {(a) => (
              <ToolButton
                label={actionLabel(a.id)}
                disabled={a.id === "delete" && bulkBusy()}
                active={a.id === "bookmark" && actionUi(a.id) === BOOKMARKED_UI}
                danger={a.danger}
                onClick={() => runToolbarAction(a.id)}
              >
                {actionUi(a.id).icon({ size: 16 })}
              </ToolButton>
            )}
          </For>
        </div>

        <div class={GROUP}>
          <ToolButton
            label={t("files_mod.filter_view") as string}
            active={filterOpen()}
            onClick={() => { if (filterOpen()) setQuery(""); setFilterOpen((v) => !v); }}
          >
            <MdOutlineFilter_list size={16} />
          </ToolButton>
          <ToolButton
            label={(viewMode() === "list" ? t("files_mod.switch_grid") : t("files_mod.switch_list")) as string}
            onClick={toggleViewMode}
          >
            <Show when={viewMode() === "list"} fallback={<MdOutlineView_list size={16} />}>
              <MdOutlineGrid_view size={16} />
            </Show>
          </ToolButton>
        </div>

        {/* Sort — grid mode only; list mode sorts from the column headers */}
        <Show when={viewMode() === "grid"}>
          {/* One bordered unit: three small buttons, never worth wrapping apart */}
          <div class="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-rim">
            <For each={[
              { field: "name" as SortField, key: "files_mod.name_col" as const,    icon: MdOutlineSort_by_alpha },
              { field: "size" as SortField, key: "files_mod.size_col" as const,    icon: MdOutlineStorage },
              { field: "date" as SortField, key: "files_mod.created_col" as const, icon: MdOutlineSchedule },
            ]}>
              {(o) => (
                <ToolButton
                  label={`${t(o.key)}${sortField() === o.field ? (sortDir() === "asc" ? " ↑" : " ↓") : ""}`}
                  active={sortField() === o.field}
                  onClick={() => toggleSort(o.field)}
                >
                  <o.icon size={16} />
                </ToolButton>
              )}
            </For>
          </div>
        </Show>

        <Show when={canWrite()}>
          <div class={GROUP}>
            <ToolButton
              label={t("files_mod.new_folder") as string}
              active={showNewFolder()}
              onClick={() => setShowNewFolder((v) => !v)}
            >
              <MdOutlineCreate_new_folder size={16} />
            </ToolButton>
            <ToolButton label={t("files_mod.upload") as string} onClick={() => uploadInput.click()}>
              <MdOutlineUpload_file size={16} />
            </ToolButton>
            <input ref={uploadInput} type="file" multiple class="sr-only" onChange={handleUpload} />
          </div>
        </Show>
      </div>

      {/* ── View filter ── */}
      <Show when={filterOpen()}>
        <input
          type="search"
          autofocus
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); setFilterOpen(false); } }}
          placeholder={t("files_mod.filter_view") as string}
          aria-label={t("files_mod.filter_view") as string}
          class="w-full px-3 py-2 rounded-lg border border-rim bg-surface text-sm text-txt
                 placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
        />
      </Show>

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
          {/* Checkbox column — select-all lives in the toolbar (works in grid view too) */}
          <span class="w-4 shrink-0" />
          <span class="w-5 shrink-0" />
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
            fallback={<p class="py-12 text-center text-sm text-muted">
              {query().trim() ? t("files_mod.no_matches") : t("files_mod.folder_empty")}
            </p>}
          >
            <Show
              when={viewMode() === "list"}
              fallback={
                <>
                  <ThumbnailGrid
                    files={sortedFiles()}
                    nick={nick()}
                    defaultAcl={defaultAcl()}
                    selfHash={selfHash()?.hash}
                    onOpen={openItem}
                    selectable={true}
                    selected={selected()}
                    onSelect={toggleSelected}
                  />
                </>
              }
            >
              <div class="space-y-0.5">
                <For each={sortedFiles()}>
                  {(item) => (
                      <FileRow
                        item={item}
                        nick={nick()}
                        defaultAcl={defaultAcl()}
                        selfHash={selfHash()?.hash}
                        onOpen={openItem}
                        selectable={true}
                        selected={selected().has(item.hash)}
                        onSelect={() => toggleSelected(item.hash)}
                      />
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>

      {/* Permissions — one item or a whole selection */}
      <Show when={permItems()}>
        <Modal onClose={() => setPermItems(null)} label={t("files_mod.permissions")} class="z-50">
          <div class="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <PermissionsPanel
              items={permItems()!}
              nick={nick()}
              defaultAcl={defaultAcl()}
              onSaved={handlePermSaved}
              onClose={() => setPermItems(null)}
            />
          </div>
        </Modal>
      </Show>

      {/* ── Action modals ── */}
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
          items={activeModal()!.items ?? [activeModal()!.item]}
          nick={nick()}
          onDone={activeModal()!.items ? handleBulkMoved : handleMoved}
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
            onClose={() => {
              setPreviewItem(null);
              // Opened from a file URL: drop back to the folder's own URL.
              if (cloudPathSegments(location.pathname, nick()).join("/") !== current().displayPath)
                navigate(cloudPath(nick(), current().displayPath), { replace: true });
            }}
            onEditSaved={canWrite() ? async (blob) => {
              const edited = new File([blob], item().filename, { type: blob.type });
              await uploadFile(davDirPath(nick(), parentPath(item().display_path)), edited);
              refetch();
            } : undefined}
          />
        )}
      </Show>

      <Show when={wopiItem()}>
        {(item) => (
          <WopiEditorOverlay
            fileId={item().id}
            clientUrl={wopi()!.url}
            onClose={() => { setWopiItem(null); refetch(); }}
          />
        )}
      </Show>

    </div>
    </div>
  );
}
