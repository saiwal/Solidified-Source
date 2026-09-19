import { markItemSeen } from '@utsukta/spa-core/lib/markSeen';
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineChevron_left, MdOutlineExpand_less, MdOutlineExpand_more, MdOutlineMenu, MdOutlineSearch, MdOutlineWarning } from "solid-icons/md";
import {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  lazy,
  For,
  Show,
  type Component,
} from "solid-js";
const PostDetailModal = lazy(() => import("@/shared/views/PostDetailModal"));

// ── Types ─────────────────────────────────────────────────────────────────

// Entry shape, the fetcher and the offline store all live in message-store.ts
// so the inbox module and these HQ widgets share one mailbox.
import { fetchMessages, type MessageEntry, type MessageType, type FeedType } from "@utsukta/spa-core/lib/message-store";
import { persistedSignal, oneOf } from "@utsukta/spa-core/lib/persisted";
// Unseen top-level post, or unseen replies to a seen one — ignores the
// per-item "locallyRead" click state, which only matters for rendering.
import { isEntryUnseen } from "@utsukta/spa-core/lib/unseen";
// Mail behaviour (star/trash/file, selection, drag, keys) lives in the inbox
// module and is entirely opt-in — HQ's message cards pass none of these props
// and render exactly as before.
import { createInboxActions, TRASH, type PatchFn } from "@/modules/inbox/actions";
import { createRowDrag } from "@/modules/inbox/useDragToFolder";
import { createInboxKeys } from "@/modules/inbox/keys";
import FolderMenu from "@/modules/inbox/FolderMenu";
export type { MessageType, FeedType };

// Background auto-refresh so new messages show up without a manual click.
const POLL_INTERVAL = 30_000;

// ── Time grouping ──────────────────────────────────────────────────────────

const TIME_GROUPS = ["Just now", "Today", "Yesterday", "This week", "Older"] as const;
type TimeGroup = (typeof TIME_GROUPS)[number];

function getTimeGroup(dateStr: string): TimeGroup {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 300) return "Just now";
  if (diff < 86400) return "Today";
  if (diff < 172800) return "Yesterday";
  if (diff < 604800) return "This week";
  return "Older";
}

export const TYPE_ICON_PATH: Record<MessageType, string> = {
  "":
    "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z",
  "direct":
    "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  "starred":
    "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.783.57-1.838-.197-1.539-1.118l1.519-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.381-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  "notification":
    "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
};

export const FOLDER_ICON_PATH =
  "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z";

const TRASH_ICON_PATH =
  "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";
const ENVELOPE_ICON_PATH =
  "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z";
const RESTORE_ICON_PATH =
  "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15";

// One card per feed type — id/label used by HqMessagesWidget's tab rail and
// the inbox view.
export const FEED_META: Record<FeedType, { titleKey: string }> = {
  "":             { titleKey: "hq.messages" },
  "direct":       { titleKey: "hq.msg_tab_direct" },
  "starred":      { titleKey: "hq.msg_tab_starred" },
  "notification": { titleKey: "hq.msg_tab_notices" },
  "folder":       { titleKey: "hq.msg_tab_folders" },
};

// ── Folder view toggle ───────────────────────────────────────────────────
//
// List/grid preference for HqFoldersWidget's body. Lives here (not in
// HqFoldersWidget.tsx, which is lazy-loaded) so HqMessagesWidget can render
// the toggle buttons in its own tab-bar row without pulling the folders
// body's chunk into the main bundle.

export type ViewMode = "list" | "grid";

export const [folderViewMode, setFolderViewMode] = persistedSignal<ViewMode>(
  "hz-hq-folder-view",
  "list",
  oneOf<ViewMode>("list", "grid"),
);

const ListIcon: Component<{ class?: string }> = (props) => (
  <MdOutlineMenu class={props.class} />
);

const GridIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
    />
  </svg>
);

export const FolderViewToggle: Component<{ mode: ViewMode; onChange: (m: ViewMode) => void }> = (props) => {
  const { t } = useI18n();
  return (
    <div class="flex items-center gap-0.5 bg-overlay rounded-lg p-0.5">
      <button
        type="button"
        onClick={() => props.onChange("list")}
        aria-label={t("hq.folder_view_list")}
        aria-pressed={props.mode === "list"}
        class="p-1 rounded-md transition-colors"
        classList={{
          "bg-surface text-txt shadow-sm": props.mode === "list",
          "text-muted hover:text-txt": props.mode !== "list",
        }}
      >
        <ListIcon class="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => props.onChange("grid")}
        aria-label={t("hq.folder_view_grid")}
        aria-pressed={props.mode === "grid"}
        class="p-1 rounded-md transition-colors"
        classList={{
          "bg-surface text-txt shadow-sm": props.mode === "grid",
          "text-muted hover:text-txt": props.mode !== "grid",
        }}
      >
        <GridIcon class="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function decodeHtmlEntities(str: string): string {
  const ta = document.createElement("textarea");
  ta.innerHTML = str;
  return ta.value;
}

function parseFolderNames(html: string): string[] {
  const div = document.createElement("div");
  div.innerHTML = html;
  const spans = div.querySelectorAll("span");
  if (spans.length > 0) {
    return Array.from(spans)
      .map((s) => s.textContent?.trim() ?? "")
      .filter(Boolean);
  }
  const text = (div.textContent ?? div.innerText ?? "").trim();
  return text ? [text] : [];
}

// `folders` is the real list; `info` is the pre-existing bootstrap-badge HTML
// and the only thing an entry cached before this feature carries.
function entryFolders(e: MessageEntry): string[] {
  return e.folders ?? (e.info ? parseFolderNames(e.info) : []);
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  return h % 360;
}

// ── Avatar ────────────────────────────────────────────────────────────────

const Avatar: Component<{ src?: string; name: string; size?: string }> = (props) => {
  const hue = () => avatarHue(props.name);
  const size = props.size ?? "w-8 h-8";
  return (
    <div
      class={`${size} rounded-full shrink-0 flex items-center justify-center text-xs font-semibold overflow-hidden select-none`}
      style={{
        background: props.src ? undefined : `hsl(${hue()}, 55%, 82%)`,
        color: `hsl(${hue()}, 45%, 35%)`,
      }}
    >
      <Show when={props.src} fallback={<span>{initials(props.name)}</span>}>
        <img
          src={props.src}
          alt={props.name}
          class="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </Show>
    </div>
  );
};

// ── Row action button ─────────────────────────────────────────────────────

const RowButton: Component<{
  path: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}> = (props) => (
  <button
    type="button"
    title={props.title}
    aria-label={props.title}
    onClick={(e) => { e.stopPropagation(); props.onClick(); }}
    class="p-1 rounded-md hover:bg-elevated transition-colors"
    classList={{ "text-accent": props.active, "text-muted hover:text-txt": !props.active }}
  >
    <svg
      class="w-4 h-4"
      fill={props.active ? "currentColor" : "none"}
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d={props.path} />
    </svg>
  </button>
);


// One row of actions, positioned by the caller: in a list row it is laid over
// the message text (it only appears on hover, so covering the summary costs
// nothing and takes no width from a 360px row); in the reader's toolbar it sits
// in normal flow.
const ActionRail: Component<{
  entry: MessageEntry;
  acts: RowActions;
  t: (k: any, p?: any) => string;
  class?: string;
}> = (props) => {
  const e = () => props.entry;
  const unseen = () => isEntryUnseen(e());
  const inTrash = () => entryFolders(e()).includes(TRASH);
  return (
    <div
      class={`shrink-0 flex items-center gap-0.5 ${props.class ?? ""}`}
      onPointerDown={(ev) => ev.stopPropagation()}
    >
      <RowButton
        path={TYPE_ICON_PATH.starred}
        title={e().starred ? props.t("hq.unstar_action") : props.t("hq.star_action")}
        active={!!e().starred}
        onClick={() => props.acts.star(e())}
      />
      <FolderMenu
        folders={props.acts.folders}
        current={entryFolders(e())}
        title={props.t("hq.move_to_folder")}
        onPick={(name) => props.acts.move(e(), name)}
        class="p-1 rounded-md text-muted hover:text-txt hover:bg-elevated transition-colors"
      />
      <RowButton
        path={ENVELOPE_ICON_PATH}
        title={unseen() ? props.t("hq.mark_read") : props.t("hq.mark_unread")}
        onClick={() => props.acts.toggleRead(e())}
      />
      <Show
        when={inTrash()}
        fallback={
          <RowButton
            path={TRASH_ICON_PATH}
            title={props.t("hq.trash_action")}
            onClick={() => props.acts.trash(e())}
          />
        }
      >
        <RowButton
          path={RESTORE_ICON_PATH}
          title={props.t("hq.restore_action")}
          onClick={() => props.acts.restore(e())}
        />
      </Show>
    </div>
  );
};

// ── Message item ──────────────────────────────────────────────────────────

interface RowActions {
  star: (e: MessageEntry) => void;
  trash: (e: MessageEntry) => void;
  restore: (e: MessageEntry) => void;
  toggleRead: (e: MessageEntry) => void;
  move: (e: MessageEntry, folder: string) => void;
  folders: string[];
}

const MessageItem: Component<{
  entry: MessageEntry;
  feedType: FeedType;
  // Modal state lives in MessageList — the background poll replaces entry
  // objects wholesale, which disposes/recreates every MessageItem, so any
  // local "modal open" signal here would reset and close an open modal.
  onOpen: () => void;
  actions?: RowActions;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (shift: boolean) => void;
  cursored?: boolean;
  active?: boolean;
  dragging?: boolean;
  swipeDx?: number;
  onPointerDown?: (e: PointerEvent) => void;
  registerRef?: (el: HTMLElement) => void;
}> = (props) => {
  const { t } = useI18n();
  const e = () => props.entry;
  const [locallyRead, setLocallyRead] = createSignal(false);

  // unseen_count is a real number when there are unseen replies, but a
  // non-numeric placeholder otherwise — normalize before comparing.
  const unseenReplyCount = () => {
    const n = Number(e().unseen_count);
    return Number.isFinite(n) ? n : 0;
  };
  const hasUnseenReplies = () => !locallyRead() && unseenReplyCount() > 0;
  const isAnyUnseen = () => !locallyRead() && isEntryUnseen(e());

  function handleClick(ev: MouseEvent) {
    // A checkbox click, a row action, or the tail of a drag — never an open.
    if ((ev.target as HTMLElement).closest("button,a,input")) return;
    if (props.selectable && (ev.shiftKey || ev.ctrlKey || ev.metaKey)) {
      props.onToggleSelect?.(ev.shiftKey);
      return;
    }
    props.onOpen();
    if (!locallyRead() && isAnyUnseen()) {
      setLocallyRead(true);
      markItemSeen(e().b64mid);
    }
  }

  return (
    <>
      {/* A div, not a button: the action rail, the checkbox and the folder
          menu are themselves buttons and cannot nest inside one. */}
      <div
        ref={props.registerRef}
        role="button"
        tabindex="-1"
        onClick={handleClick}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            handleClick(ev as unknown as MouseEvent);
          }
        }}
        onPointerDown={props.onPointerDown}
        style={props.swipeDx ? { transform: `translateX(${props.swipeDx}px)` } : undefined}
        class={`
          group w-full text-left px-3.5 py-2 flex items-start gap-2
          transition-colors duration-150 relative cursor-pointer touch-pan-y
          hover:bg-overlay
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent
          ${isAnyUnseen() ? "bg-accent-muted" : ""}
        `}
        classList={{
          // bg-inherit on the action rail needs the row to actually paint a
          // background; HQ's rows stay transparent on their card.
          "bg-base": !!props.actions && !isAnyUnseen(),
          "focus-within:bg-overlay": !!props.actions,
          "ring-2 ring-inset ring-accent": props.cursored,
          "bg-elevated": props.active || props.selected,
          "opacity-50": props.dragging,
        }}
      >
        {/* Type color rail — always shown, full opacity when unseen */}
        <span
          class="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full transition-opacity duration-200"
          style={{
            opacity: isAnyUnseen() ? "1" : "0.3",
          }}
        />

        {/* The checkbox replaces the avatar rather than crowding beside it —
            at 360px there is no room for both plus the action rail. */}
        <Show
          when={props.selectable && (props.selected || undefined)}
          fallback={
            <div class="relative shrink-0">
              <Avatar src={e().author_img} name={e().author_name} size="w-7 h-7" />
              <Show when={props.selectable}>
                <input
                  type="checkbox"
                  checked={false}
                  aria-label={t("hq.select_message")}
                  onClick={(ev) => { ev.stopPropagation(); props.onToggleSelect?.(ev.shiftKey); }}
                  class="absolute inset-0 w-7 h-7 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100
                         rounded-full cursor-pointer accent-accent"
                />
              </Show>
            </div>
          }
        >
          <input
            type="checkbox"
            checked
            aria-label={t("hq.select_message")}
            onClick={(ev) => { ev.stopPropagation(); props.onToggleSelect?.(ev.shiftKey); }}
            class="w-7 h-7 shrink-0 rounded-full cursor-pointer accent-accent"
          />
        </Show>

        <div class="flex-1 min-w-0">
          <div class="flex items-baseline justify-between gap-2">
            <div class="flex items-center gap-1 min-w-0">
              <span
                class={`text-[0.8125rem] truncate leading-snug ${
                  isAnyUnseen() ? "font-semibold text-txt" : "font-medium text-txt"
                }`}
              >
                {e().author_name}
              </span>
            </div>
            <time class="text-[0.625rem] text-muted shrink-0 tabular-nums">
              {timeAgo(e().created)}
            </time>
          </div>

          <Show when={e().title}>
            <p
              class={`text-xs line-clamp-1 leading-snug ${
                isAnyUnseen() ? "font-semibold text-txt" : "text-txt"
              }`}
            >
              {decodeHtmlEntities(e().title!)}
            </p>
          </Show>

          <Show when={e().summary}>
            <p class="text-xs text-muted line-clamp-1 leading-snug">
              {decodeHtmlEntities(e().summary)}
            </p>
          </Show>

          <Show when={props.feedType !== "direct" && entryFolders(e()).length > 0}>
            <div class="flex flex-wrap gap-1 mt-0.5">
              <For each={entryFolders(e())}>
                {(name) => (
                  <span class="inline-flex items-center gap-1 py-0.5 rounded-md italic text-[0.625rem] text-muted font-medium">
                    <span class="truncate max-w-[200px]">{name}</span>
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Action rail, laid over the right of the message text and revealed on
            hover — so it costs no row width at all. `bg-inherit` picks up
            whatever the row's current background is (hover, unseen, selected),
            which is what makes it opaque enough to cover the summary.
            Pointer-driven only: there is no hover on touch, where the swipe
            gesture (left trash / right star) and the reader's own toolbar do
            this job instead of a rail permanently sitting on the text. */}
        <Show when={props.actions}>
          {(acts) => (
            <ActionRail
              entry={e()}
              acts={acts()}
              t={t}
              class="hidden md:flex absolute right-0 top-0 bottom-0 px-2 bg-inherit
                     opacity-0 pointer-events-none transition-opacity
                     group-hover:opacity-100 group-hover:pointer-events-auto
                     group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
            />
          )}
        </Show>

        {/* Reply count when there are unseen replies; otherwise a bare "1"
            for a top-level item that's itself unseen (e.g. a fresh DM with
            no replies yet — the backend has no reply count to give us). */}
        <Show when={isAnyUnseen()}>
          <span
            class="absolute bottom-1.5 right-2.5 min-w-[1.1rem] h-4 rounded-full text-[0.5625rem] font-bold
              flex items-center justify-center px-1 tabular-nums
              bg-accent text-surface"
          >
            {hasUnseenReplies() ? unseenReplyCount() : 1}
          </span>
        </Show>
      </div>

      <div class="mx-3.5 h-px bg-rim" />
    </>
  );
};

// ── Skeleton loader ───────────────────────────────────────────────────────

const SkeletonRow: Component = () => (
  <div class="px-3.5 py-2 flex items-start gap-2 animate-pulse">
    <div class="w-7 h-7 rounded-full bg-overlay shrink-0" />
    <div class="flex-1 space-y-1.5">
      <div class="h-2.5 bg-overlay rounded w-2/5" />
      <div class="h-2.5 bg-overlay rounded w-4/5" />
    </div>
  </div>
);

// ── Group header ──────────────────────────────────────────────────────────

const GroupHeader: Component<{ label: string; count: number }> = (props) => (
  <div class="sticky top-0 z-10 bg-surface px-3.5 py-1 flex items-center gap-2 border-b border-rim">
    <span class="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
      {props.label}
    </span>
    <div class="flex-1 h-px bg-rim" />
    <span class="text-[0.625rem] text-muted tabular-nums">{props.count}</span>
  </div>
);

// ── Message list ──────────────────────────────────────────────────────────

// Shared list/fetch/render logic for a single message feed — grouped by time
// band, paginated via infinite scroll. Reused by HqMessagesWidget.tsx (the
// message/direct/starred/notices cards) and by FolderMessagesModal.tsx (the
// per-folder message list opened from HqFoldersWidget.tsx).
//
// Everything mail-like (`actions`, `selectable`, `preview`) is opt-in and only
// the inbox turns it on; with the flags off this renders exactly as it did
// before those features existed.
export const MessageList: Component<{
  type: FeedType;
  file?: string;
  authorFilter?: string;
  /** Restrict the feed to threads involving this xchan hash. */
  xchan?: string;
  // Bumped by the parent's refresh button to force a reload without
  // changing type/file (which already trigger a reset on their own).
  reloadKey?: number;
  onRefreshingChange?: (refreshing: boolean) => void;
  /** Inbox: per-row star/trash/file/read buttons, swipe, drag-to-folder. */
  actions?: boolean;
  /** Inbox: checkboxes, bulk bar and keyboard navigation. */
  selectable?: boolean;
  /** Folder names offered by the move menu (from /spa/folders). */
  folders?: string[];
  /** Inbox chip: threads with anything unseen in them. */
  unread?: boolean;
  /** The shared stream filters from the URL (the sidebar filter widget). */
  filters?: Record<string, string>;
  /** Full-width reader instead of the modal: opening a message covers the
   *  list with the thread plus back / previous / next controls. */
  reader?: boolean;
  /** Lets the inbox's "/" key focus its search box. */
  onFocusSearch?: () => void;
}> = (props) => {
  const { t } = useI18n();
  const [entries, setEntries] = createSignal<MessageEntry[]>([]);
  // b64mid of the entry whose detail modal is open. Kept here (not in
  // MessageItem) so the modal survives the background poll replacing the
  // entry objects and recreating the row components.
  const [openMid, setOpenMid] = createSignal<string | null>(null);
  const [offset, setOffset] = createSignal(0);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [empty, setEmpty] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [cursor, setCursor] = createSignal(-1);
  // The cursor ring is a keyboard affordance. Opening a message with the mouse
  // still moves the cursor (so previous/next continue from there) but must not
  // paint a ring around the row the pointer just clicked.
  const [cursorVisible, setCursorVisible] = createSignal(false);

  const filtered = () =>
    !!(props.authorFilter ?? "").trim() || props.unread
    || Object.keys(props.filters ?? {}).length > 0;

  let scrollRef: HTMLDivElement | undefined;
  let resetController: AbortController | null = null;
  let loadMoreActive = false;
  let lastClicked: string | null = null;
  const rowEls = new Map<string, HTMLElement>();

  // ── mail actions ────────────────────────────────────────────────────────

  const patch: PatchFn = (b64mid, partial) =>
    setEntries((prev) => prev.map((e) => (e.b64mid === b64mid ? { ...e, ...partial } : e)));

  const acts = createInboxActions(t, patch);
  const currentFolder = () => (props.type === "folder" ? props.file ?? "" : undefined);
  // Notices come from the notify table, not from item — there is no mid to
  // star, file or mark unread, so the mail chrome stays off for that feed.
  const mailable = () => !!props.actions && props.type !== "notification";

  const rowActions = (): RowActions => ({
    star: (e) => void acts.star(e),
    trash: (e) => void acts.trash(e),
    restore: (e) => void acts.untrash(e),
    toggleRead: (e) => void acts.setRead(e, isEntryUnseen(e)),
    move: (e, folder) => void acts.moveToFolder(e, folder, currentFolder()),
    folders: props.folders ?? [],
  });

  const drag = createRowDrag({
    onDropFolder: (name, id) => {
      const targets = selected().has(id) ? selectedEntries() : visible().filter((e) => e.b64mid === id);
      void acts.bulk(targets, (e) =>
        name === TRASH ? acts.trash(e) : acts.moveToFolder(e, name, currentFolder()));
      clearSelection();
    },
    onSwipeLeft: (id) => {
      const e = visible().find((x) => x.b64mid === id);
      if (e) void acts.trash(e);
    },
    onSwipeRight: (id) => {
      const e = visible().find((x) => x.b64mid === id);
      if (e) void acts.star(e);
    },
    swipeEnabled: () => mailable() && window.innerWidth < 768,
    describe: (id) => {
      const count = selected().has(id) ? selected().size : 1;
      const e = visible().find((x) => x.b64mid === id);
      return { label: e?.title || e?.author_name || "", count };
    },
  });

  // ── filtering / grouping ────────────────────────────────────────────────

  // An action's effect shows immediately: a trashed row leaves every feed but
  // Trash, a moved row leaves the folder it was filed under. The server applies
  // the same rules on the next fetch.
  const visible = createMemo(() => {
    if (!mailable()) return entries();
    const folder = currentFolder();
    return entries().filter((e) => {
      const f = e.folders;
      if (!f) return true;
      if (folder) return f.includes(folder);
      return !f.includes(TRASH);
    });
  });

  function bucketByTime(list: MessageEntry[]): { label: string; items: MessageEntry[] }[] {
    const buckets: Partial<Record<TimeGroup, MessageEntry[]>> = {};
    for (const entry of list) {
      const g = getTimeGroup(entry.created);
      (buckets[g] ??= []).push(entry);
    }
    return TIME_GROUPS
      .filter((g) => buckets[g]?.length)
      .map((g) => ({ label: g, items: buckets[g]! }));
  }

  // Group entries by time band in stable order — except for direct-message
  // threads, where unread ones are pulled into their own group on top so a
  // new DM doesn't get buried under older-but-still-"Today" threads.
  const groupedEntries = createMemo(() => {
    const all = visible();
    if (props.type !== "direct") return bucketByTime(all);

    const unread = all.filter(isEntryUnseen);
    const rest = all.filter((e) => !isEntryUnseen(e));
    const groups: { label: string; items: MessageEntry[] }[] = [];
    if (unread.length) groups.push({ label: "Unread", items: unread });
    groups.push(...bucketByTime(rest));
    return groups;
  });

  /** Rows in the order they are rendered — what the cursor and shift-select
   *  ranges walk, which is not the order `entries()` is in. */
  const flatRows = createMemo(() => groupedEntries().flatMap((g) => g.items));

  // ── selection ───────────────────────────────────────────────────────────

  const selectedEntries = () => flatRows().filter((e) => selected().has(e.b64mid));
  const clearSelection = () => { setSelected(new Set<string>()); lastClicked = null; };

  function toggleSelect(entry: MessageEntry, shift = false) {
    const rows = flatRows();
    const next = new Set(selected());
    if (shift && lastClicked) {
      const a = rows.findIndex((r) => r.b64mid === lastClicked);
      const b = rows.findIndex((r) => r.b64mid === entry.b64mid);
      if (a >= 0 && b >= 0) {
        for (const r of rows.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(r.b64mid);
        setSelected(next);
        return;
      }
    }
    if (next.has(entry.b64mid)) next.delete(entry.b64mid);
    else next.add(entry.b64mid);
    lastClicked = entry.b64mid;
    setSelected(next);
  }

  function openEntry(entry: MessageEntry) {
    // The click a browser fires after a drag's pointerup must not also open
    // the message that was just filed.
    if (drag.takeDragFlag()) return;
    setOpenMid(entry.b64mid);
    setCursor(flatRows().findIndex((r) => r.b64mid === entry.b64mid));
    setCursorVisible(false);
  }

  // ── reader ──────────────────────────────────────────────────────────────

  const openEntryData = createMemo(() => flatRows().find((e) => e.b64mid === openMid()));
  const openIndex = createMemo(() => flatRows().findIndex((e) => e.b64mid === openMid()));

  function step(delta: number) {
    const rows = flatRows();
    const next = rows[openIndex() + delta];
    if (!next) {
      // Walking off the end pulls the next page rather than dead-ending — the
      // list is paginated, so "last message" usually just means "last loaded".
      if (delta > 0) loadPage();
      return;
    }
    setOpenMid(next.b64mid);
    setCursor(openIndex() + delta);
    if (isEntryUnseen(next)) markItemSeen(next.b64mid);
  }

  // ── keyboard ────────────────────────────────────────────────────────────

  const onKeyDown = createInboxKeys({
    rows: flatRows,
    cursor,
    setCursor: (i) => {
      setCursor(i);
      setCursorVisible(true);
      rowEls.get(flatRows()[i]?.b64mid ?? "")?.scrollIntoView({ block: "nearest" });
    },
    open: openEntry,
    star: (e) => void acts.star(e),
    trash: (e) => void acts.trash(e),
    toggleRead: (e) => void acts.setRead(e, isEntryUnseen(e)),
    toggleSelect: (e) => toggleSelect(e),
    clearSelection,
    focusSearch: props.onFocusSearch,
  });

  // ── fetching ────────────────────────────────────────────────────────────

  async function loadPage(reset = false) {
    if (!reset && loadMoreActive) return;

    let signal: AbortSignal | undefined;

    if (reset) {
      resetController?.abort();
      const ctrl = new AbortController();
      resetController = ctrl;
      signal = ctrl.signal;
      loadMoreActive = false;
      setEmpty(false);
    } else {
      const cur = offset();
      if (cur === -1) return;
      loadMoreActive = true;
    }

    const currentOffset = reset ? 0 : offset();
    setLoading(true);
    if (reset) props.onRefreshingChange?.(true);

    try {
      const feedType = props.type;
      const data = await fetchMessages({
        offset: currentOffset,
        type: feedType === "folder" ? "filed" : feedType,
        file: feedType === "folder" ? (props.file ?? "") : "",
        search: (props.authorFilter ?? "").trim(),
        xchan: props.xchan,
        unread: props.unread,
        filters: props.filters,
        signal,
      });

      if (reset) {
        setEntries(data.entries);
      } else {
        setEntries((prev) => [...prev, ...data.entries]);
      }

      setOffset(data.offset);
      setEmpty(reset && data.entries.length === 0);
      setError(null);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        if (!reset) loadMoreActive = false;
        if (reset) props.onRefreshingChange?.(false);
      }
    }
  }

  createEffect(() => {
    // Track type/file (switching folders — same "folder" type, different
    // file — triggers a reset the same way switching feed type does),
    // reloadKey (bumped by the parent's refresh button), and authorFilter
    // (the search box — filtering is done server-side, see fetchMessages).
    props.type;
    props.file;
    props.reloadKey;
    props.authorFilter;
    props.xchan;
    props.unread;
    props.filters;
    setOffset(0);
    clearSelection();
    setCursor(-1);
    setCursorVisible(false);
    loadPage(true);
  });

  function onScroll() {
    const el = scrollRef;
    if (!el) return;
    if (el.scrollTop > el.scrollHeight - el.clientHeight - el.scrollHeight / 7) {
      loadPage();
    }
  }

  // Same guard as createStreamStore's poll: a background tab polling on
  // forever costs a full request set every tick, and loadPage(true) replaces
  // the entry objects wholesale, so every row — and every <img> in it — is
  // recreated and refetched each time.
  const pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") loadPage(true);
  }, POLL_INTERVAL);
  onCleanup(() => {
    clearInterval(pollTimer);
    resetController?.abort();
  });

  const bulkAll = (fn: (e: MessageEntry) => Promise<unknown>) => {
    const targets = selectedEntries();
    clearSelection();
    void acts.bulk(targets, fn);
  };

  return (
    <div class="flex-1 min-h-0 relative flex flex-col">
    <div
      ref={scrollRef}
      class="flex-1 overflow-y-auto focus:outline-none"
      onScroll={onScroll}
      tabindex={mailable() && props.selectable ? 0 : undefined}
      onKeyDown={mailable() && props.selectable ? onKeyDown : undefined}
    >
      {/* Bulk bar — takes over the top of the list while rows are selected. */}
      <Show when={mailable() && props.selectable && selected().size > 0}>
        <div class="sticky top-0 z-20 flex items-center gap-1 px-3.5 py-1.5 bg-elevated border-b border-rim">
          <span class="text-xs font-medium text-txt mr-1">
            {t("hq.n_selected", { count: String(selected().size) })}
          </span>
          <RowButton
            path={TYPE_ICON_PATH.starred}
            title={t("hq.star_action")}
            onClick={() => bulkAll((e) => acts.star(e, true))}
          />
          <FolderMenu
            folders={props.folders ?? []}
            title={t("hq.move_to_folder")}
            onPick={(name) => bulkAll((e) => acts.moveToFolder(e, name, currentFolder()))}
            class="p-1 rounded-md text-muted hover:text-txt hover:bg-surface transition-colors"
          />
          <RowButton
            path={ENVELOPE_ICON_PATH}
            title={t("hq.mark_read")}
            onClick={() => bulkAll((e) => acts.setRead(e, true))}
          />
          <RowButton
            path={TRASH_ICON_PATH}
            title={t("hq.trash_action")}
            onClick={() => bulkAll((e) => acts.trash(e))}
          />
          <div class="flex-1" />
          <button
            type="button"
            onClick={clearSelection}
            class="text-xs text-muted hover:text-txt px-2 py-1 rounded-md hover:bg-surface"
          >
            {t("hq.clear_selection")}
          </button>
        </div>
      </Show>

      <Show when={error()}>
        <div class="flex flex-col items-center justify-center py-10 gap-2 text-sm">
          <MdOutlineWarning class="text-2xl text-muted" />
          <span class="text-accent">{error()}</span>
          <button
            onClick={() => loadPage(true)}
            class="text-xs text-accent hover:underline mt-1"
          >
            {t("hq.retry")}
          </button>
        </div>
      </Show>

      <Show when={empty() && !loading() && !filtered()}>
        <div class="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted py-16">
          <svg class="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
            />
          </svg>
          <span>{t("hq.no_messages")}</span>
        </div>
      </Show>

      <Show when={empty() && !loading() && filtered()}>
        <div class="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted py-16">
          <MdOutlineSearch class="w-8 h-8 opacity-40" />
          <span>{t("hq.no_filter_matches")}</span>
        </div>
      </Show>

      <Show when={loading() && entries().length === 0}>
        <For each={Array(5)}>{() => <SkeletonRow />}</For>
      </Show>

      {/* Grouped timeline */}
      <For each={groupedEntries()}>
        {(group) => (
          <>
            <GroupHeader label={group.label} count={group.items.length} />
            <For each={group.items}>
              {(entry) => (
                <MessageItem
                  entry={entry}
                  feedType={props.type}
                  onOpen={() => openEntry(entry)}
                  actions={mailable() ? rowActions() : undefined}
                  selectable={props.selectable}
                  selected={selected().has(entry.b64mid)}
                  onToggleSelect={(shift) => toggleSelect(entry, shift)}
                  cursored={cursorVisible() && flatRows()[cursor()]?.b64mid === entry.b64mid}
                  active={openMid() === entry.b64mid}
                  dragging={drag.draggingId() === entry.b64mid}
                  swipeDx={drag.swipeOffset(entry.b64mid)}
                  onPointerDown={mailable() ? drag.onRowPointerDown(entry.b64mid) : undefined}
                  registerRef={(el) => {
                    rowEls.set(entry.b64mid, el);
                    onCleanup(() => rowEls.delete(entry.b64mid));
                  }}
                />
              )}
            </For>
          </>
        )}
      </For>

      <Show when={loading() && entries().length > 0}>
        <div class="flex items-center justify-center gap-2 py-4 text-xs text-muted">
          <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {t("hq.loading")}
        </div>
      </Show>

      {/* The modal is still how HQ's cards and the folder modal open a
          message; only the inbox swaps it for the reader below. */}
      <Show when={openMid() && !props.reader}>
        <PostDetailModal uuid={openMid()!} onClose={() => setOpenMid(null)} />
      </Show>
    </div>

    {/* Reader. Laid over the list rather than replacing it, so going back
        lands on the same scroll position — a display:none scroll container
        loses scrollTop. */}
    <Show when={props.reader && openMid()}>
      <div
        class="absolute inset-0 z-30 flex flex-col bg-base focus:outline-none"
        tabindex="-1"
        ref={(el) => queueMicrotask(() => el.focus())}
        onKeyDown={(ev) => {
          if (ev.key === "Escape") { setOpenMid(null); ev.preventDefault(); }
          else if (ev.key === "j" || ev.key === "ArrowDown") { step(1); ev.preventDefault(); }
          else if (ev.key === "k" || ev.key === "ArrowUp") { step(-1); ev.preventDefault(); }
        }}
      >
        <div class="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-rim bg-surface">
          <button
            type="button"
            onClick={() => setOpenMid(null)}
            class="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted
                   hover:bg-overlay hover:text-txt transition-colors"
          >
            <MdOutlineChevron_left class="w-4 h-4" />
            {t("hq.back_to_list")}
          </button>

          <Show when={mailable() && openEntryData()}>
            {(entry) => <ActionRail entry={entry()} acts={rowActions()} t={t} class="ml-1" />}
          </Show>

          <div class="flex-1" />

          <span class="text-[0.625rem] text-muted tabular-nums shrink-0">
            {t("hq.n_of_m", { n: String(openIndex() + 1), m: String(flatRows().length) })}
          </span>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={openIndex() <= 0}
            title={t("hq.previous_message")}
            aria-label={t("hq.previous_message")}
            class="p-1 rounded-md text-muted hover:bg-overlay hover:text-txt disabled:opacity-30 transition-colors"
          >
            <MdOutlineExpand_less class="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={openIndex() >= flatRows().length - 1 && offset() === -1}
            title={t("hq.next_message")}
            aria-label={t("hq.next_message")}
            class="p-1 rounded-md text-muted hover:bg-overlay hover:text-txt disabled:opacity-30 transition-colors"
          >
            <MdOutlineExpand_more class="w-4 h-4" />
          </button>
        </div>

        <div class="flex-1 min-h-0">
          <PostDetailModal uuid={openMid()!} inline onClose={() => setOpenMid(null)} />
        </div>
      </div>
    </Show>
    </div>
  );
};
