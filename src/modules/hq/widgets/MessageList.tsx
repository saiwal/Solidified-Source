import { markItemSeen } from '@utsukta/spa-core/lib/markSeen';
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineWarning } from "solid-icons/md";
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

// Unseen top-level post, or unseen replies to a seen one — ignores the
// per-item "locallyRead" click state, which only matters for rendering.
function isEntryUnseen(e: MessageEntry): boolean {
  if (e.unseen_class === "primary") return true;
  const n = Number(e.unseen_count);
  return Number.isFinite(n) && n > 0;
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
const FOLDER_VIEW_MODE_KEY = "hz-hq-folder-view";

export function loadFolderViewMode(): ViewMode {
  return localStorage.getItem(FOLDER_VIEW_MODE_KEY) === "grid" ? "grid" : "list";
}

export function saveFolderViewMode(mode: ViewMode): void {
  localStorage.setItem(FOLDER_VIEW_MODE_KEY, mode);
}

const ListIcon: Component<{ class?: string }> = (props) => (
  <svg class={props.class} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M4 6h16M4 12h16M4 18h16"
    />
  </svg>
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

// ── Message item ──────────────────────────────────────────────────────────

const MessageItem: Component<{
  entry: MessageEntry;
  feedType: FeedType;
  // Modal state lives in MessageList — the background poll replaces entry
  // objects wholesale, which disposes/recreates every MessageItem, so any
  // local "modal open" signal here would reset and close an open modal.
  onOpen: () => void;
}> = (props) => {
  const e = props.entry;
  const [locallyRead, setLocallyRead] = createSignal(false);

  // unseen_count is a real number when there are unseen replies, but a
  // non-numeric placeholder otherwise — normalize before comparing.
  const unseenReplyCount = () => {
    const n = Number(e.unseen_count);
    return Number.isFinite(n) ? n : 0;
  };
  const hasUnseenReplies = () => !locallyRead() && unseenReplyCount() > 0;
  const isAnyUnseen = () => !locallyRead() && isEntryUnseen(e);


  function handleClick() {
    props.onOpen();
    if (!locallyRead() && isAnyUnseen()) {
      setLocallyRead(true);
      markItemSeen(e.b64mid);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        class={`
          w-full text-left px-3.5 py-2 flex items-start gap-2
          transition-all duration-150 relative
          hover:bg-overlay
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent
          ${isAnyUnseen() ? "bg-accent-muted" : ""}
        `}
      >
        {/* Type color rail — always shown, full opacity when unseen */}
        <span
          class="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full transition-opacity duration-200"
          style={{
            opacity: isAnyUnseen() ? "1" : "0.3",
          }}
        />

        <Avatar src={e.author_img} name={e.author_name} size="w-7 h-7" />

        <div class="flex-1 min-w-0">
          <div class="flex items-baseline justify-between gap-2">
            <div class="flex items-center gap-1 min-w-0">
              <span
                class={`text-[0.8125rem] truncate leading-snug ${
                  isAnyUnseen() ? "font-semibold text-txt" : "font-medium text-txt"
                }`}
              >
                {e.author_name}
              </span>
            </div>
            <time class="text-[0.625rem] text-muted shrink-0 tabular-nums">
              {timeAgo(e.created)}
            </time>
          </div>

          <Show when={e.title}>
            <p
              class={`text-xs line-clamp-1 leading-snug ${
                isAnyUnseen() ? "font-semibold text-txt" : "text-txt"
              }`}
            >
              {decodeHtmlEntities(e.title!)}
            </p>
          </Show>

          <Show when={e.summary}>
            <p class="text-xs text-muted line-clamp-1 leading-snug">
              {decodeHtmlEntities(e.summary)}
            </p>
          </Show>

          <Show when={e.info && props.feedType !== "direct"}>
            <div class="flex flex-wrap gap-1 mt-0.5">
              <For each={parseFolderNames(e.info)}>
                {(name) => (
                  <span class="inline-flex items-center gap-1 py-0.5 rounded-md italic text-[0.625rem] text-muted font-medium">
                    <span class="truncate max-w-[200px]">{name}</span>
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>

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
      </button>

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

  let scrollRef: HTMLDivElement | undefined;
  let resetController: AbortController | null = null;
  let loadMoreActive = false;

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
    const all = entries();
    if (props.type !== "direct") return bucketByTime(all);

    const unread = all.filter(isEntryUnseen);
    const rest = all.filter((e) => !isEntryUnseen(e));
    const groups: { label: string; items: MessageEntry[] }[] = [];
    if (unread.length) groups.push({ label: "Unread", items: unread });
    groups.push(...bucketByTime(rest));
    return groups;
  });

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
    setOffset(0);
    loadPage(true);
  });

  function onScroll() {
    const el = scrollRef;
    if (!el) return;
    if (el.scrollTop > el.scrollHeight - el.clientHeight - el.scrollHeight / 7) {
      loadPage();
    }
  }

  const pollTimer = setInterval(() => loadPage(true), POLL_INTERVAL);
  onCleanup(() => {
    clearInterval(pollTimer);
    resetController?.abort();
  });

  return (
    <div ref={scrollRef} class="flex-1 overflow-y-auto" onScroll={onScroll}>
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

      <Show when={empty() && !loading() && !(props.authorFilter ?? "").trim()}>
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

      <Show when={empty() && !loading() && (props.authorFilter ?? "").trim()}>
        <div class="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted py-16">
          <svg class="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
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
                  onOpen={() => setOpenMid(entry.b64mid)}
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

      <Show when={openMid()}>
        <PostDetailModal uuid={openMid()!} onClose={() => setOpenMid(null)} />
      </Show>
    </div>
  );
};
