// Mailbox over the local message store: a settings-style section nav (see
// SubPageLayout / SettingsView) listing the feeds and the user's file folders,
// with HQ's message list as the detail pane. The list reads through
// message-store.ts, so it renders from IndexedDB when there's no network.
//
// The list does the mail behaviour itself (star/trash/file, selection, keys,
// drag, and the full-width reader) - see MessageList's `actions`/`selectable`/
// `reader` props. This view owns the chrome around it: the feed + folder
// sidebar (which doubles as the drag-and-drop target list), InboxSearchBar,
// and Empty Trash.
import { createSignal, createMemo, onMount, onCleanup, type Component } from "solid-js";
import { Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useLocation } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useOnlineStatus } from "@utsukta/spa-core/lib/useOnlineStatus";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { syncInbox, setInboxActive } from "@utsukta/spa-core/lib/message-store";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { toast } from "@utsukta/spa-core/store/toast";
import SubPageLayout, { type SubPageItem } from "@/shared/views/SubPageLayout";
import { TRASH, emptyFolder } from "../actions";
import { parseQuery } from "../query";
import InboxSearchBar from "../InboxSearchBar";
import { dragPreview, hoverFolder, registerDropTarget } from "../useDragToFolder";
import {
  MessageList,
  TYPE_ICON_PATH,
  FOLDER_ICON_PATH,
  FEED_META,
  type FeedType,
  type MessageType,
} from "@/modules/hq/widgets/MessageList";

const FOLDER_PREFIX = "folder/";

const TRASH_ICON =
  "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";

// Section key → the feed the message list should show. Keys are URL segments
// under /inbox; folders get their own "folder/<name>" keys built at runtime.
const FEED_SECTIONS: { key: string; type: MessageType }[] = [
  { key: "all", type: "" },
  { key: "direct", type: "direct" },
  { key: "starred", type: "starred" },
  { key: "notices", type: "notification" },
];

interface FolderCount { name: string; count: number; unread: number }
interface FolderData { folders: FolderCount[]; unread_all: number; unread_direct: number }

// counts=1 also carries the per-feed unread totals in `meta`, so the whole
// sidebar - folders and feeds - is one request.
async function fetchFolderCounts(): Promise<FolderData> {
  const res = await apiFetch("/spa/folders?counts=1");
  if (!res.ok) return { folders: [], unread_all: 0, unread_direct: 0 };
  const { data, meta } = await res.json();
  return {
    folders: Array.isArray(data) ? data : [],
    unread_all: meta?.unread_all ?? 0,
    unread_direct: meta?.unread_direct ?? 0,
  };
}

const Icon: Component<{ path: string }> = (props) => (
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d={props.path} />
  </svg>
);

const Badge: Component<{ n: number }> = (props) => (
  <Show when={props.n > 0}>
    <span class="shrink-0 min-w-[1.25rem] px-1 h-5 rounded-full bg-accent text-surface
                 text-[0.625rem] font-bold flex items-center justify-center tabular-nums">
      {props.n}
    </span>
  </Show>
);

export default function InboxView() {
  const { t } = useI18n();
  const location = useLocation();
  const online = useOnlineStatus();

  // One string holds the whole filter state — `from:alice is:unread words` —
  // so the box always shows exactly what the list is filtered by, and the pills
  // below are just shortcuts for editing it.
  const [query, setQuery] = createSignal("");
  const [reloadKey, setReloadKey] = createSignal(0);
  const parsed = createMemo(() => parseQuery(query()));
  // `author` and `unread` are MessageList's own props (HQ's cards use the first
  // and the second is thread-aware); everything else rides through as filters.
  const filters = createMemo(() => {
    const { author: _a, unread: _u, ...rest } = parsed().params;
    return rest;
  });
  let searchRef: HTMLInputElement | undefined;

  const [folderData, { refetch: refetchFolders }] = createQueryResource<FolderData>(
    "inbox-folders",
    fetchFolderCounts,
    { initialValue: { folders: [], unread_all: 0, unread_direct: 0 } },
  );

  const folderNames = createMemo(() => (folderData()?.folders ?? []).map((f) => f.name));

  // Syncing a large mailbox is minutes of background requests, so it belongs
  // to this module alone: it starts when the inbox is opened and the flag stops
  // body warming again as soon as you navigate away. syncInbox itself throttles
  // repeat runs, so moving between sections doesn't re-walk every feed.
  onMount(() => {
    setInboxActive(true);
    void syncInbox();
  });
  onCleanup(() => setInboxActive(false));

  const activeKey = createMemo(
    () => location.pathname.replace(/^\/inbox\/?/, "").replace(/\/$/, "") || "all",
  );

  const selection = createMemo<{ type: FeedType; file: string }>(() => {
    const key = activeKey();
    if (key.startsWith(FOLDER_PREFIX))
      return { type: "folder", file: decodeURIComponent(key.slice(FOLDER_PREFIX.length)) };
    return { type: FEED_SECTIONS.find((s) => s.key === key)?.type ?? "", file: "" };
  });

  const feedBadge = (type: MessageType) =>
    type === "" ? folderData()?.unread_all ?? 0
    : type === "direct" ? folderData()?.unread_direct ?? 0
    : 0;

  const items = createMemo<SubPageItem[]>(() => [
    ...FEED_SECTIONS.map((s, i) => ({
      path: s.key,
      label: () =>
        t((s.type === "" ? "hq.inbox_feed" : FEED_META[s.type].titleKey) as Parameters<typeof t>[0]) as string,
      icon: <Icon path={TYPE_ICON_PATH[s.type]} />,
      trailing: <Badge n={feedBadge(s.type)} />,
      dividerAfter: i === FEED_SECTIONS.length - 1,
    })),
    ...(folderData()?.folders ?? []).map((f) => ({
      path: `${FOLDER_PREFIX}${encodeURIComponent(f.name)}`,
      label: f.name,
      icon: <Icon path={f.name === TRASH ? TRASH_ICON : FOLDER_ICON_PATH} />,
      trailing: <Badge n={f.unread} />,
      // Outlined while a drag is in flight, filled once the pointer is over it -
      // without that there is no way to tell where a message would land.
      highlight: hoverFolder() === f.name,
      dropTarget: !!dragPreview(),
      // Registers the row as a drop target, so a message can be dragged from
      // the list straight onto the folder.
      ref: (el: HTMLElement) => onCleanup(registerDropTarget(f.name, el)),
    })),
  ]);

  const [emptying, setEmptying] = createSignal(false);
  const trashCount = () =>
    (folderData()?.folders ?? []).find((f) => f.name === TRASH)?.count ?? 0;

  async function doEmptyTrash() {
    const n = trashCount();
    // Irreversible and bulk — confirm, the same way the files module does.
    if (!confirm(t("hq.empty_trash_confirm", { count: String(n) }) as string)) return;
    setEmptying(true);
    try {
      const deleted = await emptyFolder(TRASH);
      toast.success(t("hq.emptied_trash", { count: String(deleted) }) as string);
    } finally {
      setEmptying(false);
      refresh();
    }
  }

  function refresh() {
    void syncInbox(true);
    void refetchFolders();
    setReloadKey((n) => n + 1);
  }

  return (
    <SubPageLayout
      base="/inbox"
      items={items()}
      activeKey={activeKey()}
      contentClass="flex-1 min-w-0 flex flex-col"
    >
      {/* Bounded height: MessageList scrolls its own body and paginates on
          scroll, so it needs a container that doesn't grow with its content.
          Kept as tall as the chrome allows — the reader fills this same box. */}
      <div class="flex flex-col h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8rem)] min-h-[20rem]">
        <InboxSearchBar
          query={query()}
          onQuery={setQuery}
          folders={folderNames()}
          inputRef={(el) => (searchRef = el)}
          actions={
            <>
              <Show when={!online()}>
                <span class="shrink-0 text-[0.625rem] px-1.5 py-0.5 rounded-md bg-overlay text-muted">
                  {t("layout.offline")}
                </span>
              </Show>

              <Show when={selection().file === TRASH}>
                <button
                  type="button"
                  onClick={() => void doEmptyTrash()}
                  disabled={emptying() || trashCount() === 0}
                  class="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                         bg-overlay text-muted hover:bg-elevated hover:text-red-500
                         disabled:opacity-40 disabled:hover:bg-overlay disabled:hover:text-muted"
                >
                  {emptying() ? t("hq.emptying") : t("hq.empty_trash")}
                </button>
              </Show>

              <button
                type="button"
                onClick={refresh}
                title={t("hq.refresh")}
                class="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted hover:bg-overlay hover:text-txt"
              >
                <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </button>
            </>
          }
        />

        <MessageList
          type={selection().type}
          file={selection().file}
          authorFilter={parsed().params.author ?? ""}
          reloadKey={reloadKey()}
          actions
          selectable
          reader
          folders={folderNames()}
          unread={parsed().params.unread === "1"}
          filters={filters()}
          onFocusSearch={() => searchRef?.focus()}
        />

        <p class="hidden md:block shrink-0 px-3.5 py-1 text-[0.625rem] text-muted border-t border-rim truncate">
          {t("hq.shortcuts_hint")}
        </p>

        {/* Drag chip. Portalled so the list's own overflow can't clip it, and
            pointer-events-none so it never becomes the drop target itself. */}
        <Show when={dragPreview()}>
          {(d) => (
            <Portal>
              <div
                class="fixed z-[60] pointer-events-none px-2.5 py-1.5 rounded-lg shadow-xl
                       bg-accent text-accent-fg text-xs font-medium max-w-[14rem] truncate"
                style={{ left: `${d().x + 12}px`, top: `${d().y + 12}px` }}
              >
                {d().count > 1 ? t("hq.n_selected", { count: String(d().count) }) : d().label}
              </div>
            </Portal>
          )}
        </Show>
      </div>
    </SubPageLayout>
  );
}
