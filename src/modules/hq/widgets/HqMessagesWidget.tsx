import { useI18n } from "@utsukta/spa-core/i18n";
import { createEffect, createSignal, For, Show, lazy } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { MdOutlineClose, MdOutlineRefresh, MdOutlineSearch } from "solid-icons/md";
import { useFloating } from "@utsukta/spa-core/lib/useFloating";
import { useConnectionSearch } from "@/shared/editor/components/useConnectionSearch";
import type { AclEntry } from "@/modules/network/api";
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
// The connection filter (core's `#messages-author` name_autocomplete) sits
// pinned above the list and applies to all three feeds. Like core, the
// selected connection filters the item feeds by xchan hash, while notices —
// rows in `notify`, which has no xchan — fall back to the name/address match
// (`author`, see HqMessages::sendNotices).

function ConnectionFilter(props: { value: AclEntry | null; onChange: (c: AclEntry | null) => void }) {
  const { t } = useI18n();
  const [focused, setFocused] = createSignal(false);
  const search = useConnectionSearch("a", { initialCount: 8, searchCount: 20 });

  const open = () => focused() && search.list().length > 0;

  let rowRef: HTMLDivElement | undefined;
  let listRef: HTMLUListElement | undefined;
  const { x, y, mount, unmount } = useFloating({ placement: "bottom-start", offset: 4 });
  createEffect(() => {
    if (open() && rowRef && listRef) mount(rowRef, listRef);
    else unmount();
  });

  return (
    <div ref={rowRef} class="px-2.5 py-1.5 shrink-0 border-b border-rim">
      <Show
        when={props.value}
        fallback={
          <div class="relative">
            <MdOutlineSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
            <input
              type="text"
              value={search.query()}
              placeholder={t("hq.filter_placeholder")}
              onInput={(e) => search.setQuery(e.currentTarget.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              class="w-full text-xs bg-overlay border-0 rounded-lg pl-7 pr-3 py-1 text-txt
                     placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        }
      >
        {(c) => (
          <span class="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs bg-elevated text-txt w-fit max-w-full">
            <Show
              when={c().photo}
              fallback={
                <span class="w-4 h-4 rounded-full shrink-0 bg-accent-muted text-accent flex items-center justify-center text-[0.5625rem] font-semibold">
                  {c().name[0]?.toUpperCase() ?? "?"}
                </span>
              }
            >
              <img src={c().photo} alt="" class="w-4 h-4 rounded-full shrink-0 object-cover" />
            </Show>
            <span class="truncate">{c().name}</span>
            <button
              type="button"
              onClick={() => { search.setQuery(""); props.onChange(null); }}
              class="text-muted hover:text-txt leading-none shrink-0"
            >
              <MdOutlineClose size={12} />
            </button>
          </span>
        )}
      </Show>

      <Portal mount={topLayer()}>
        <Show when={open()}>
          <ul
            ref={listRef}
            style={{ position: "fixed", top: `${y()}px`, left: `${x()}px`, width: `${rowRef?.offsetWidth ?? 0}px` }}
            class="z-[60] max-h-56 overflow-y-auto rounded-lg border border-rim bg-surface shadow-xl py-1"
          >
            <For each={search.list()}>
              {(c) => (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); props.onChange(c); setFocused(false); }}
                    class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-elevated transition-colors"
                  >
                    <Show
                      when={c.photo}
                      fallback={
                        <span class="w-6 h-6 rounded-full shrink-0 bg-elevated flex items-center justify-center text-muted text-xs font-semibold">
                          {c.name[0]?.toUpperCase() ?? "?"}
                        </span>
                      }
                    >
                      <img src={c.photo} alt="" class="w-6 h-6 rounded-full shrink-0 object-cover bg-elevated" />
                    </Show>
                    <span class="flex flex-col min-w-0 flex-1">
                      <span class="truncate text-xs font-medium text-txt">{c.name}</span>
                      <Show when={c.link}>
                        <span class="truncate text-[0.625rem] text-muted">{c.link}</span>
                      </Show>
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Portal>
    </div>
  );
}

export default function HqMessagesWidget(props: { config?: Record<string, unknown> }) {
  const { t } = useI18n();
  const [tab, setTab] = createSignal<Tab>((props.config?.tab as Tab) ?? "");
  const [conn, setConn] = createSignal<AclEntry | null>(null);
  const [reloadKey, setReloadKey] = createSignal(0);
  const [refreshing, setRefreshing] = createSignal(false);

  const isFeed = () => tab() !== "folder";
  const isNotices = () => tab() === "notification";

  return (
    <div
      data-tour="hq.messages"
      class="bg-surface rounded-2xl border border-rim flex flex-col overflow-hidden shadow-sm"
      style={{ "max-height": "480px" }}
    >
      <div class="px-2.5 py-2 shrink-0 flex items-center justify-between gap-2 border-b border-rim">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-muted truncate">
          {t("hq.messages")}
        </h3>
        <Show when={isFeed()} fallback={<FolderViewToggle mode={folderViewMode()} onChange={setFolderViewMode} />}>
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
            <ConnectionFilter value={conn()} onChange={setConn} />
            <MessageList
              type={tab() as Exclude<Tab, "folder">}
              authorFilter={isNotices() ? conn()?.name ?? "" : ""}
              xchan={isNotices() ? undefined : conn()?.xid}
              reloadKey={reloadKey()}
              onRefreshingChange={setRefreshing}
            />
          </Show>
        </div>
      </div>
    </div>
  );
}
