import { useI18n } from "@utsukta/spa-core/i18n";
import { createSignal, Show, lazy } from "solid-js";
import { MdOutlineEdit, MdOutlineMail, MdOutlineRefresh } from "solid-icons/md";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import PostComposer from "@/shared/editor/composers/PostComposer";
import DMComposer from "@/shared/editor/composers/DMComposer";
import { MessageList, FolderViewToggle, loadFolderViewMode, saveFolderViewMode, type ViewMode } from "./MessageList";

const HqFoldersWidget = lazy(() => import("./HqFoldersWidget"));

// The dashboard's single message card. A vertical tab rail (same rotated
// writing-mode treatment as ChannelActivitiesWidget) switches between the
// three MessageList feeds — all posts, direct messages, notices — and
// "Folders", which combines file-tag folders with a pinned "Starred" entry
// (see HqFoldersWidget.tsx).
//
// Tab ids are MessageList's own feed types, so the active tab passes straight
// through as `type`. Each tab's controls (compose/refresh/filter for the feeds,
// list/grid toggle for folders) share one header row beside the rail.
type Tab = "" | "direct" | "notification" | "folder";

const TABS: { id: Tab; key: string }[] = [
  { id: "", key: "hq.msg_tab_all" },
  { id: "direct", key: "hq.msg_tab_direct" },
  { id: "notification", key: "hq.msg_tab_notices" },
  { id: "folder", key: "hq.msg_tab_folders" },
];

export default function HqMessagesWidget() {
  const { t } = useI18n();
  const auth = useAuth();
  const [tab, setTab] = createSignal<Tab>("");

  const [authorFilter, setAuthorFilter] = createSignal("");
  const [composing, setComposing] = createSignal<"post" | "dm" | null>(null);
  const [reloadKey, setReloadKey] = createSignal(0);
  const [refreshing, setRefreshing] = createSignal(false);
  const [viewMode, setViewMode] = createSignal<ViewMode>(loadFolderViewMode());

  let filterTimer: ReturnType<typeof setTimeout>;
  function onFilterInput(val: string) {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => setAuthorFilter(val), 300);
  }

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    saveFolderViewMode(mode);
  }

  const isFeed = () => tab() !== "folder";
  const canCompose = () => !auth.loading && !!auth()?.uid;

  return (
    <div
      data-tour="hq.messages"
      class="bg-surface rounded-2xl border border-rim flex flex-col overflow-hidden shadow-sm"
      style={{ "max-height": "480px" }}
    >
      {/* Header spans the full card width, above the rail — compose actions
          on the left, per-tab controls on the right. */}
      <div class="px-2.5 py-2 shrink-0 flex items-center justify-between gap-2 border-b border-rim">
        <div class="flex items-center gap-1 shrink-0">
          <Show when={canCompose()}>
            <button
              type="button"
              title={t("hq.new_post")}
              onClick={() => setComposing("post")}
              class="w-6 h-6 flex items-center justify-center rounded-md text-muted
                     hover:bg-overlay hover:text-txt transition-colors"
            >
              <MdOutlineEdit size={14} />
            </button>
            <button
              type="button"
              title={t("hq.new_dm")}
              onClick={() => setComposing("dm")}
              class="w-6 h-6 flex items-center justify-center rounded-md text-muted
                     hover:bg-overlay hover:text-txt transition-colors"
            >
              <MdOutlineMail size={14} />
            </button>
          </Show>
        </div>

        <div class="flex items-center gap-1 min-w-0">
          <Show when={isFeed()} fallback={<FolderViewToggle mode={viewMode()} onChange={changeViewMode} />}>
            <div class="relative min-w-0">
              <svg
                class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder={t("hq.filter_placeholder")}
                class="w-24 text-xs bg-overlay border-0 rounded-lg
                       pl-7 pr-3 py-1 text-txt placeholder-muted
                       focus:outline-none focus:ring-2 focus:ring-accent/40
                       transition-all duration-200 focus:w-32"
                onInput={(e) => onFilterInput(e.currentTarget.value)}
              />
            </div>

            <button
              type="button"
              title={t("hq.refresh")}
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={refreshing()}
              class="w-6 h-6 flex items-center justify-center rounded-md text-muted
                     hover:bg-overlay hover:text-txt transition-colors disabled:opacity-50 shrink-0"
            >
              <MdOutlineRefresh size={14} class={refreshing() ? "animate-spin" : ""} />
            </button>
          </Show>
        </div>
      </div>

      <div class="flex-1 flex min-h-0 overflow-hidden">
        {/* Vertical rail — labels rotated with writing-mode so four tabs fit a
            single masonry cell. */}
        <div
          role="tablist"
          class="flex flex-col shrink-0 border-r border-rim bg-elevated"
        >
          {TABS.map((tb) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === tb.id}
              data-tour={tb.id === "direct" ? "hq.messages.direct" : undefined}
              onClick={() => setTab(tb.id)}
              class="[writing-mode:vertical-rl] rotate-180 px-1.5 py-3
                     text-[0.6875rem] font-medium uppercase tracking-wider
                     transition-colors"
              classList={{
                "text-txt bg-surface": tab() === tb.id,
                "text-muted hover:text-txt": tab() !== tb.id,
              }}
            >
              {t(tb.key as "hq.msg_tab_all")}
            </button>
          ))}
        </div>

        <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
          <Show
            when={isFeed()}
            fallback={<HqFoldersWidget viewMode={viewMode()} />}
          >
            <MessageList
              type={tab() as Exclude<Tab, "folder">}
              authorFilter={authorFilter()}
              reloadKey={reloadKey()}
              onRefreshingChange={setRefreshing}
            />
          </Show>
        </div>
      </div>

      <Show when={composing() === "post"}>
        <PostComposer
          profileUid={auth()!.uid}
          open={true}
          onPosted={() => setComposing(null)}
          onClose={() => setComposing(null)}
        />
      </Show>

      <Show when={composing() === "dm"}>
        <DMComposer
          profileUid={auth()!.uid}
          open={true}
          onSent={() => setComposing(null)}
          onClose={() => setComposing(null)}
        />
      </Show>
    </div>
  );
}
