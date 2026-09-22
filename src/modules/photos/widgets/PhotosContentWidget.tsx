import { A } from "@solidjs/router";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { bbcodeDisplay } from "@utsukta/spa-core/lib/renderBody";
import { createEffect, createMemo, createSignal, lazy, on, onMount, onCleanup, Show, For } from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { useNavigate, useLocation } from "@solidjs/router";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";
import {
  photos, albums, albumName, detail, loading, albumsLoading, albumsError, canWrite,
  tab, photoSort, photoDir, loadingMore, setPhotoSorting, loadMorePhotos,
  loadSummary, loadAlbum, loadImage, loadAlbums,
  handleLike, handleDislike, addComment, handleCommentReaction,
  createNewAlbum, deletePhotoAction, batchDeleteAction, batchMoveAction, deleteAlbumAction, renamePhotoAction,
  updateTitleAction, updateDescriptionAction, toggleNsfwAction,
} from "../store/store";
import {
  MdFillChat, MdFillChevron_left, MdFillChevron_right,
  MdFillThumb_up, MdFillThumb_down,
  MdOutlineThumb_down, MdOutlineThumb_up,
  MdFillKeyboard_arrow_down, MdFillKeyboard_arrow_up,
  MdFillAccount_tree, MdFillFormat_list_bulleted,
  MdOutlineEdit, MdOutlineDelete, MdOutlineReply, MdFillMore_vert,
  MdOutlineLock, MdOutlineShare, MdOutlineDownload,
  MdFillApps, MdFillCollections,
  MdFillAdd, MdFillClose,
  MdFillCloud_upload, MdFillDelete_forever,
  MdFillCheck_box, MdFillCheck_box_outline_blank,
  MdFillArrow_upward, MdFillArrow_downward,
} from "solid-icons/md";
import PhotoSwipe from "photoswipe";
import "photoswipe/style.css";


import CommentComposer from "@/shared/editor/composers/CommentComposer";
import { openShare } from "@utsukta/spa-core/store/share";
import { shareTargetForPhoto } from "@/shared/lib/shareLinks";
import CommentThread from "@/shared/views/CommentThread";
import AclEditor from "../components/AclEditor";
import { buildThreadTree } from "@utsukta/spa-core/lib/thread";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "@/shared/stream/types";
import type { PhotoComment, Album, Photo, SortDir } from "../api/api";
import { uploadPhotoEdit, uploadNewPhoto, photoDownloadUrl, fetchAlbums, variantSrc, saveAcl } from "../api/api";
import AclPicker, { entryKey, aclPayload, type AclEntry, type AclMode } from "@/shared/editor/components/AclPicker";
import { toast } from "@utsukta/spa-core/store/toast";
import { humanBytes } from "@/shared/lib/quota-format";
import { splitIntoColumns, useColumnCount } from "@utsukta/spa-core/lib/masonry";

const ImageEditor = lazy(() => import("@/shared/views/ImageEditor"));

// The album/image :datum route param isn't reachable via usePageNick/
// useSubjectNick (those only resolve the channel nick) — this component
// renders outside route-param context as a widget, so derive it from the
// URL directly. Matches /photos/:nick/album/:datum and
// /photos/:nick/image/:datum (datum is always the 4th path segment).
function usePhotoDatum(): () => string {
  const location = useLocation();
  return () => {
    const parts = location.pathname.split("/").filter(Boolean);
    return parts.length >= 4 ? decodeURIComponent(parts[3]) : "";
  };
}

export default function PhotosContentWidget() {
  const nick     = usePageNick();
  const datum    = usePhotoDatum();
  const location = useLocation();

  const datatype = () => {
    const p = location.pathname;
    if (/\/image(\/|$)/.test(p)) return 'image';
    if (/\/album(\/|$)/.test(p)) return 'album';
    return 'summary';
  };

  createEffect(() => {
    const n = nick() ?? '';
    const d = datum() ?? '';
    // Albums load on every photos route, not just the summary: the header's
    // tab switcher stays visible inside an album, and it needs the list to
    // know whether this channel has automatic upload folders.
    loadAlbums(n);
    if (datatype() === 'album') loadAlbum(n, d);
    else if (datatype() === 'image' && d) loadImage(n, d);
    else loadSummary(n);
  });

  return (
    <div class="max-w-5xl mx-auto">
      {/* The summary route owns its own loading state per tab, so it isn't
          gated on loading() — otherwise switching to Albums would blank out
          behind the photo-grid skeleton while photos refetch. */}
      <Show when={datatype() === 'summary'} fallback={
        <>
          <Show when={loading()}>
            <PhotoGridSkeleton />
          </Show>
          <Show when={!loading() && detail()}>
            <ImageView />
          </Show>
          <Show when={!loading() && !detail() && datatype() === 'album'}>
            <AlbumGrid />
          </Show>
        </>
      }>
        <Show when={tab() === 'photos'} fallback={<AlbumsView auto={tab() === 'uploads'} />}>
          <AllPhotosView />
        </Show>
      </Show>
    </div>
  );
}

// ── Shared sort/view controls ─────────────────────────────────────────────────

type SortKey  = 'date' | 'name' | 'size';
type ViewMode = 'grid' | 'list';

/** Sort keys + asc/desc toggle + grid/list switch. Shared by both summary tabs. */
function SortToolbar(props: {
  sort: SortKey;
  dir: SortDir;
  onSort: (s: SortKey) => void;
  onDir: (d: SortDir) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  children?: JSX.Element;
}) {
  const { t } = useI18n();
  const sortLabels: Record<SortKey, string> = {
    date: t("photos.sort_date"),
    name: t("photos.sort_name"),
    size: t("photos.sort_size"),
  };
  return (
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-muted">{t("photos.sort_by")}:</span>
      <For each={(['date', 'name', 'size'] as SortKey[])}>
        {(s) => (
          <button
            onClick={() => props.onSort(s)}
            class={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
              ${props.sort === s
                ? 'bg-surface text-txt'
                : 'text-muted hover:text-txt hover:bg-surface/50'}`}
          >
            {sortLabels[s]}
          </button>
        )}
      </For>
      <button
        onClick={() => props.onDir(props.dir === 'asc' ? 'desc' : 'asc')}
        title={props.dir === 'asc' ? t("photos.sort_asc") : t("photos.sort_desc")}
        class="p-1.5 rounded-md text-muted hover:text-txt transition-colors"
      >
        <Show when={props.dir === 'asc'} fallback={<MdFillArrow_downward size={16} />}>
          <MdFillArrow_upward size={16} />
        </Show>
      </button>

      <div class="flex items-center gap-1 ml-auto">
        <button
          onClick={() => props.onView('grid')}
          title={t("photos.view_grid")}
          class={`p-1.5 rounded-md transition-colors
            ${props.view === 'grid' ? 'text-accent bg-surface' : 'text-muted hover:text-txt'}`}
        >
          <MdFillApps size={17} />
        </button>
        <button
          onClick={() => props.onView('list')}
          title={t("photos.view_list")}
          class={`p-1.5 rounded-md transition-colors
            ${props.view === 'list' ? 'text-accent bg-surface' : 'text-muted hover:text-txt'}`}
        >
          <MdFillFormat_list_bulleted size={17} />
        </button>
        {props.children}
      </div>
    </div>
  );
}

// Masonry: explicit columns fed round-robin (splitIntoColumns' `i % n`), so
// reading order runs left-to-right across the row — CSS `columns` would fill
// each column top-to-bottom instead. Photos keep their own aspect ratio;
// nothing is measured up front, the columns just grow.
function PhotoMasonry<T>(props: { items: T[]; children: (item: T) => JSX.Element }) {
  const [gridEl, setGridEl] = createSignal<HTMLDivElement>();
  const columns = useColumnCount(gridEl, 9, 4);
  return (
    <div ref={setGridEl} class="flex gap-2 items-start">
      <For each={splitIntoColumns(props.items, columns())}>
        {(col) => (
          <div class="flex-1 min-w-0 flex flex-col gap-2">
            <For each={col}>{(item) => props.children(item)}</For>
          </div>
        )}
      </For>
    </div>
  );
}

// ── Photo selection (shared by the All Photos tab and the in-album grid) ──────
// Multi-select, batch move and batch delete behave identically in both places;
// only the surrounding album-level actions differ, so the state and the two
// pieces of UI that read it live here rather than being written twice.

function createPhotoSelection(nick: () => string, items: () => Photo[]) {
  const { t } = useI18n();
  const [selectMode, setSelectMode]       = createSignal(false);
  const [selected, setSelected]           = createSignal<Set<string>>(new Set());
  const [confirmBatch, setConfirmBatch]   = createSignal(false);
  const [batchDeleting, setBatchDeleting] = createSignal(false);
  // Album list for the move dropdown — fetched lazily, only when select opens.
  const [moveTargets, setMoveTargets]     = createSignal<Album[]>([]);
  const [moving, setMoving]               = createSignal(false);
  const [pendingDelete, setPendingDelete] = createSignal<string | null>(null);

  const allSelected = () => items().length > 0 && selected().size === items().length;

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected()) setSelected(new Set<string>());
    else setSelected(new Set(items().map(p => p.resource_id)));
  }

  function enterSelectMode() {
    setSelectMode(true);
    if (moveTargets().length === 0)
      fetchAlbums(nick()).then(setMoveTargets).catch(() => {});
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set<string>());
    setConfirmBatch(false);
  }

  async function handleBatchMove(folder: string) {
    setMoving(true);
    try {
      await batchMoveAction(nick(), Array.from(selected()), folder);
      exitSelectMode();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photos.move_error"));
    } finally {
      setMoving(false);
    }
  }

  async function handleBatchDelete() {
    if (!confirmBatch()) { setConfirmBatch(true); return; }
    setBatchDeleting(true);
    try {
      await batchDeleteAction(nick(), Array.from(selected()));
      exitSelectMode();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photos.delete_error"));
    } finally {
      setBatchDeleting(false);
    }
  }

  async function handleDeletePhoto(resourceId: string) {
    if (pendingDelete() !== resourceId) { setPendingDelete(resourceId); return; }
    setPendingDelete(null);
    try {
      await deletePhotoAction(nick(), resourceId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photos.delete_error"));
    }
  }

  return {
    nick, items, selectMode, selected, confirmBatch, batchDeleting, moveTargets, moving,
    pendingDelete, setPendingDelete, setConfirmBatch, allSelected,
    toggleOne, toggleSelectAll, enterSelectMode, exitSelectMode,
    handleBatchMove, handleBatchDelete, handleDeletePhoto,
  };
}

type PhotoSelection = ReturnType<typeof createPhotoSelection>;

/** Select / Cancel toggle — sits among each view's own toolbar buttons. */
function SelectToggle(props: { sel: PhotoSelection }) {
  const { t } = useI18n();
  return (
    <Show when={!props.sel.selectMode()} fallback={
      <button onClick={props.sel.exitSelectMode}
        class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-txt transition-colors">
        {t("photos.cancel")}
      </button>
    }>
      <button onClick={props.sel.enterSelectMode}
        class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-txt transition-colors">
        {t("photos.select")}
      </button>
    </Show>
  );
}

/** Batch action bar + select-all row. `folder` is the album being viewed, so it
 *  can be dropped from the move targets (moving a photo to where it already is
 *  is a no-op); the All Photos tab passes '' and keeps every album. */
function SelectionBar(props: { sel: PhotoSelection; folder?: string }) {
  const { t } = useI18n();
  const sel = props.sel;
  return (
    <>
      <Show when={sel.selectMode() && sel.selected().size > 0}>
        <div class="flex items-center gap-x-3 gap-y-2 flex-wrap px-3 py-2 bg-surface rounded-xl border border-rim">
          <span class="text-sm text-txt font-medium">
            {sel.selected().size} {t("photos.selected")}
          </span>
          <div class="flex items-center gap-2 flex-wrap ml-auto">
            <Show when={canWrite()}>
              <select
                disabled={sel.moving()}
                value=""
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  e.currentTarget.value = "";
                  if (v) sel.handleBatchMove(v === "__root__" ? "" : v);
                }}
                class="max-w-[9rem] px-2 py-1.5 rounded-lg text-xs font-medium bg-overlay text-txt
                       border border-rim outline-none disabled:opacity-50"
              >
                <option value="">{sel.moving() ? t("photos.batch_moving") : t("photos.move_selected")}</option>
                <option value="__root__">{t("photos.move_root")}</option>
                <For each={sel.moveTargets().filter(a => a.folder !== (props.folder ?? ''))}>
                  {(a) => <option value={a.folder}>{a.album}</option>}
                </For>
              </select>
            </Show>
            <Show when={sel.confirmBatch()} fallback={
              <button onClick={sel.handleBatchDelete}
                class="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500
                       hover:bg-red-500/10 transition-colors">
                {t("photos.delete_selected")}
              </button>
            }>
              <span class="text-xs text-red-500">{t("photos.confirm")}?</span>
              <button onClick={sel.handleBatchDelete} disabled={sel.batchDeleting()}
                class="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white
                       hover:bg-red-600 transition-colors disabled:opacity-50">
                {sel.batchDeleting() ? t("photos.batch_deleting") : t("photos.delete_selected")}
              </button>
              <button onClick={() => sel.setConfirmBatch(false)}
                class="px-2 py-1 rounded-md text-xs text-muted hover:text-txt transition-colors">
                {t("photos.cancel")}
              </button>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={sel.selectMode()}>
        <div class="flex items-center gap-2 px-1">
          <button onClick={sel.toggleSelectAll}
            class="flex items-center gap-2 text-sm text-muted hover:text-txt transition-colors">
            <Show when={sel.allSelected()} fallback={<MdFillCheck_box_outline_blank size={18} />}>
              <MdFillCheck_box size={18} class="text-accent" />
            </Show>
            {t("photos.select_all")} ({sel.items().length})
          </button>
        </div>
      </Show>
    </>
  );
}

/** One photo tile: opens the photo, or toggles its checkbox in select mode. */
function PhotoTile(props: { photo: Photo; sel: PhotoSelection }) {
  const { t }    = useI18n();
  const navigate = useNavigate();
  const sel      = props.sel;
  const photo    = props.photo;
  const isSelected = () => sel.selected().has(photo.resource_id);
  const isPending  = () => sel.pendingDelete() === photo.resource_id;

  return (
    <div class="group relative overflow-hidden rounded-xl bg-surface">
      <button
        onClick={() => sel.selectMode()
          ? sel.toggleOne(photo.resource_id)
          : navigate(`/photos/${sel.nick()}/image/${photo.resource_id}`)}
        class="block w-full cursor-pointer"
      >
        <img
          src={variantSrc(photo.src, 3)}
          alt={photo.filename}
          loading="lazy"
          class={`w-full h-auto block ${photo.is_nsfw
            ? 'blur-xl scale-110'
            : 'transition-transform duration-300 group-hover:scale-105'}`}
        />
      </button>

      <Show when={photo.is_nsfw}>
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span class="px-2 py-0.5 rounded-md bg-black/60 text-red-400 text-xs font-bold tracking-wide">
            {t("photos.nsfw")}
          </span>
        </div>
      </Show>

      <Show when={sel.selectMode()}>
        <div class={`absolute top-1.5 left-1.5 drop-shadow pointer-events-none
          ${isSelected() ? 'text-accent' : 'text-white'}`}>
          <Show when={isSelected()} fallback={<MdFillCheck_box_outline_blank size={20} />}>
            <MdFillCheck_box size={20} />
          </Show>
        </div>
        <Show when={isSelected()}>
          <div class="absolute inset-0 ring-2 ring-accent ring-inset rounded-xl pointer-events-none" />
        </Show>
      </Show>

      <Show when={!sel.selectMode()}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            openShare(shareTargetForPhoto(sel.nick(), photo));
          }}
          title={t("share.action")}
          class="absolute bottom-1.5 left-1.5 p-1 rounded-lg bg-black/50 text-white
                 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <MdOutlineShare size={16} />
        </button>

        <a
          href={photoDownloadUrl(sel.nick(), photo.resource_id)}
          download={photo.filename}
          title={t("photos.download")}
          onClick={(e) => e.stopPropagation()}
          class="absolute bottom-1.5 right-1.5 p-1 rounded-lg bg-black/50 text-white
                 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <MdOutlineDownload size={16} />
        </a>
      </Show>

      <Show when={canWrite() && !sel.selectMode()}>
        <Show when={isPending()} fallback={
          <button
            onClick={() => sel.handleDeletePhoto(photo.resource_id)}
            class="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/50 text-white
                   opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          >
            <MdFillDelete_forever size={16} />
          </button>
        }>
          <div class="absolute top-1.5 right-1.5 flex items-center gap-1">
            <button onClick={() => sel.handleDeletePhoto(photo.resource_id)}
              class="px-2 py-0.5 rounded-md bg-red-500 text-white text-xs font-medium">
              {t("photos.confirm")}
            </button>
            <button onClick={() => sel.setPendingDelete(null)}
              class="p-1 rounded-md bg-black/50 text-white">
              <MdFillClose size={14} />
            </button>
          </div>
        </Show>
      </Show>
    </div>
  );
}

// ── AllPhotosView (tab 1) ─────────────────────────────────────────────────────
// Sorting and paging are server-side (see Photos.php::getSummary) — a client
// sort would only order the page already fetched, which is wrong under scroll.

function AllPhotosView() {
  const nick     = usePageNick();
  const navigate = useNavigate();
  const { t }    = useI18n();
  const [viewMode, setViewMode] = createSignal<ViewMode>('grid');
  const sel = createPhotoSelection(() => nick() ?? '', photos);
  let sentinel: HTMLDivElement | undefined;

  onMount(() => {
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMorePhotos(); },
      { rootMargin: '400px' },
    );
    if (sentinel) io.observe(sentinel);
    onCleanup(() => io.disconnect());
  });

  return (
    <div class="flex flex-col gap-4">
      <SortToolbar
        sort={photoSort()}
        dir={photoDir()}
        onSort={(s) => setPhotoSorting(s, photoDir())}
        onDir={(d) => setPhotoSorting(photoSort(), d)}
        view={viewMode()}
        onView={setViewMode}
      >
        <Show when={canWrite()}>
          <SelectToggle sel={sel} />
        </Show>
      </SortToolbar>

      <SelectionBar sel={sel} />

      <Show when={loading()}>
        <PhotoGridSkeleton />
      </Show>

      <Show when={!loading() && photos().length === 0}>
        <p class="text-sm text-muted py-8 text-center">{t("photos.no_photos")}</p>
      </Show>

      <Show when={!loading() && viewMode() === 'grid'}>
        <PhotoMasonry items={photos()}>
          {(photo) => <PhotoTile photo={photo} sel={sel} />}
        </PhotoMasonry>
      </Show>

      <Show when={!loading() && viewMode() === 'list'}>
        <div class="flex flex-col divide-y divide-rim">
          <For each={photos()}>
            {(photo) => (
              <button
                onClick={() => sel.selectMode()
                  ? sel.toggleOne(photo.resource_id)
                  : navigate(`/photos/${nick()}/image/${photo.resource_id}`)}
                class={`flex items-center gap-3 py-2.5 px-2 hover:bg-surface transition-colors
                        rounded-lg text-left w-full cursor-pointer
                        ${sel.selected().has(photo.resource_id) ? 'ring-2 ring-accent ring-inset' : ''}`}
              >
                <Show when={sel.selectMode()}>
                  <Show when={sel.selected().has(photo.resource_id)}
                    fallback={<MdFillCheck_box_outline_blank size={18} class="text-muted shrink-0" />}>
                    <MdFillCheck_box size={18} class="text-accent shrink-0" />
                  </Show>
                </Show>
                <div class="w-12 h-12 rounded-lg overflow-hidden bg-overlay flex-shrink-0">
                  <img
                    src={variantSrc(photo.src, 3)}
                    alt={photo.filename}
                    loading="lazy"
                    class={`w-full h-full object-cover ${photo.is_nsfw ? 'blur-md scale-110' : ''}`}
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-txt truncate">
                    {photo.title || photo.filename}
                  </p>
                  <p class="text-xs text-muted truncate">
                    {photo.album || t("photos.move_root")} · {photo.created.slice(0, 10)}
                    <Show when={photo.filesize > 0}>{' · ' + humanBytes(photo.filesize)}</Show>
                  </p>
                </div>
                <MdFillChevron_right size={18} class="text-subtle flex-shrink-0" />
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Infinite-scroll sentinel */}
      <div ref={sentinel} class="h-px" />
      <Show when={loadingMore()}>
        <p class="text-xs text-muted py-3 text-center">{t("photos.loading_more")}</p>
      </Show>
    </div>
  );
}

// ── AlbumsView (tab 2) ────────────────────────────────────────────────────────

// Both album tabs are this one view: `auto` picks the automatic photo-upload
// folders (see Photos.php::autoAlbumRegex), !auto everything else — so the two
// tabs partition the album list rather than overlapping.
function AlbumsView(props: { auto: boolean }) {
  const nick     = usePageNick();
  const { t }    = useI18n();
  const [sortBy, setSortBy]         = createSignal<SortKey>('date');
  const [sortDir, setSortDir]       = createSignal<SortDir>('desc');
  const [viewMode, setViewMode]     = createSignal<ViewMode>('grid');
  const [showForm, setShowForm]     = createSignal(false);
  const [newName, setNewName]       = createSignal('');
  const [creating, setCreating]     = createSignal(false);
  const [createError, setCreateError] = createSignal('');
  const [aclMode, setAclMode]       = createSignal<AclMode>('public');
  const [allowKeys, setAllowKeys]   = createSignal<Set<string>>(new Set<string>());
  const [denyKeys, setDenyKeys]     = createSignal<Set<string>>(new Set<string>());

  function toggleAcl(entry: AclEntry, list: 'allow' | 'deny') {
    const key = entryKey(entry);
    const [add, drop] = list === 'allow' ? [setAllowKeys, setDenyKeys] : [setDenyKeys, setAllowKeys];
    add(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    drop(prev => { const n = new Set(prev); n.delete(key); return n; });
  }

  // The whole album list arrives in one response, so sorting stays client-side
  // here (unlike the Photos tab, which pages).
  const sortedAlbums = createMemo(() => {
    const cmp =
      sortBy() === 'name' ? (x: Album, y: Album) => x.album.localeCompare(y.album)
      : sortBy() === 'size' ? (x: Album, y: Album) => x.total - y.total
      : (x: Album, y: Album) => (x.created ?? '').localeCompare(y.created ?? '');
    const sorted = albums().filter(a => !!a.auto === props.auto).sort(cmp);
    return sortDir() === 'desc' ? sorted.reverse() : sorted;
  });

  async function handleCreate(e: Event) {
    e.preventDefault();
    const name = newName().trim();
    if (!name) return;
    setCreating(true);
    setCreateError('');
    try {
      const album = await createNewAlbum(nick() ?? '', name);
      // The album is created public; a non-public pick is a second call, since
      // attach_mkdir() takes no ACL.
      if (aclMode() !== 'public' && album.folder) {
        await saveAcl(nick() ?? '', 'album', album.folder,
          aclPayload(aclMode(), allowKeys(), denyKeys()));
      }
      setNewName('');
      setShowForm(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("photos.album_error"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div class="flex flex-col gap-4">
      {/* Toolbar */}
      <SortToolbar
        sort={sortBy()}
        dir={sortDir()}
        onSort={setSortBy}
        onDir={setSortDir}
        view={viewMode()}
        onView={setViewMode}
      >
        <Show when={canWrite() && !props.auto}>
          <button
            onClick={() => {
              setShowForm(v => !v); setCreateError(''); setNewName('');
              setAclMode('public'); setAllowKeys(new Set<string>()); setDenyKeys(new Set<string>());
            }}
            title={t("photos.new_album")}
            class={`ml-1 p-1.5 rounded-md transition-colors
              ${showForm() ? 'text-accent bg-surface' : 'text-muted hover:text-txt'}`}
          >
            <Show when={showForm()} fallback={<MdFillAdd size={17} />}>
              <MdFillClose size={17} />
            </Show>
          </button>
        </Show>
      </SortToolbar>

      {/* New album form */}
      <Show when={showForm()}>
        <form
          onSubmit={handleCreate}
          class="flex flex-wrap items-center gap-2 p-3 bg-surface rounded-xl border border-rim"
        >
          <input
            type="text"
            value={newName()}
            onInput={e => setNewName(e.currentTarget.value)}
            placeholder={t("photos.album_name_ph")}
            disabled={creating()}
            autofocus
            class="flex-1 min-w-[8rem] bg-transparent text-sm text-txt placeholder:text-muted
                   outline-none disabled:opacity-50"
          />
          <AclPicker
            mode={aclMode()}
            onModeChange={setAclMode}
            allowEntries={allowKeys()}
            denyEntries={denyKeys()}
            onToggle={toggleAcl}
            onClear={() => { setAllowKeys(new Set<string>()); setDenyKeys(new Set<string>()); }}
          />
          <Show when={createError()}>
            <span class="text-xs text-red-500">{createError()}</span>
          </Show>
          <button
            type="submit"
            disabled={creating() || !newName().trim()}
            class="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium
                   transition-opacity disabled:opacity-40"
          >
            {creating() ? t("photos.album_creating") : t("photos.album_create")}
          </button>
        </form>
      </Show>

      {/* Albums loading skeleton */}
      <Show when={albumsLoading()}>
        <AlbumSkeleton mode={viewMode()} />
      </Show>

      {/* Permission denied */}
      <Show when={!albumsLoading() && albumsError() === 'denied'}>
        <p class="text-sm text-muted py-8 text-center">{t("photos.not_accessible")}</p>
      </Show>

      {/* Empty */}
      <Show when={!albumsLoading() && !albumsError() && sortedAlbums().length === 0}>
        <p class="text-sm text-muted py-8 text-center">{t("photos.no_albums")}</p>
      </Show>

      {/* Grid mode */}
      <Show when={!albumsLoading() && viewMode() === 'grid'}>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <For each={sortedAlbums()}>
            {(album) => (
              <A
                href={`/photos/${nick()}/album/${album.folder}`}
                class="group block rounded-xl overflow-hidden bg-surface
                       hover:bg-elevated transition-colors border border-rim"
              >
                <div class="aspect-square overflow-hidden bg-overlay">
                  <Show
                    when={album.thumb}
                    fallback={
                      <div class="w-full h-full flex items-center justify-center">
                        <MdFillCollections size={40} class="text-subtle" />
                      </div>
                    }
                  >
                    <img
                      src={album.thumb!}
                      alt={album.album}
                      loading="lazy"
                      class="w-full h-full object-cover transition-transform
                             duration-300 group-hover:scale-105"
                    />
                  </Show>
                </div>
                <div class="p-2.5">
                  <p class="text-sm font-medium text-txt truncate">{album.album}</p>
                  <p class="text-xs text-muted">{album.total} {t("photos.photos_count")}</p>
                </div>
              </A>
            )}
          </For>
        </div>
      </Show>

      {/* List mode */}
      <Show when={!albumsLoading() && viewMode() === 'list'}>
        <div class="flex flex-col divide-y divide-rim">
          <For each={sortedAlbums()}>
            {(album) => (
              <A
                href={`/photos/${nick()}/album/${album.folder}`}
                class="flex items-center gap-3 py-2.5 px-2 hover:bg-surface
                       transition-colors rounded-lg"
              >
                <div class="w-12 h-12 rounded-lg overflow-hidden bg-overlay flex-shrink-0">
                  <Show
                    when={album.thumb}
                    fallback={
                      <div class="w-full h-full flex items-center justify-center">
                        <MdFillCollections size={22} class="text-subtle" />
                      </div>
                    }
                  >
                    <img
                      src={album.thumb!}
                      alt={album.album}
                      loading="lazy"
                      class="w-full h-full object-cover"
                    />
                  </Show>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-txt truncate">{album.album}</p>
                  <p class="text-xs text-muted">{album.total} {t("photos.photos_count")}</p>
                </div>
                <MdFillChevron_right size={18} class="text-subtle flex-shrink-0" />
              </A>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function AlbumSkeleton(props: { mode: ViewMode }) {
  return (
    <Show
      when={props.mode === 'grid'}
      fallback={
        <div class="flex flex-col divide-y divide-rim">
          <For each={Array(4).fill(0)}>
            {() => (
              <div class="flex items-center gap-3 py-2.5 px-2">
                <div class="w-12 h-12 rounded-lg bg-surface animate-pulse flex-shrink-0" />
                <div class="flex-1 flex flex-col gap-1.5">
                  <div class="h-3.5 w-32 bg-surface animate-pulse rounded" />
                  <div class="h-3 w-16 bg-surface animate-pulse rounded" />
                </div>
              </div>
            )}
          </For>
        </div>
      }
    >
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <For each={Array(8).fill(0)}>
          {() => (
            <div class="rounded-xl overflow-hidden border border-rim">
              <div class="aspect-square bg-surface animate-pulse" />
              <div class="p-2.5 flex flex-col gap-1.5">
                <div class="h-3.5 w-20 bg-surface animate-pulse rounded" />
                <div class="h-3 w-12 bg-surface animate-pulse rounded" />
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

// ── AlbumGrid ─────────────────────────────────────────────────────────────────

function AlbumGrid() {
  const navigate = useNavigate();
  const nick     = usePageNick();
  const datum    = usePhotoDatum();
  const auth     = useAuth();
  const { t }    = useI18n();

  // View controls
  const [sortBy, setSortBy] = createSignal<'date' | 'name'>('date');

  // Album deletion
  const [confirmAlbum, setConfirmAlbum]   = createSignal(false);
  const [deletingAlbum, setDeletingAlbum] = createSignal(false);


  // ACL editor
  const [aclOpen, setAclOpen] = createSignal(false);

  // Upload progress
  const [uploadProgress, setUploadProgress] =
    createSignal<{ done: number; total: number } | null>(null);
  let fileInputRef: HTMLInputElement | undefined;
  const [isDragging, setIsDragging] = createSignal(false);

  const isOwner = () => !!auth()?.nick && auth()!.nick === nick();

  const sortedPhotos = createMemo(() => {
    const p = photos();
    if (sortBy() === 'name')
      return [...p].sort((a, b) => a.filename.localeCompare(b.filename));
    return [...p].sort((a, b) => b.created.localeCompare(a.created));
  });

  const sel = createPhotoSelection(() => nick() ?? '', sortedPhotos);

  async function handleFiles(files: FileList) {
    const n      = nick() ?? '';
    const folder = datum() ?? '';
    const album  = albumName();
    setUploadProgress({ done: 0, total: files.length });
    let failed = 0;
    const errors = new Set<string>();
    for (let i = 0; i < files.length; i++) {
      try { await uploadNewPhoto(n, files[i], album, folder); }
      catch (err) {
        failed++;
        errors.add(err instanceof Error ? err.message : t("photos.upload_failed"));
      }
      setUploadProgress({ done: i + 1, total: files.length });
    }
    setUploadProgress(null);
    if (folder) loadAlbum(n, folder);
    if (failed > 0) toast.error(errors.size ? [...errors].join(" ") : t("photos.upload_failed"));
  }

  async function handleDeleteAlbum() {
    if (!confirmAlbum()) { setConfirmAlbum(true); return; }
    setDeletingAlbum(true);
    try {
      await deleteAlbumAction(nick() ?? '', datum() ?? '');
      navigate(`/photos/${nick() ?? ''}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photos.delete_error"));
      setDeletingAlbum(false);
      setConfirmAlbum(false);
    }
  }

  return (
    <div
      class="flex flex-col gap-4"
      onDragEnter={(e) => {
        if (!canWrite() || !e.dataTransfer?.types?.length) return;
        e.preventDefault();
        setIsDragging(true);
      }}
    >
      {/* Drop overlay — must be a real pointer-events target so the browser's
          hit-test lands here rather than on the scroll wrapper or body.
          The inner content is pointer-events-none so events reach the outer div. */}
      <Show when={isDragging()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null))
              setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const files = e.dataTransfer?.files;
            if (files?.length) handleFiles(files);
          }}
        >
          <div class="bg-surface rounded-2xl px-10 py-8 shadow-2xl text-center border-4 border-dashed border-accent pointer-events-none">
            <MdFillCloud_upload size={48} class="text-accent mx-auto mb-3" />
            <p class="text-lg font-semibold text-txt">{t("photos.drop_to_upload")}</p>
          </div>
        </div>
      </Show>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        onChange={e => e.currentTarget.files && handleFiles(e.currentTarget.files)}
      />

      {/* Breadcrumb */}
      <div class="flex items-center gap-2">
        <button
          onClick={() => navigate(`/photos/${nick() ?? ''}`)}
          class="text-sm text-muted hover:text-txt flex items-center gap-1 transition-colors"
        >
          <MdFillChevron_left size={16} /> {t("photos.all_photos")}
        </button>
        <Show when={albumName()}>
          <span class="text-subtle">/</span>
          <span class="text-sm font-medium text-txt">{albumName()}</span>
        </Show>
      </div>

      {/* Toolbar */}
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs text-muted">{t("photos.sort_by")}:</span>
        <For each={(['date', 'name'] as const)}>
          {(s) => (
            <button
              onClick={() => setSortBy(s)}
              class={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                ${sortBy() === s ? 'bg-surface text-txt' : 'text-muted hover:text-txt hover:bg-surface/50'}`}
            >
              {s === 'date' ? t("photos.sort_date") : t("photos.sort_name")}
            </button>
          )}
        </For>

        <Show when={canWrite()}>
          {/* Upload */}
          <button
            onClick={() => fileInputRef?.click()}
            disabled={!!uploadProgress()}
            class="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                   bg-accent/10 text-accent hover:bg-accent/20 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MdFillCloud_upload size={15} />
            {uploadProgress()
              ? `${uploadProgress()!.done}/${uploadProgress()!.total}`
              : t("photos.upload")}
          </button>

          {/* Select / Cancel */}
          <SelectToggle sel={sel} />

          {/* Download album as a zip — albums are attach folders, so the files
              download endpoint zips them for us. */}
          <Show when={!sel.selectMode() && !!datum()}>
            <a
              href={photoDownloadUrl(nick() ?? '', datum() ?? '')}
              download={`${albumName() || 'album'}.zip`}
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                     text-muted hover:text-txt hover:bg-surface/50 transition-colors"
            >
              <MdOutlineDownload size={15} />
              {t("photos.download_album")}
            </a>
          </Show>

          {/* Delete album — bulk-destructive, stays owner-only regardless of write_storage */}
          <Show when={!sel.selectMode() && isOwner()}>
            <Show when={confirmAlbum()} fallback={
              <button onClick={handleDeleteAlbum} disabled={deletingAlbum()}
                class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500/70
                       hover:text-red-500 hover:bg-red-500/10 transition-colors">
                {t("photos.delete_album")}
              </button>
            }>
              <div class="flex items-center gap-1">
                <span class="text-xs text-red-500">{t("photos.confirm")}?</span>
                <button onClick={handleDeleteAlbum} disabled={deletingAlbum()}
                  class="px-2 py-1 rounded-md text-xs font-medium bg-red-500 text-white
                         hover:bg-red-600 transition-colors disabled:opacity-50">
                  {deletingAlbum() ? t("photos.batch_deleting") : t("photos.delete_album")}
                </button>
                <button onClick={() => setConfirmAlbum(false)}
                  class="px-2 py-1 rounded-md text-xs text-muted hover:text-txt transition-colors">
                  {t("photos.cancel")}
                </button>
              </div>
            </Show>
          </Show>

          {/* Album privacy — ACL changes stay owner-only, only for real albums (non-root) */}
          <Show when={!sel.selectMode() && !!datum() && isOwner()}>
            <button
              onClick={() => setAclOpen(v => !v)}
              title={t("photos.acl_privacy")}
              class={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                     transition-colors
                     ${aclOpen()
                       ? 'text-accent bg-accent/10'
                       : 'text-muted hover:text-txt hover:bg-surface/50'}`}
            >
              <MdOutlineLock size={15} />
              {t("photos.acl_privacy")}
            </button>
          </Show>
        </Show>
      </div>

      {/* Album ACL editor */}
      <Show when={aclOpen() && !!datum()}>
        <AclEditor
          nick={nick() ?? ''}
          type="album"
          datum={datum() ?? ''}
          onClose={() => setAclOpen(false)}
        />
      </Show>

      <SelectionBar sel={sel} folder={datum()} />

      <Show when={photos().length === 0}>
        <p class="text-sm text-muted py-8 text-center">{t("photos.no_photos")}</p>
      </Show>

      {/* Share composer — Show forces remount so initialBody is captured correctly */}

      {/* Photo grid */}
      <PhotoMasonry items={sortedPhotos()}>
        {(photo) => <PhotoTile photo={photo} sel={sel} />}
      </PhotoMasonry>
    </div>
  );
}

// ── ImageView ─────────────────────────────────────────────────────────────────

function commentToNode(c: PhotoComment, photoMid: string, profileUid: number): ThreadNode {
  return {
    id: String(c.iid || c.mid),
    iid: c.iid || undefined,
    uuid: c.uuid || c.mid,
    profileUid,
    mid: c.mid,
    parent_mid: c.parent_mid || photoMid,
    thr_parent: c.thr_parent || photoMid,
    top_mid: photoMid,
    parent: '',
    // Photo comments arrive as raw bbcode, same as stream items do.
    body: sanitizeHtml(bbcodeDisplay(c.body ?? '')),
    rawBody: c.body,
    title: '',
    authorName: c.author.name,
    authorAvatar: c.author.photo,
    authorUrl: c.author.url,
    created: c.created,
    verb: 'Create',
    item_thread_top: c.item_thread_top ?? 0,
    flags: [],
    permalink: c.author.url || '',
    children: [],
    commentCount: 0,
    likeCount: c.like_count ?? 0,
    dislikeCount: c.dislike_count ?? 0,
    repeatCount: 0,
    viewerLiked: c.viewer_liked ?? false,
    viewerDisliked: c.viewer_disliked ?? false,
    viewerRepeated: false,
  };
}

function flattenForDisplay(nodes: ThreadNode[]): ThreadNode[] {
  const result: ThreadNode[] = [];
  for (const node of nodes) {
    result.push({ ...node, children: [] });
    result.push(...flattenForDisplay(node.children));
  }
  return result;
}

function ImageView() {
  const navigate  = useNavigate();
  const nick      = usePageNick();
  const auth      = useAuth();
  const navViewer = useNavViewer();
  const { t }     = useI18n();
  const d         = detail;

  const [replyOpen, setReplyOpen]         = createSignal(false);
  const [showComments, setShowComments]   = createSignal(true);
  const [threaded, setThreaded]           = createSignal(true);
  const [editFile, setEditFile]           = createSignal<File | null>(null);
  const [editUploading, setEditUploading] = createSignal(false);
  const { open: moreOpen, setOpen: setMoreOpen, toggle: openMoreDropdown,
          floatStyle: moreStyle, setTriggerRef: setMoreRef, setPanelRef: setMorePanelRef } =
    useDropdown({ placement: "bottom-end", offset: 4 });
  const [deleteConfirming, setDeleteConfirming] = createSignal(false);
  const [aclOpen, setAclOpen]                   = createSignal(false);
  const [renameOpen, setRenameOpen]             = createSignal(false);
  const [renameInput, setRenameInput]           = createSignal('');
  const [renaming, setRenaming]                 = createSignal(false);
  const [titleEditing, setTitleEditing]           = createSignal(false);
  const [titleInput, setTitleInput]               = createSignal('');
  const [titleSaving, setTitleSaving]             = createSignal(false);
  const [descEditing, setDescEditing]             = createSignal(false);
  const [descInput, setDescInput]                 = createSignal('');
  const [descSaving, setDescSaving]               = createSignal(false);
  const [nsfwSaving, setNsfwSaving]               = createSignal(false);
  let deleteTimer: ReturnType<typeof setTimeout> | null = null;
  let pswpRef: PhotoSwipe | null = null;

  onCleanup(() => {
    if (deleteTimer) clearTimeout(deleteTimer);
    pswpRef?.close();
  });

  const isOwner = () => !!auth()?.nick && auth()!.nick === nick();

  // NSFW blur — revealed per photo, resets when navigating to a sibling
  const [nsfwRevealed, setNsfwRevealed] = createSignal(false);
  createEffect(on(() => d()?.resource_id, () => setNsfwRevealed(false)));
  const nsfwBlurred = () => !!d()?.is_nsfw && !nsfwRevealed();

  function openLightbox() {
    const photo = d();
    if (!photo) return;
    pswpRef?.close();

    let currentSize = 0; // open at original (-0); the page shows medium (-2)

    const item = {
      src:    variantSrc(photo.src, currentSize),
      msrc:   variantSrc(photo.src, 2), // medium is already loaded on the page
      alt:    photo.filename,
      width:  photo.width  || 0, // original dimensions; reset on size switch
      height: photo.height || 0,
    };

    const pswp = new PhotoSwipe({
      dataSource: [item],
      index: 0,
      bgOpacity: 0.95,
      wheelToZoom: true,
    });

    // After the image loads, propagate real pixel dimensions into every layer
    // PhotoSwipe consults so that the slide holder never stretches:
    //   • item       — data source, read when new Content is constructed
    //   • content    — the cached Content object, read when its Slide is (re)created
    //   • slide      — the live Slide, needed for the immediate calculateSize call
    pswp.on('loadComplete', (e) => {
      const { slide, content } = e;
      const img = content.element;
      if (!(img instanceof HTMLImageElement)) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return;
      item.width  = w;   // fresh Content construction path
      item.height = h;
      (content as any).width   = w;   // cached Content reuse path
      (content as any).height  = h;
      const wasAtInitial = slide.currZoomLevel === slide.zoomLevels.initial;
      (slide as any).width  = w;
      (slide as any).height = h;
      slide.calculateSize();
      slide.updateContentSize(true);
      if (wasAtInitial) slide.zoomTo(slide.zoomLevels.initial, undefined, 0);
    });

    pswp.on('uiRegister', () => {
      // Size selector
      pswp.ui?.registerElement({
        name: 'size-selector',
        order: 8,
        isButton: false,
        tagName: 'div',
        onInit: (el: HTMLElement) => {
          const SIZES = [
            { label: 'S', title: t('photos.size_small'),    size: 3 },
            { label: 'M', title: t('photos.size_medium'),   size: 2 },
            { label: 'L', title: t('photos.size_large'),    size: 1 },
            { label: 'XL', title: t('photos.size_original'), size: 0 },
          ] as const;

          el.style.cssText = 'display:flex;align-items:center;gap:3px;padding:0 4px;';

          const btns: HTMLButtonElement[] = [];

          const refresh = (activeSize: number) => {
            btns.forEach((btn, i) => {
              const on = SIZES[i].size === activeSize;
              btn.style.color    = on ? 'rgba(255,255,255,1)'    : 'rgba(255,255,255,0.45)';
              btn.style.background = on ? 'rgba(255,255,255,0.18)' : 'transparent';
              btn.style.borderColor = on ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)';
            });
          };

          SIZES.forEach(({ label, title, size }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.title = title;
            btn.style.cssText =
              'padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;' +
              'border:1px solid;cursor:pointer;transition:all 0.12s;line-height:1.6;';
            btn.addEventListener('click', () => {
              if (size === currentSize) return;
              currentSize = size;
              item.src    = variantSrc(photo.src, size);
              item.width  = 0;
              item.height = 0;
              pswp.refreshSlideContent(0);
              refresh(size);
            });
            btns.push(btn);
            el.appendChild(btn);
          });

          refresh(currentSize);

          // Caption — gradient bar at the bottom showing title, description, NSFW badge
          pswp.ui?.registerElement({
            name: 'description-caption',
            order: 10,
            isButton: false,
            appendTo: 'root',
            onInit: (cap: HTMLElement) => {
              const title = photo.title ?? '';
              const desc  = photo.description ?? '';
              const nsfw  = photo.is_nsfw ?? false;
              if (!title && !desc && !nsfw) { cap.style.display = 'none'; return; }
              cap.style.cssText =
                'position:absolute;bottom:0;left:0;right:0;' +
                'padding:40px 56px 18px;' +
                'background:linear-gradient(transparent,rgba(0,0,0,0.6));' +
                'color:rgba(255,255,255,0.92);font-size:14px;line-height:1.5;' +
                'text-align:center;pointer-events:none;';
              if (nsfw) {
                const badge = document.createElement('span');
                badge.textContent = 'NSFW';
                badge.style.cssText =
                  'display:inline-block;margin-bottom:6px;padding:1px 7px;' +
                  'background:rgba(239,68,68,0.25);color:#fca5a5;' +
                  'border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.05em;';
                cap.appendChild(badge);
                cap.appendChild(document.createElement('br'));
              }
              if (title) {
                const el = document.createElement('strong');
                el.textContent = title;
                el.style.cssText = 'display:block;font-size:15px;';
                cap.appendChild(el);
              }
              if (desc) {
                const el = document.createElement('span');
                el.textContent = desc;
                el.style.cssText = 'display:block;font-size:13px;opacity:0.8;margin-top:2px;';
                cap.appendChild(el);
              }
            },
          });
        },
      });
    });

    pswp.on('close', () => { pswpRef = null; });
    pswpRef = pswp;
    pswp.init();
  }

  async function onDeleteClick() {
    if (!deleteConfirming()) {
      setDeleteConfirming(true);
      deleteTimer = setTimeout(() => setDeleteConfirming(false), 3000);
      return;
    }
    if (deleteTimer) clearTimeout(deleteTimer);
    setDeleteConfirming(false);
    setMoreOpen(false);
    const photo = d();
    if (!photo) return;
    try {
      await deletePhotoAction(nick() ?? '', photo.resource_id);
      navigate(`/photos/${nick() ?? ''}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photos.delete_error"));
    }
  }

  function openRename() {
    setRenameInput(d()?.filename ?? '');
    setRenameOpen(true);
    setMoreOpen(false);
  }

  async function handleRename(e: Event) {
    e.preventDefault();
    const name = renameInput().trim();
    if (!name || renaming()) return;
    setRenaming(true);
    try {
      await renamePhotoAction(nick() ?? '', d()!.resource_id, name);
      setRenameOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photos.rename_error"));
    } finally {
      setRenaming(false);
    }
  }

  async function handleTitleSave(e: Event) {
    e.preventDefault();
    if (titleSaving()) return;
    setTitleSaving(true);
    try {
      await updateTitleAction(nick() ?? '', d()!.resource_id, titleInput().trim());
      setTitleEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photos.title_error"));
    } finally {
      setTitleSaving(false);
    }
  }

  async function handleDescSave(e: Event) {
    e.preventDefault();
    if (descSaving()) return;
    setDescSaving(true);
    try {
      await updateDescriptionAction(nick() ?? '', d()!.resource_id, descInput().trim());
      setDescEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photos.description_error"));
    } finally {
      setDescSaving(false);
    }
  }

  async function handleNsfwToggle() {
    if (nsfwSaving()) return;
    const photo = d();
    if (!photo) return;
    setNsfwSaving(true);
    setMoreOpen(false);
    try {
      await toggleNsfwAction(nick() ?? '', photo.resource_id, !photo.is_nsfw);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photos.nsfw_error"));
    } finally {
      setNsfwSaving(false);
    }
  }

  async function startEdit() {
    const photo = d();
    if (!photo) return;
    try {
      const res  = await fetch(photo.src_full, { credentials: "include" });
      const blob = await res.blob();
      const file = new File([blob], photo.filename || "photo.jpg", {
        type: blob.type || "image/jpeg",
      });
      setEditFile(file);
    } catch {
      toast.error(t("photos.photo_error"));
    }
  }

  async function handleEditConfirm(blob: Blob) {
    setEditFile(null);
    const photo = d();
    if (!photo) return;
    setEditUploading(true);
    try {
      await uploadPhotoEdit(nick() ?? "", photo.resource_id, blob);
      toast.success(t("photos.photo_saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photos.photo_error"));
    } finally {
      setEditUploading(false);
    }
  }

  const prevPath    = () => d()?.prevlink?.replace(window.location.origin, '') ?? null;
  const nextPath    = () => d()?.nextlink?.replace(window.location.origin, '') ?? null;
  const photoMid    = () => d()?.item_mid ?? '';
  const profileUid  = () => auth()?.uid ?? 0;
  const commentCount = () => d()?.comments?.length ?? 0;

  const commentNodes = createMemo(() => {
    const items = d()?.comments ?? [];
    const mid = photoMid();
    const uid = profileUid();
    return buildThreadTree(items.map(c => commentToNode(c, mid, uid)));
  });

  const hasNested = () => commentNodes().some(n => n.children.length > 0);

  const visibleComments = () =>
    threaded() ? commentNodes() : flattenForDisplay(commentNodes());

  const handlers: StreamHandlers = {
    onLike:    (mid) => handleCommentReaction(mid, 'like'),
    onDislike: (mid) => handleCommentReaction(mid, 'dislike'),
    onRepeat:  () => {},
    onComment: (parentMid, body) => {
      const tempId = crypto.randomUUID();
      const viewer = navViewer();
      addComment({
        iid: 0,
        mid: tempId,
        uuid: tempId,
        body,
        thr_parent: parentMid,
        created: new Date().toISOString().replace('T', ' ').slice(0, 19),
        author: {
          name: viewer?.name || auth()?.nick || '',
          url: viewer?.url ?? '',
          photo: viewer?.avatar ?? '',
        },
      });
    },
    onLoadComments: async () => {},
  };

  return (
    <div class="flex flex-col gap-4">
      {/* Image editor overlay */}
      <Show when={editFile()}>
        {(file) => (
          <ImageEditor
            file={file()}
            onConfirm={handleEditConfirm}
            onCancel={() => setEditFile(null)}
          />
        )}
      </Show>

      {/* Breadcrumb */}
      <div class="flex items-center gap-2">
        <button
          onClick={() => {
            const albumPath = d()?.album_link?.replace(window.location.origin, '');
            navigate(albumPath ?? `/photos/${nick() ?? ''}`);
          }}
          class="text-sm text-muted hover:text-txt flex items-center gap-1 transition-colors"
        >
          <MdFillChevron_left size={16} /> {t("photos.back")}
        </button>
        <Show when={d()?.album}>
          <span class="text-subtle">/</span>
          <span class="text-sm text-muted">{d()?.album}</span>
        </Show>
      </div>

      {/* Card */}
      <div class="bg-surface border border-rim rounded-2xl overflow-hidden shadow-sm mb-4">

        {/* Image */}
        <div class="relative bg-overlay flex items-center justify-center min-h-48 overflow-hidden">
          <img
            src={d() ? variantSrc(d()!.src, 1) : undefined}
            alt={d()?.filename}
            onClick={() => { if (!nsfwBlurred()) openLightbox(); }}
            title={nsfwBlurred() ? undefined : t("photos.size_original")}
            class={`max-h-[70vh] w-full object-contain
                   ${nsfwBlurred() ? 'blur-2xl' : 'cursor-zoom-in'}`}
          />

          {/* NSFW reveal overlay */}
          <Show when={nsfwBlurred()}>
            <button
              onClick={() => setNsfwRevealed(true)}
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-pointer"
            >
              <span class="px-2 py-0.5 rounded-md bg-black/60 text-red-400 text-xs font-bold tracking-wide">
                {t("photos.nsfw")}
              </span>
              <span class="px-3 py-1.5 rounded-lg bg-black/60 text-white text-sm font-medium">
                {t("photos.nsfw_show")}
              </span>
            </button>
          </Show>
          <Show when={prevPath()}>
            <A
              href={prevPath()!}
              class="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full
                     bg-black/40 hover:bg-black/60 text-white transition-colors"
            >
              <MdFillChevron_left size={22} />
            </A>
          </Show>
          <Show when={nextPath()}>
            <A
              href={nextPath()!}
              class="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full
                     bg-black/40 hover:bg-black/60 text-white transition-colors"
            >
              <MdFillChevron_right size={22} />
            </A>
          </Show>
        </div>

        {/* Content */}
        <div class="p-3 md:p-5">
          {/* NSFW badge */}
          <Show when={d()?.is_nsfw}>
            <span class="inline-block mb-2 px-2 py-0.5 rounded-md bg-red-500/15 text-red-500
                         text-xs font-semibold tracking-wide">
              {t("photos.nsfw")}
            </span>
          </Show>

          {/* Title — editable with write access */}
          <Show when={canWrite()} fallback={
            <Show when={d()?.title}>
              <p class="text-txt font-medium mb-1">{d()?.title}</p>
            </Show>
          }>
            <Show when={titleEditing()} fallback={
              <div
                class="group/title flex items-center gap-1.5 mb-1 cursor-pointer"
                onClick={() => { setTitleInput(d()?.title ?? ''); setTitleEditing(true); }}
                title={t("photos.edit_title")}
              >
                <p class={`flex-1 text-sm font-medium ${d()?.title ? 'text-txt' : 'text-muted italic'}`}>
                  {d()?.title || t("photos.title_ph")}
                </p>
                <MdOutlineEdit size={13} class="flex-shrink-0 text-muted opacity-100 md:opacity-0 md:group-hover/title:opacity-100 transition-opacity" />
              </div>
            }>
              <form onSubmit={handleTitleSave} class="mb-2 flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput()}
                  onInput={e => setTitleInput(e.currentTarget.value)}
                  disabled={titleSaving()}
                  autofocus
                  placeholder={t("photos.title_ph")}
                  class="flex-1 bg-overlay text-sm text-txt placeholder:text-muted rounded-lg
                         px-3 py-1.5 outline-none border border-rim disabled:opacity-50"
                />
                <button type="submit" disabled={titleSaving()}
                  class="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium
                         transition-opacity disabled:opacity-40 flex-shrink-0">
                  {titleSaving() ? t("photos.title_saving") : t("photos.title_save")}
                </button>
                <button type="button" onClick={() => setTitleEditing(false)}
                  class="px-2 py-1.5 rounded-lg text-xs text-muted hover:text-txt transition-colors flex-shrink-0">
                  {t("photos.cancel")}
                </button>
              </form>
            </Show>
          </Show>

          {/* Description — editable with write access */}
          <Show when={canWrite()} fallback={
            <Show when={d()?.description}>
              <p class="text-sm text-muted mb-2 whitespace-pre-wrap">{d()?.description}</p>
            </Show>
          }>
            <Show when={descEditing()} fallback={
              <div
                class="group/desc flex items-start gap-1.5 mb-2 cursor-pointer"
                onClick={() => { setDescInput(d()?.description ?? ''); setDescEditing(true); }}
                title={t("photos.edit_description")}
              >
                <p class={`flex-1 text-sm ${d()?.description ? 'text-muted' : 'text-muted/50 italic'}`}>
                  {d()?.description || t("photos.description_ph")}
                </p>
                <MdOutlineEdit size={13} class="flex-shrink-0 mt-0.5 text-muted opacity-100 md:opacity-0 md:group-hover/desc:opacity-100 transition-opacity" />
              </div>
            }>
              <form onSubmit={handleDescSave} class="mb-3 flex flex-col gap-2">
                <textarea
                  value={descInput()}
                  onInput={e => setDescInput(e.currentTarget.value)}
                  disabled={descSaving()}
                  autofocus
                  rows={3}
                  placeholder={t("photos.description_ph")}
                  class="w-full bg-overlay text-sm text-txt placeholder:text-muted rounded-lg
                         px-3 py-2 outline-none border border-rim resize-none disabled:opacity-50"
                />
                <div class="flex items-center gap-2">
                  <button type="submit" disabled={descSaving()}
                    class="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium
                           transition-opacity disabled:opacity-40">
                    {descSaving() ? t("photos.description_saving") : t("photos.description_save")}
                  </button>
                  <button type="button" onClick={() => setDescEditing(false)}
                    class="px-2 py-1.5 rounded-lg text-xs text-muted hover:text-txt transition-colors">
                    {t("photos.cancel")}
                  </button>
                </div>
              </form>
            </Show>
          </Show>

          <p class="text-xs text-muted">
            {d()?.filename}
            <Show when={d()?.created}>
              {' · '}{new Date(d()!.created).toLocaleString()}
            </Show>
          </p>

          {/* Action bar */}
          <div class="mt-4 pt-3 border-t border-rim flex items-center gap-1">
            {/* Like / Dislike */}
            <Show when={auth()?.isLoggedIn}>
              <button
                onClick={handleLike}
                title={t("post.like")}
                class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                       transition-colors select-none hover:bg-overlay
                       ${d()?.viewer_liked ? 'text-accent' : 'text-muted'}`}
              >
                <Show when={d()?.viewer_liked} fallback={<MdOutlineThumb_up size={17} />}>
                  <MdFillThumb_up size={17} />
                </Show>
                <span>{d()?.like_count ?? 0}</span>
              </button>

              <button
                onClick={handleDislike}
                title={t("post.dislike")}
                class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                       transition-colors select-none hover:bg-overlay
                       ${d()?.viewer_disliked ? 'text-accent' : 'text-muted'}`}
              >
                <Show when={d()?.viewer_disliked} fallback={<MdOutlineThumb_down size={17} />}>
                  <MdFillThumb_down size={17} />
                </Show>
                <span>{d()?.dislike_count ?? 0}</span>
              </button>
            </Show>

            {/* Comments toggle */}
            <Show when={commentCount() > 0}>
              <button
                onClick={() => setShowComments(v => !v)}
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                       text-muted hover:bg-overlay hover:text-txt transition-colors"
                title={t("post.toggle_comments")}
              >
                <Show when={showComments()} fallback={<MdFillKeyboard_arrow_down size={17} />}>
                  <MdFillKeyboard_arrow_up size={17} />
                </Show>
                <MdFillChat size={15} />
                <span>{commentCount()}</span>
              </button>
            </Show>

            {/* Thread / flat toggle */}
            <Show when={showComments() && hasNested()}>
              <button
                onClick={() => setThreaded(v => !v)}
                class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium
                       text-muted hover:bg-overlay hover:text-txt transition-colors"
                title={threaded() ? t("photos.switch_flat") : t("photos.switch_threaded")}
              >
                <Show when={threaded()} fallback={<MdFillAccount_tree size={17} />}>
                  <MdFillFormat_list_bulleted size={17} />
                </Show>
              </button>
            </Show>

            <a
              href={photoDownloadUrl(nick(), d()?.resource_id ?? "")}
              download={d()?.filename}
              title={t("photos.download")}
              class="ml-auto flex items-center px-2 py-1.5 rounded-lg text-sm font-medium
                     transition-colors hover:bg-overlay text-muted hover:text-txt"
            >
              <MdOutlineDownload size={17} />
            </a>

            <button
              onClick={() => { const p = d(); if (p) openShare(shareTargetForPhoto(nick(), p)); }}
              title={t("share.action")}
              class="flex items-center px-2 py-1.5 rounded-lg text-sm font-medium
                     transition-colors hover:bg-overlay text-muted hover:text-txt"
            >
              <MdOutlineShare size={17} />
            </button>

            {/* Reply */}
            <Show when={auth()?.isLoggedIn && d()?.item_id}>
              <button
                onClick={() => setReplyOpen(v => !v)}
                class={`flex items-center px-2 py-1.5 rounded-lg text-sm font-medium
                       transition-colors hover:bg-overlay
                       ${replyOpen() ? 'text-accent' : 'text-muted hover:text-txt'}`}
                title={t("photos.comment")}
              >
                <MdOutlineReply size={17} />
              </button>
            </Show>

            {/* More dropdown */}
            <Show when={canWrite()}>
              <div ref={setMoreRef} class="relative">
                <button
                  onClick={openMoreDropdown}
                  title={t("post.more_actions")}
                  class={`flex items-center px-1.5 py-1.5 rounded-lg text-sm font-medium
                         transition-colors hover:bg-overlay
                         ${moreOpen() ? 'text-accent' : 'text-muted'}`}
                >
                  <MdFillMore_vert size={18} />
                </button>
              </div>
            </Show>
          </div>

          <Portal mount={topLayer()}>
            <Show when={moreOpen()}>
              <div
                ref={setMorePanelRef}
                class="z-[9999] min-w-[11rem] bg-surface border border-rim rounded-lg shadow-lg py-1"
                style={moreStyle()}
              >
                <button
                  onClick={() => { setMoreOpen(false); startEdit(); }}
                  disabled={editUploading()}
                  class="w-full flex items-center gap-2 px-3 py-2 text-sm text-txt
                         hover:bg-overlay transition-colors text-left disabled:opacity-50"
                >
                  <Show when={editUploading()}
                    fallback={<MdOutlineEdit size={15} />}
                  >
                    <div class="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  </Show>
                  <span>{editUploading() ? t("photos.editing") : t("photos.edit_photo")}</span>
                </button>
                <button
                  onClick={openRename}
                  class="w-full flex items-center gap-2 px-3 py-2 text-sm text-txt
                         hover:bg-overlay transition-colors text-left"
                >
                  <MdOutlineEdit size={15} class="opacity-60" />
                  <span>{t("photos.rename")}</span>
                </button>
                {/* ACL changes stay owner-only, even with write access */}
                <Show when={isOwner()}>
                  <button
                    onClick={() => { setMoreOpen(false); setAclOpen(v => !v); }}
                    class="w-full flex items-center gap-2 px-3 py-2 text-sm text-txt
                           hover:bg-overlay transition-colors text-left"
                  >
                    <MdOutlineLock size={15} />
                    <span>{t("photos.acl_privacy")}</span>
                  </button>
                </Show>
                <button
                  onClick={handleNsfwToggle}
                  disabled={nsfwSaving()}
                  class="w-full flex items-center gap-2 px-3 py-2 text-sm text-txt
                         hover:bg-overlay transition-colors text-left disabled:opacity-50"
                >
                  <span class="text-xs font-bold w-[15px] text-center leading-none text-red-400">18+</span>
                  <span>{d()?.is_nsfw ? t("photos.nsfw_unmark") : t("photos.nsfw_mark")}</span>
                </button>
                <button
                  onClick={onDeleteClick}
                  class={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-overlay
                         transition-colors text-left
                         ${deleteConfirming() ? 'text-red-500' : 'text-txt'}`}
                >
                  <MdOutlineDelete size={15} />
                  <span>{deleteConfirming() ? t("photos.confirm") : t("photos.delete_photo")}</span>
                </button>
              </div>
            </Show>
          </Portal>

          {/* ACL editor */}
          <Show when={aclOpen() && d()?.resource_id}>
            <AclEditor
              nick={nick() ?? ''}
              type="image"
              datum={d()!.resource_id}
              onClose={() => setAclOpen(false)}
            />
          </Show>

          {/* Rename form */}
          <Show when={renameOpen()}>
            <form
              onSubmit={handleRename}
              class="mt-3 flex items-center gap-2 p-3 bg-overlay rounded-xl border border-rim"
            >
              <input
                type="text"
                value={renameInput()}
                onInput={e => setRenameInput(e.currentTarget.value)}
                placeholder={t("photos.rename_ph")}
                disabled={renaming()}
                autofocus
                class="flex-1 bg-transparent text-sm text-txt placeholder:text-muted
                       outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={renaming() || !renameInput().trim()}
                class="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium
                       transition-opacity disabled:opacity-40"
              >
                {renaming() ? t("photos.renaming") : t("photos.rename")}
              </button>
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                class="px-2 py-1.5 rounded-lg text-xs text-muted hover:text-txt transition-colors"
              >
                {t("photos.cancel")}
              </button>
            </form>
          </Show>

          {/* Reply composer */}
          <Show when={replyOpen() && d()?.item_id}>
            <CommentComposer
              parentUuid={d()?.item_uuid ?? undefined}
              profileUid={profileUid()}
              onSubmitted={(body) => {
                const tempId = crypto.randomUUID();
                const viewer = navViewer();
                addComment({
                  iid: 0,
                  mid: tempId,
                  uuid: tempId,
                  body,
                  thr_parent: photoMid(),
                  created: new Date().toISOString().replace('T', ' ').slice(0, 19),
                  author: {
                    name: viewer?.name || auth()?.nick || '',
                    url: viewer?.url ?? '',
                    photo: viewer?.avatar ?? '',
                  },
                });
                setReplyOpen(false);
                setShowComments(true);
              }}
            />
          </Show>

          {/* Comment thread */}
          <CommentThread
            comments={visibleComments()}
            show={showComments()}
            handlers={handlers}
          />
        </div>
      </div>
    </div>
  );
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function PhotoGridSkeleton() {
  return (
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      <For each={Array(8).fill(0)}>
        {() => (
          <div class="aspect-square rounded-xl bg-surface animate-pulse" />
        )}
      </For>
    </div>
  );
}
