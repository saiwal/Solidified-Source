import { Show, createEffect, onCleanup, onMount, createSignal, Switch, Match, For } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  threads,
  posts,
  loading,
  hasMore,
  disabled,
  meta,
  loadPubstream,
  loadMore,
  optimisticLike,
  optimisticRepeat,
  removePost,
  viewMode,
  changeView,
} from "../store";
import { apiDeleteItem } from "@utsukta/spa-core/lib/item-api";
import { MasonryPlaceholder } from "@/shared/stream/feedviews/MasonryView";
import { ListPlaceholder } from "@/shared/stream/feedviews/ListView";
import { FeedPlaceholder } from "@/shared/stream/feedviews/FeedView";
import { TimelinePlaceholder } from "@/shared/stream/feedviews/TimelineView";
import StreamList from "@/shared/stream/feedviews/StreamList";
import { ViewSwitcher } from "@/shared/stream/filters";
import type { StreamHandlers } from "@/shared/stream/types";
import { toggleVerb, repeatItem } from "@/shared/stream/store/actions-store";
import { MdFillPublic, MdFillSearch, MdFillClose } from "solid-icons/md";
import { useScrollStyle } from "@utsukta/spa-core/store/scroll-style";

// ── iid lookup from the pubstream flat posts signal ────────────────────────
function iidForMid(mid: string): number {
  const found = posts().find((p) => p.mid === mid || p.uuid === mid);
  return found?.iid ?? 0;
}

// ── Handlers ───────────────────────────────────────────────────────────────
function usePubstreamHandlers(tag: () => string): StreamHandlers {
  return {
    onLike(mid: string) {
      const iid = iidForMid(mid);
      optimisticLike(mid);
      toggleVerb(iid, "like").catch(() => optimisticLike(mid));
    },
    onDislike(_mid: string) {},
    onRepeat(mid: string) {
      const iid = iidForMid(mid);
      const node = posts().find((p) => p.mid === mid || p.uuid === mid);
      if (!node || node.viewerRepeated) return;
      optimisticRepeat(mid);
      repeatItem(iid).catch(() => optimisticRepeat(mid));
    },
    onComment(_parentMid, _body, _name, _avatar) {
      loadPubstream(tag() || undefined);
    },
    onLoadComments: (_mid, _uuid) => Promise.resolve(),
    onDelete(mid: string) {
      const node = posts().find((p) => p.mid === mid || p.uuid === mid);
      if (!node) return Promise.resolve();
      return apiDeleteItem(node.uuid).then(() => removePost(mid));
    },
  };
}

const ICON_BTN =
  "p-1.5 rounded-lg border border-rim bg-surface text-muted " +
  "hover:bg-elevated hover:text-txt transition-colors shrink-0 " +
  "flex items-center justify-center";

export default function PubstreamContentWidget() {
  const { t } = useI18n();
  const [tag, setTag] = createSignal("");
  const [searchOpen, setSearchOpen] = createSignal(false);
  const handlers = usePubstreamHandlers(tag);
  const scrollStyle = useScrollStyle();
  let sentinel!: HTMLDivElement;
  let searchInputRef: HTMLInputElement | undefined;

  onMount(() => {
    if (threads().length === 0) loadPubstream();
  });

  let tagInitialized = false;
  createEffect(() => {
    const currentTag = tag();
    if (!tagInitialized) { tagInitialized = true; return; }
    loadPubstream(currentTag || undefined);
  });

  createEffect(() => {
    if (scrollStyle() !== "endless") return;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(tag() || undefined); },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    onCleanup(() => observer.disconnect());
  });

  function openSearch() {
    setSearchOpen(true);
    setTimeout(() => searchInputRef?.focus(), 0);
  }

  function clearTag() {
    setTag("");
    setSearchOpen(false);
  }

  function onSearchBlur() {
    if (!tag()) setTimeout(() => setSearchOpen(false), 150);
  }

  return (
    <Show
      when={!disabled()}
      fallback={
        <div class="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <MdFillPublic size={40} class="text-muted" />
          <p class="text-txt font-semibold">{t("pubstream.unavailable")}</p>
          <p class="text-sm text-muted max-w-xs">{t("pubstream.unavailable_desc")}</p>
        </div>
      }
    >
      <div>
        {/* Single toolbar row */}
        <div class="grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr] items-center gap-1 mb-4 max-w-5xl mx-auto">

          {/* Left: title + firehose badge */}
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold shrink-0">{t("pubstream.title")}</h1>
            <Show when={meta()?.firehose}>
              <span class="text-xs text-muted border border-rim rounded-full px-2 py-0.5">
                {t("pubstream.firehose")}
              </span>
            </Show>
          </div>

          {/* Center: view switcher */}
          <div class="order-3 sm:order-none col-span-2 sm:col-span-1 flex justify-center">
            <ViewSwitcher viewMode={viewMode()} onChange={changeView} />
          </div>

          {/* Right: collapsible tag search */}
          <div class="flex items-center justify-end gap-1">
            <Show when={tag()}>
              <span class="text-xs text-accent font-medium">#{tag()}</span>
            </Show>
            <Show
              when={searchOpen() || !!tag()}
              fallback={
                <button onClick={openSearch} title={t("pubstream.filter_by_tag")} class={ICON_BTN}>
                  <MdFillSearch size={15} />
                </button>
              }
            >
              <div class="flex items-center gap-1">
                <span class="text-muted text-sm shrink-0">#</span>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={tag()}
                  onInput={(e) => setTag(e.currentTarget.value.trim())}
                  onKeyDown={(e) => e.key === "Enter" && setSearchOpen(false)}
                  onBlur={onSearchBlur}
                  placeholder={t("pubstream.filter_by_tag")}
                  class="h-8 w-28 sm:w-36 text-sm border border-rim rounded-lg bg-surface
                         text-txt placeholder:text-muted px-2.5 py-1.5
                         focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
                />
                <Show when={tag()}>
                  <button onClick={clearTag} title={t("pubstream.clear")} class={ICON_BTN}>
                    <MdFillClose size={13} />
                  </button>
                </Show>
              </div>
            </Show>
          </div>
        </div>

        {/* Initial skeleton */}
        <Show
          when={!loading() || threads().length > 0}
          fallback={
            <Switch>
              <Match when={viewMode() === "list"}>
                <ListPlaceholder count={8} />
              </Match>
              <Match when={viewMode() === "masonry"}>
                <MasonryPlaceholder count={12} />
              </Match>
              <Match when={viewMode() === "timeline"}>
                <TimelinePlaceholder />
              </Match>
              <Match when={true}>
                <For each={Array(5).fill(0)}>{() => <FeedPlaceholder />}</For>
              </Match>
            </Switch>
          }
        >
          <StreamList
            posts={threads()}
            viewMode={viewMode()}
            handlers={handlers}
            appendingCount={
              loading() && threads().length > 0 && viewMode() === "masonry"
                ? 3
                : undefined
            }
          />
        </Show>

        {/* Append skeleton while loading more */}
        <Show
          when={
            loading() && threads().length > 0 && viewMode() !== "masonry"
          }
        >
          <Switch>
            <Match when={viewMode() === "list"}>
              <ListPlaceholder count={3} />
            </Match>
            <Match when={viewMode() === "timeline"}>
              <div class="mt-8">
                <TimelinePlaceholder count={2} />
              </div>
            </Match>
            <Match when={true}>
              <For each={Array(2).fill(0)}>{() => <FeedPlaceholder />}</For>
            </Match>
          </Switch>
        </Show>

        <div ref={sentinel} class="h-1" />

        <Show when={!loading() && hasMore() && threads().length > 0 && scrollStyle() === "load_more"}>
          <div class="flex justify-center mt-6 mb-2">
            <button
              onClick={() => loadMore(tag() || undefined)}
              class="px-6 py-2 rounded-xl border border-rim text-sm text-muted
                     hover:bg-elevated hover:text-txt transition-colors"
            >
              {t("pubstream.load_more")}
            </button>
          </div>
        </Show>

        <Show when={!loading() && !hasMore() && threads().length > 0}>
          <p class="text-center text-xs text-muted mt-6 mb-2">
            {t("pubstream.end_of_stream")}
          </p>
        </Show>
      </div>
    </Show>
  );
}
