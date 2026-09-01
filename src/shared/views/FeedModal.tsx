// Lists every RSS feed a visitor can subscribe to for a channel: whole wall
// + per-category + per-tag (posts and, when the channel has any, articles),
// plus webpages. Posts/webpages/category feeds point at core's own /feed
// module; tag and articles-only feeds point at the SPA's own /spa/feed
// (core's /feed has no tag or article-type filter — see Handlers/Feed.php).

import { createSignal, createMemo, For, Show, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchCategories, type CategoryItem } from "@/shared/stream/components/CategoryWidget";
import { fetchTags, type TagItem } from "@/shared/stream/components/TagWidget";
import { MdOutlineContent_copy as MdOutlineContentCopy, MdOutlineCheck } from "solid-icons/md";
import { BiRegularLinkExternal, BiRegularRss } from "solid-icons/bi";
import { useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { isAppInstalled } from "@utsukta/spa-core/module-registry";

interface Props {
  channelNick: string;
  onClose: () => void;
}

interface FeedRow {
  label: string;
  url: string;
}

function feedRow(label: string, url: string): FeedRow {
  return { label, url };
}

const FeedRowItem: Component<{ row: FeedRow; variant?: "all" }> = (props) => {
  const { t } = useI18n();
  const [copied, setCopied] = createSignal(false);

  function copy(e: MouseEvent) {
    e.preventDefault();
    navigator.clipboard.writeText(props.row.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const isAll = props.variant === "all";

  return (
    <li
      class="flex items-center gap-2 transition-colors"
      classList={
        isAll
          ? { "px-3 py-2.5 rounded-lg bg-accent/10 hover:bg-accent/15": true }
          : { "px-3 py-2 hover:bg-elevated": true }
      }
    >
      <Show when={isAll}>
        <BiRegularRss size={14} class="text-accent shrink-0" />
      </Show>
      <span
        class="flex-1 text-sm truncate"
        classList={{ "font-medium text-accent": isAll, "text-txt": !isAll }}
      >
        {props.row.label}
      </span>
      <a
        href={props.row.url}
        target="_blank"
        rel="noopener noreferrer"
        title={t("widgets.open_feed")}
        aria-label={t("widgets.open_feed")}
        class="p-1 rounded text-muted hover:text-accent hover:bg-surface transition-colors shrink-0"
      >
        <BiRegularLinkExternal size={15} />
      </a>
      <button
        onClick={copy}
        title={t("widgets.copy_feed_url")}
        aria-label={t("widgets.copy_feed_url")}
        class="p-1 rounded text-muted hover:text-accent hover:bg-surface transition-colors shrink-0"
      >
        <Show when={copied()} fallback={<MdOutlineContentCopy size={15} />}>
          <MdOutlineCheck size={15} class="text-accent" />
        </Show>
      </button>
    </li>
  );
};

// A boxed, labelled list — the unit of "distinct separation" between feed
// types (Categories vs Tags vs the plain All-feed row).
const FeedSubsection: Component<{ label: string; rows: FeedRow[] }> = (props) => (
  <Show when={props.rows.length > 0}>
    <div>
      <h4 class="px-1 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted/80">
        {props.label}
      </h4>
      <ul class="rounded-lg border border-rim divide-y divide-rim overflow-hidden">
        <For each={props.rows}>{(row) => <FeedRowItem row={row} />}</For>
      </ul>
    </div>
  </Show>
);

const FeedTypeColumn: Component<{
  title: string;
  allRow: FeedRow;
  categories: FeedRow[];
  tags: FeedRow[];
}> = (props) => {
  const { t } = useI18n();
  return (
    <div class="flex-1 min-w-0 flex flex-col gap-3">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted px-1">{props.title}</h3>
      <ul>
        <FeedRowItem row={props.allRow} variant="all" />
      </ul>
      <FeedSubsection label={t("widgets.categories") as string} rows={props.categories} />
      <FeedSubsection label={t("widgets.tags") as string} rows={props.tags} />
    </div>
  );
};

const FeedModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const nick = () => props.channelNick;
  const origin = window.location.origin;

  // Scoped to whichever channel's page is currently open (Layout.tsx keeps
  // nav-store's nick in sync with the route), not the logged-in viewer's own
  // apps — same pattern as AuthorPopover.tsx's chat-installed check.
  const installedApps = useInstalledApps();
  const articlesInstalled = () => isAppInstalled(installedApps(), "/articles/");
  const webpagesInstalled = () => isAppInstalled(installedApps(), "/webpages/");

  const spaFeed = (params: string) => `${origin}/spa/feed/${encodeURIComponent(nick())}${params}`;

  const [postCats] = createQueryResource(
    "feed-modal-categories",
    () => ({ channelNick: nick(), type: "posts" as const }),
    fetchCategories,
  );
  const [postTags] = createQueryResource(
    "feed-modal-tags",
    () => ({ channelNick: nick(), type: "posts" as const }),
    fetchTags,
  );
  const [articleCats] = createQueryResource(
    "feed-modal-article-categories",
    () => (articlesInstalled() ? { channelNick: nick(), type: "articles" as const } : null),
    fetchCategories,
  );
  const [articleTags] = createQueryResource(
    "feed-modal-article-tags",
    () => (articlesInstalled() ? { channelNick: nick(), type: "articles" as const } : null),
    fetchTags,
  );

  const loading = () =>
    postCats.loading || postTags.loading || articleCats.loading || articleTags.loading;

  const postCatRows = createMemo<FeedRow[]>(() =>
    (postCats() ?? []).map((c: CategoryItem) => feedRow(c.name, spaFeed(`?cat=${encodeURIComponent(c.slug)}`))),
  );
  const postTagRows = createMemo<FeedRow[]>(() =>
    (postTags() ?? []).map((tg: TagItem) => feedRow(`#${tg.name}`, spaFeed(`?tag=${encodeURIComponent(tg.name)}`))),
  );
  const articleCatRows = createMemo<FeedRow[]>(() =>
    (articleCats() ?? []).map((c: CategoryItem) =>
      feedRow(c.name, spaFeed(`?type=articles&cat=${encodeURIComponent(c.slug)}`)),
    ),
  );
  const articleTagRows = createMemo<FeedRow[]>(() =>
    (articleTags() ?? []).map((tg: TagItem) =>
      feedRow(`#${tg.name}`, spaFeed(`?type=articles&tag=${encodeURIComponent(tg.name)}`)),
    ),
  );

  const webpageRows: FeedRow[] = [feedRow(t("widgets.subscribe_all_webpages") as string, spaFeed("?type=webpages"))];

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div class="w-full max-w-md lg:max-w-3xl max-h-[85vh] flex flex-col rounded-xl border border-rim bg-surface shadow-2xl overflow-hidden">
          <header class="flex items-center justify-between px-5 py-3.5 border-b border-rim shrink-0">
            <span class="text-sm font-semibold text-txt">{t("widgets.rss_feeds")}</span>
            <button onClick={props.onClose} class="text-muted hover:text-txt text-lg leading-none shrink-0 ml-2">
              ×
            </button>
          </header>
          <div class="overflow-y-auto p-5">
            <Show when={!loading()} fallback={<p class="py-6 text-sm text-muted text-center">…</p>}>
              <div
                class="grid grid-cols-1 gap-x-8 gap-y-6"
                classList={{ "lg:grid-cols-2": articlesInstalled() }}
              >
                <FeedTypeColumn
                  title={t("widgets.subscribe_posts") as string}
                  allRow={feedRow(t("widgets.subscribe_all_posts") as string, spaFeed(""))}
                  categories={postCatRows()}
                  tags={postTagRows()}
                />
                <Show when={articlesInstalled()}>
                  <FeedTypeColumn
                    title={t("widgets.subscribe_articles") as string}
                    allRow={feedRow(t("widgets.subscribe_all_articles") as string, spaFeed("?type=articles"))}
                    categories={articleCatRows()}
                    tags={articleTagRows()}
                  />
                </Show>
              </div>
              <Show when={webpagesInstalled()}>
                <div class="mt-6 pt-5 border-t border-rim">
                  <FeedSubsection label={t("widgets.subscribe_webpages") as string} rows={webpageRows} />
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default FeedModal;
