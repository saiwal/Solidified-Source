import { createEffect, onCleanup, Show, For, Index } from "solid-js";
import { MdOutlineArticle, MdOutlineShare } from "solid-icons/md";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { hydrateLatex } from "@utsukta/spa-core/lib/hydrateLatex";
import { posts, loading, hasMore, loadArticles, resetPosts, loadMore } from "../store";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { articlePath, shareTargetForArticle } from "@/shared/lib/shareLinks";
import { openShare } from "@utsukta/spa-core/store/share";
import { useIsArticlesList } from "../lib/isArticlesList";

// ── helpers ───────────────────────────────────────────────────────────────────

function excerpt(post: Post, maxLen = 200): { text: string; fromSummary: boolean } {
  // Prefer explicit summary — it's already plain text
  if (post.summary) {
    const text = post.summary.length <= maxLen
      ? post.summary
      : post.summary.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
    return { text, fromSummary: true };
  }
  // Fall back to body: strip HTML (body is already rendered) then truncate
  const plain = (post.body ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return { text: "", fromSummary: false };
  const text = plain.length <= maxLen
    ? plain
    : plain.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
  return { text, fromSummary: false };
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── card ──────────────────────────────────────────────────────────────────────

function ArticleCard(props: { post: Post; nick: string; onOpen: () => void }) {
  const { t, locale } = useI18n();
  const ex = () => excerpt(props.post);

  return (
    <article
      onClick={props.onOpen}
      class="group bg-surface border border-rim rounded-xl p-5 space-y-2
             hover:border-rim-strong hover:bg-elevated cursor-pointer
             transition-colors"
    >
      <h2 class="text-lg font-semibold text-txt leading-snug
                 group-hover:text-accent transition-colors">
        {props.post.title || t("articles.untitled")}
      </h2>

      <Show when={ex().text}>
        <p
          class={`text-sm leading-relaxed ${ex().fromSummary ? "text-txt" : "text-muted"}`}
          ref={(el) => createEffect(() => { ex(); hydrateLatex(el); })}
        >
          {ex().text}
        </p>
      </Show>

      <Show when={(props.post.categories?.length ?? 0) > 0 || (props.post.tags?.length ?? 0) > 0}>
        <div class="flex flex-wrap gap-1.5 pt-1">
          <Index each={props.post.categories}>
            {(cat) => (
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium
                           bg-accent/15 text-accent border border-accent/30">
                {cat()}
              </span>
            )}
          </Index>
          <Index each={props.post.tags}>
            {(tag) => (
              <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium
                           bg-elevated text-muted border border-rim">
                #{tag()}
              </span>
            )}
          </Index>
        </div>
      </Show>

      <div class="flex items-center gap-3 pt-1 text-xs text-muted">
        <span>{formatDate(props.post.created, locale())}</span>
        <span>·</span>
        <span>{props.post.authorName}</span>
        <Show when={props.post.likeCount > 0}>
          <span>·</span>
          <span>♥ {props.post.likeCount}</span>
        </Show>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openShare(shareTargetForArticle(props.nick, props.post)); }}
          title={t("share.action")}
          class="ml-auto p-1 rounded-md text-muted hover:text-accent hover:bg-accent/10
                 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
          <MdOutlineShare size={15} />
        </button>
      </div>
    </article>
  );
}

// ── skeleton ──────────────────────────────────────────────────────────────────

function ArticlesListSkeleton() {
  return (
    <div class="space-y-4">
      <For each={Array(6).fill(0)}>
        {() => (
          <div class="bg-surface border border-rim rounded-xl p-5 space-y-3 animate-pulse">
            <div class="h-5 bg-elevated rounded w-2/3" />
            <div class="space-y-1.5">
              <div class="h-3 bg-elevated rounded w-full" />
              <div class="h-3 bg-elevated rounded w-4/5" />
            </div>
            <div class="h-3 bg-elevated rounded w-1/3" />
          </div>
        )}
      </For>
    </div>
  );
}

export default function ArticlesContentWidget() {
  const auth = useAuth();
  const { t } = useI18n();
  const nick = usePageNick();
  const isList = useIsArticlesList();
  const navigate = useNavigate();
  let initialized = false;

  createEffect(() => {
    if (auth.loading) return;
    if (initialized) return;
    initialized = true;
    resetPosts();
    loadArticles(nick());
  });

  onCleanup(() => resetPosts());

  const goToArticle = (post: Post) => {
    navigate(articlePath(nick(), post));
  };

  return (
    <Show when={isList()}>
      <div class="space-y-4 max-w-3xl mx-auto">
        <Show when={!loading()} fallback={<ArticlesListSkeleton />}>
          <Show
            when={posts().length > 0}
            fallback={
              <div class="text-center py-16 text-muted text-sm space-y-2">
                <MdOutlineArticle class="text-2xl text-muted mx-auto" />
                <p>{t("articles.no_articles")}</p>
              </div>
            }
          >
            <div class="space-y-4">
              <For each={posts()}>
                {(post) => (
                  <ArticleCard
                    post={post}
                    nick={nick()}
                    onOpen={() => goToArticle(post)}
                  />
                )}
              </For>
            </div>

            <Show when={hasMore()}>
              <div class="flex justify-center pt-2">
                <button
                  onClick={loadMore}
                  class="px-4 py-2 text-sm font-medium rounded-lg border border-rim
                         bg-surface text-muted hover:bg-elevated transition-colors"
                >
                  {t("articles.load_more")}
                </button>
              </div>
            </Show>

            <Show when={!hasMore()}>
              <p class="text-center py-2 text-xs text-muted">{t("articles.all_loaded")}</p>
            </Show>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
