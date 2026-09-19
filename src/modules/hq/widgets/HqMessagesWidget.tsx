import { useI18n } from "@utsukta/spa-core/i18n";
import { openComposer } from "@/shared/editor/store/composer-host";
import { createSignal, Show, lazy } from "solid-js";
import { MdOutlineEdit, MdOutlineMail, MdOutlineRefresh, MdOutlineSearch } from "solid-icons/md";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { MessageList, FolderViewToggle, folderViewMode, setFolderViewMode } from "./MessageList";
import { TABS, type Tab } from "./MessageTabs";

const HqFoldersWidget = lazy(() => import("./HqFoldersWidget"));

// The dashboard's single message card. A vertical tab rail (same rotated
// writing-mode treatment as ChannelActivitiesWidget) switches between the
// three MessageList feeds — all posts, direct messages, notices — and
// "Folders", which combines file-tag folders with a pinned "Starred" entry
// (see HqFoldersWidget.tsx).
//
// Tab ids live in MessageTabs.ts, shared with the widget's config form; the
// opening tab comes from that config and is not remembered across reloads.
//
// Each tab's controls (compose/refresh/filter for the feeds, list/grid toggle
// for folders) share one header row beside the rail.

export default function HqMessagesWidget(props: { config?: Record<string, unknown> }) {
  const { t } = useI18n();
  const auth = useAuth();
  const [tab, setTab] = createSignal<Tab>((props.config?.tab as Tab) ?? "");

  const [authorFilter, setAuthorFilter] = createSignal("");
  const compose = (kind: "post" | "dm") =>
    openComposer({
      kind,
      scope: kind === "post" ? "post:new" : "dm:new",
      title: kind === "post" ? t("editor.new_post") : t("editor.dm_new_message"),
      props: { profileUid: auth()!.uid },
    });
  const [reloadKey, setReloadKey] = createSignal(0);
  const [refreshing, setRefreshing] = createSignal(false);

  let filterTimer: ReturnType<typeof setTimeout>;
  function onFilterInput(val: string) {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => setAuthorFilter(val), 300);
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
              onClick={() => compose("post")}
              class="w-6 h-6 flex items-center justify-center rounded-md text-muted
                     hover:bg-overlay hover:text-txt transition-colors"
            >
              <MdOutlineEdit size={14} />
            </button>
            <button
              type="button"
              title={t("hq.new_dm")}
              onClick={() => compose("dm")}
              class="w-6 h-6 flex items-center justify-center rounded-md text-muted
                     hover:bg-overlay hover:text-txt transition-colors"
            >
              <MdOutlineMail size={14} />
            </button>
          </Show>
        </div>

        <div class="flex items-center gap-1 min-w-0">
          <Show when={isFeed()} fallback={<FolderViewToggle mode={folderViewMode()} onChange={setFolderViewMode} />}>
            <div class="relative min-w-0">
              <MdOutlineSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
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
            fallback={<HqFoldersWidget viewMode={folderViewMode()} />}
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
    </div>
  );
}
