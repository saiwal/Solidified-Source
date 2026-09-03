import { createEffect, onCleanup, Show, For, Switch, Match } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useScrollStyle } from "@utsukta/spa-core/store/scroll-style";
import StreamList from "@/shared/stream/feedviews/StreamList";
import type { StreamHandlers } from "@/shared/stream/types";
import { ListPlaceholder } from "@/shared/stream/feedviews/ListView";
import { MasonryPlaceholder } from "@/shared/stream/feedviews/MasonryView";
import { FeedPlaceholder } from "@/shared/stream/feedviews/FeedView";
import { TimelinePlaceholder } from "@/shared/stream/feedviews/TimelineView";
import StreamFilters from "../views/StreamFilters";
import { parseNetworkParams } from "../api";
import {
  viewMode, posts, loadNetwork, resetPosts,
  loading, loadMore, loadingMore, hasMore, newPosts, flushNewPosts,
  handleLike, handleDislike, handleRepeat,
  handleStar, handleDelete, handleEdit,
  handleComment, loadComments, loadMoreComments, handleRefresh,
} from "../store";
const handlers: StreamHandlers = {
  onLike:           handleLike,
  onDislike:        handleDislike,
  onRepeat:         handleRepeat,
  onComment:        handleComment,
  onLoadComments:   loadComments,
  onLoadMoreComments: loadMoreComments,
  onStar:           handleStar,
  onDelete:         handleDelete,
  onEdit:           handleEdit,
  onRefresh:        handleRefresh,
};

export default function NetworkContentWidget() {
  const auth = useAuth();
  const { t } = useI18n();
  const scrollStyle = useScrollStyle();
  const [searchParams] = useSearchParams();
  let initialized = false;
  let sentinel!: HTMLDivElement;

  createEffect(() => {
    if (auth.loading) return;
    if (initialized) return;
    initialized = true;
    resetPosts();
    loadNetwork(parseNetworkParams(searchParams));
  });

  onCleanup(() => resetPosts());

  createEffect(() => {
    if (scrollStyle() !== "endless") return;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div class="relative">
      <StreamFilters />

      <Show when={newPosts().length > 0}>
        <div class="sticky top-2 z-10 flex justify-center">
          <button
            onClick={flushNewPosts}
            class="px-4 py-2 rounded-full bg-accent text-accent-fg text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
          >
            ↑ {newPosts().length} {t("network.new_posts")}
          </button>
        </div>
      </Show>

      <Show
        when={!loading()}
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
          posts={posts()}
          viewMode={viewMode()}
          handlers={handlers}
          appendingCount={
            loadingMore() && viewMode() === "masonry" ? 6 : undefined
          }
        />

        <Show when={loadingMore() && viewMode() !== "masonry"}>
          <Switch>
            <Match when={viewMode() === "list"}>
              <ListPlaceholder count={4} />
            </Match>
            <Match when={viewMode() === "timeline"}>
              <div class="mt-8">
                <TimelinePlaceholder count={2} />
              </div>
            </Match>
            <Match when={true}>
              <For each={Array(3).fill(0)}>{() => <FeedPlaceholder />}</For>
            </Match>
          </Switch>
        </Show>

        <Show when={hasMore() && !loadingMore() && scrollStyle() === "load_more"}>
          <div class="flex justify-center py-4">
            <button
              onClick={loadMore}
              class="px-4 py-2 text-sm font-medium rounded-lg border border-rim
                     bg-surface text-muted hover:bg-overlay transition-colors"
            >
              {t("network.load_more")}
            </button>
          </div>
        </Show>

        <Show when={!hasMore() && posts().length > 0}>
          <p class="text-center py-4 text-sm text-muted">{t("network.all_caught_up")}</p>
        </Show>
      </Show>

      <div ref={sentinel} class="h-1" />
    </div>
  );
}
