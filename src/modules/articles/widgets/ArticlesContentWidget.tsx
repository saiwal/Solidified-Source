import { createEffect, onCleanup, Show, For, Index } from "solid-js";
import { MdOutlineArticle, MdOutlineShare } from "solid-icons/md";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { hydrateLatex } from "@utsukta/spa-core/lib/hydrateLatex";
import { hydrateMermaid } from "@utsukta/spa-core/lib/hydrateMermaid";
import { posts, loading, hasMore, loadArticles, resetPosts, loadMore } from "../store";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { articlePath, shareTargetForArticle } from "@/shared/lib/shareLinks";
import { openShare } from "@utsukta/spa-core/store/share";
import { useIsArticlesList } from "../lib/isArticlesList";
import { iconBtn, ghostPill } from "@/shared/views/ui";

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

// ── entry ─────────────────────────────────────────────────────────────────────

// A soft tonal surface (no border) per entry: title, excerpt and quiet details. The title
// is the real link (keyboard, middle-click); the rest of the entry is a mouse
// convenience that goes to the same place.
function ArticleEntry(props: { post: Post; nick: string; onOpen: () => void }) {
  const { t, locale } = useI18n();
  const ex = () => excerpt(props.post);

  return (
    <article
      onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) props.onOpen(); }}
      class="group cursor-pointer rounded-2xl bg-elevated/40 p-5 hover:bg-elevated/70 transition-colors"
    >
      <h2 class="text-lg font-semibold leading-snug">
        <A
          href={articlePath(props.nick, props.post)}
          class="text-txt group-hover:text-accent-txt transition-colors focus-visible:outline-2 focus-visible:outline-accent rounded"
        >
          {props.post.title || t("articles.untitled")}
        </A>
      </h2>

      <Show when={ex().text}>
        <p
          class={`mt-1.5 text-sm leading-relaxed max-w-prose ${ex().fromSummary ? "text-txt" : "text-muted"}`}
          ref={(el) => createEffect(() => { ex(); hydrateLatex(el); hydrateMermaid(el); })}
        >
          {ex().text}
        </p>
      </Show>

      <div class="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted">
        <span class="tabular-nums">{formatDate(props.post.created, locale())}</span>
        <span>{props.post.authorName}</span>
        <Show when={props.post.likeCount > 0}>
          <span class="tabular-nums">♥ {props.post.likeCount}</span>
        </Show>
        <Index each={props.post.categories}>
          {(cat) => <span class="text-accent-txt">{cat()}</span>}
        </Index>
        <Index each={props.post.tags}>
          {(tag) => <span>#{tag()}</span>}
        </Index>
        <button
          type="button"
          onClick={() => openShare(shareTargetForArticle(props.nick, props.post))}
          title={t("share.action")}
          aria-label={t("share.action")}
          class={`${iconBtn} ml-auto -my-2 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100`}
        >
          <MdOutlineShare size={16} />
        </button>
      </div>
    </article>
  );
}

// ── skeleton ──────────────────────────────────────────────────────────────────

const bar = "rounded bg-elevated animate-pulse motion-reduce:animate-none";

function ArticlesListSkeleton() {
  return (
    <div class="space-y-3">
      <For each={Array(5).fill(0)}>
        {(_, i) => (
          <div class="space-y-2.5 rounded-2xl bg-elevated/40 p-5">
            <div class={`h-5 ${bar}`} style={{ width: `${50 + ((i() * 13) % 30)}%` }} />
            <div class={`h-3 w-full ${bar}`} />
            <div class={`h-3 w-4/5 ${bar}`} />
            <div class={`h-2.5 w-1/4 ${bar}`} />
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
  const [searchParams] = useSearchParams();
  const str = (k: string) => {
    const v = searchParams[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };

  // Classic Hubzilla filter params (?cat=, ?tag=, ?dbegin=/?dend=, ?search=)
  // are the source of truth, so those URLs keep working when pasted or linked.
  createEffect(() => {
    if (auth.loading) return;
    loadArticles(nick(), {
      ...(str("cat") && { cat: str("cat") }),
      ...(str("tag") && { tag: str("tag") }),
      ...(str("dbegin") && { dbegin: str("dbegin") }),
      ...(str("dend") && { dend: str("dend") }),
      ...(str("search") && { search: str("search") }),
    });
  });

  onCleanup(() => resetPosts());

  return (
    <Show when={isList()}>
      {/* Centred at a reading measure */}
      <div class="max-w-3xl mx-auto">
        <div>
          <Show when={!loading()} fallback={<ArticlesListSkeleton />}>
            <Show
              when={posts().length > 0}
              fallback={
                <div class="flex flex-col items-center py-16 gap-3 text-center">
                  <MdOutlineArticle class="w-10 h-10 text-muted/40" />
                  <p class="text-sm text-muted">{t("articles.no_articles")}</p>
                </div>
              }
            >
              <div class="space-y-3">
                <For each={posts()}>
                  {(post) => (
                    <ArticleEntry
                      post={post}
                      nick={nick()}
                      onOpen={() => navigate(articlePath(nick(), post))}
                    />
                  )}
                </For>
              </div>

              <div class="flex justify-center pt-10">
                <Show
                  when={hasMore()}
                  fallback={<p class="text-xs text-muted">{t("articles.all_loaded")}</p>}
                >
                  <button type="button" onClick={loadMore} class={ghostPill}>
                    {t("articles.load_more")}
                  </button>
                </Show>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </Show>
  );
}
