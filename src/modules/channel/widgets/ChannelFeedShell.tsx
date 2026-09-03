// src/modules/channel/widgets/ChannelFeedShell.tsx
import { createEffect, createSignal, onCleanup, Show, type Component, type JSX } from "solid-js";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useScrollStyle } from "@utsukta/spa-core/store/scroll-style";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import {
  loading,
  hasMore,
  loadingMore,
  newPosts,
  posts,
  profileUid,
  canPostWall,
  loadChannel,
  loadMore,
  flushNewPosts,
  resetPosts,
} from "../store";
import type { ChannelParams } from "../api";
import {
  SortSelect,
  DEFAULT_RANGE,
  resolveRange,
  rangeToDbegin,
  type SortOrder,
  type SortRange,
} from "@/shared/stream/filters";
import { MdFillSearch, MdFillClose, MdFillCreate, MdFillMail } from "solid-icons/md";
import { lazy } from "solid-js";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
const PostComposer = lazy(() => import("@/shared/editor/composers/PostComposer"));

// Toolbar/search/pagination/composer chrome shared by `channel.feed` and its
// alternate-layout widgets (newspaper/timeline/scrapbook) — only the post
// list rendering (`body`) differs between them.
export default function ChannelFeedShell(props: {
  body: Component;
  viewSwitcher?: JSX.Element;
}) {
  const nick = usePageNick();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const scrollStyle = useScrollStyle();

  const str = (key: string): string | undefined => {
    const v = searchParams[key];
    return v ? String(Array.isArray(v) ? v[0] : v) : undefined;
  };

  const currentSearch = () => str("search") ?? "";

  const [searchOpen, setSearchOpen] = createSignal(!!searchParams.search);
  const [searchInput, setSearchInput] = createSignal(currentSearch());
  const [composeOpen, setComposeOpen] = createSignal(false);
  const [composeEverOpened, setComposeEverOpened] = createSignal(false);
  const openCompose = () => { setComposeEverOpened(true); setComposeOpen(true); };
  const auth = useAuth();
  const viewerRole = useViewerRole();
  // profileUid() (from the loaded-posts stream) is 0 until a post loads, so an
  // empty wall would wrongly read as "visiting someone else" — use the
  // post-independent viewer role instead.
  const isVisitor = () => (auth()?.uid ?? 0) > 0 && viewerRole() !== "owner";

  const submitSearch = (e?: Event) => {
    e?.preventDefault();
    const q = searchInput().trim();
    setSearchParams({ search: q || undefined });
    if (!q) setSearchOpen(false);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchParams({ search: undefined });
    setSearchOpen(false);
  };

  const mid = () => {
    const v = searchParams.mid;
    return v ? (Array.isArray(v) ? v[0] : v) : null;
  };

  const dmActive = () => searchParams.dm === "1";
  const toggleDm = () => setSearchParams({ dm: dmActive() ? undefined : "1" });

  // A wall is one person's posts, so the network's discovery-oriented orders
  // don't all carry over: `hot` degenerates to `created` without a firehose to
  // rank against, and `controversial` needs a dislike volume a personal wall
  // rarely sees.
  const CHANNEL_ORDERS: SortOrder[] = ["created", "commented", "top", "discussed", "unthreaded"];

  const order = () => (str("order") as SortOrder) ?? "created";
  const range = () => str("range") as SortRange | undefined;
  const setOrder = (o: SortOrder, r?: SortRange) =>
    setSearchParams({
      order: o === "created" ? undefined : o,
      // Absent means DEFAULT_RANGE, so only that one is omitted — "all" has
      // to be written out or it can't be selected.
      range: !r || r === DEFAULT_RANGE ? undefined : r,
    });

  createEffect(() => {
    const uuid = mid();
    if (uuid) { navigate(`/display/${uuid}`, { replace: true }); return; }
  });

  createEffect(() => {
    // `range` is a UI-only param — map it to the window the API understands,
    // but never override a dbegin that's already in the URL.
    const dbegin = str("dbegin") ?? rangeToDbegin(resolveRange(order(), range()));
    const p: ChannelParams = {
      ...(str("order") && { order: order() }),
      ...(str("search") && { search: str("search") }),
      ...(str("tag") && { tag: str("tag") }),
      ...(str("cat") && { cat: str("cat") }),
      ...(str("mid") && { mid: str("mid") }),
      ...(str("dend") && { dend: str("dend") }),
      ...(dbegin && { dbegin }),
      ...(dmActive() && { dm: 1 as const }),
    };
    loadChannel(nick(), p);
  });

  onCleanup(() => resetPosts());

  let sentinel!: HTMLDivElement;
  createEffect(() => {
    if (scrollStyle() !== "endless") return;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    onCleanup(() => observer.disconnect());
  });

  return (
    <>
      <div class="flex items-center gap-1.5 mb-4">
        <div class="flex-1 min-w-0">
          <SortSelect
            order={order()}
            range={range()}
            onChange={setOrder}
            available={CHANNEL_ORDERS}
            help="channel.sort_order"
          />
        </div>

        <div class="flex items-center justify-end gap-1.5 shrink-0">
          {props.viewSwitcher}
          <Show when={canPostWall()}>
            <button
              title={t("channel.compose")}
              onClick={openCompose}
              class="p-1.5 rounded-lg border border-rim bg-surface text-muted hover:bg-elevated hover:text-txt transition-colors"
            >
              <MdFillCreate size={15} />
            </button>
          </Show>
          <button
            title={t("channel.direct_messages")}
            onClick={toggleDm}
            class={`p-1.5 rounded-lg border transition-colors
              ${dmActive()
                ? "bg-accent text-accent-fg border-accent"
                : "border-rim bg-surface text-muted hover:bg-elevated hover:text-txt"}`}
          >
            <MdFillMail size={15} />
          </button>
          <Show
            when={searchOpen()}
            fallback={
              <button
                title={t("channel.search")}
                onClick={() => { setSearchInput(currentSearch()); setSearchOpen(true); }}
                class={`p-1.5 rounded-lg border transition-colors
                  ${currentSearch()
                    ? "bg-accent text-accent-fg border-accent"
                    : "border-rim bg-surface text-muted hover:bg-elevated hover:text-txt"}`}
              >
                <MdFillSearch size={15} />
              </button>
            }
          >
            <form onSubmit={submitSearch} class="flex items-center gap-1">
              <input
                type="search"
                value={searchInput()}
                onInput={(e) => setSearchInput(e.currentTarget.value)}
                placeholder={t("channel.search_placeholder")}
                autofocus
                onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
                class="w-36 px-2 py-1 text-sm rounded-lg border border-rim bg-surface text-txt outline-none focus:border-accent"
              />
              <button
                type="submit"
                class="p-1.5 rounded-lg border border-rim bg-elevated text-txt hover:bg-overlay transition-colors"
              >
                <MdFillSearch size={15} />
              </button>
              <button
                type="button"
                onClick={clearSearch}
                class="p-1.5 text-muted hover:text-txt transition-colors"
              >
                <MdFillClose size={15} />
              </button>
            </form>
          </Show>
        </div>
      </div>

      <Show when={searchParams.cat || searchParams.tag || searchParams.dbegin || searchParams.search || dmActive()}>
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/25 text-sm mb-3">
          <span class="text-muted">{t("channel.filtered_by")}</span>
          <Show when={searchParams.search}>
            <span class="font-medium text-accent">"{currentSearch()}"</span>
          </Show>
          <Show when={searchParams.cat}>
            <span class="font-medium text-accent">{searchParams.cat}</span>
          </Show>
          <Show when={searchParams.tag}>
            <span class="font-medium text-accent">#{searchParams.tag}</span>
          </Show>
          <Show when={searchParams.dbegin}>
            <span class="font-medium text-accent">
              {new Date(String(searchParams.dbegin) + "T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
          </Show>
          <Show when={dmActive()}>
            <span class="font-medium text-accent">{t("channel.direct_messages")}</span>
          </Show>
          <button
            type="button"
            onClick={() => setSearchParams({ cat: undefined, tag: undefined, dbegin: undefined, dend: undefined, search: undefined, dm: undefined })}
            class="ml-auto text-xs text-muted hover:text-txt transition-colors"
          >
            {t("channel.clear")}
          </button>
        </div>
      </Show>

      <Show when={newPosts().length > 0}>
        <button
          onClick={flushNewPosts}
          class="w-full mb-3 py-2 text-sm font-medium rounded-xl
                 bg-accent text-accent-fg border border-accent hover:opacity-90 transition-opacity"
        >
          ↑ {newPosts().length} {newPosts().length === 1 ? t("channel.new_post") : t("channel.new_posts")}
        </button>
      </Show>

      <props.body />

      <Show when={!loading() && hasMore() && !loadingMore() && scrollStyle() === "load_more"}>
        <div class="flex justify-center py-4">
          <button
            onClick={loadMore}
            class="px-4 py-2 text-sm font-medium rounded-lg border border-rim
                   bg-surface text-muted hover:bg-overlay transition-colors"
          >
            {t("channel.load_more")}
          </button>
        </div>
      </Show>

      <div ref={sentinel} class="h-1" />

      <Show when={!hasMore() && posts().length > 0}>
        <p class="text-center text-xs text-muted py-6">{t("channel.all_caught_up")}</p>
      </Show>

      <Show when={composeEverOpened()}>
        <PostComposer
          open={composeOpen()}
          onClose={() => setComposeOpen(false)}
          profileUid={profileUid()}
          hideAcl={isVisitor()}
          onPosted={() => loadChannel(nick())}
        />
      </Show>
    </>
  );
}
