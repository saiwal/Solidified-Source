// Same layout as the Cards header: title left, Articles | Series switcher in
// the middle, search + New article on the right. Shown on the list and on the
// series index; the filter line only on the list.
import { createEffect, createSignal, For, Show } from "solid-js";
import { MdFillSearch, MdFillClose } from "solid-icons/md";
import { BiRegularEdit } from "solid-icons/bi";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageOwnerName } from "@/shared/lib/pageOwnerName";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useViewerRole, usePageNick } from "@utsukta/spa-core/store/site-config";
import { openComposer } from "@/shared/views/modal-host";
import { resetPosts, loadArticles } from "../store";
import { useArticlesSection } from "../lib/isArticlesList";

const squareBtn = "p-1.5 rounded-lg border border-rim bg-surface text-muted hover:bg-elevated hover:text-txt transition-colors";

export default function ArticlesHeaderWidget() {
  const { t, locale } = useI18n();
  const owner = usePageOwnerName();
  const auth = useAuth();
  const role = useViewerRole();
  const nick = usePageNick();
  const section = useArticlesSection();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const p = (k: string) => String(searchParams[k] ?? "");
  const activeCategory = () => p("cat");
  const activeTag = () => p("tag");
  const activeDbegin = () => p("dbegin");
  const activeSearch = () => p("search");
  // resetPosts/loadArticles are module-level (../store), so they still work
  // when the composer publishes from another page.
  const openArticle = () =>
    openComposer({
      kind: "article",
      scope: "article:new",
      title: t("articles.new_article"),
      props: {
        uid: auth()!.uid,
        nick: nick(),
        onSaved: () => {
          resetPosts();
          void loadArticles(nick());
        },
      },
    });
  const [searchOpen, setSearchOpen] = createSignal(!!activeSearch());
  const [searchInput, setSearchInput] = createSignal(activeSearch());

  const submitSearch = (e?: Event) => {
    e?.preventDefault();
    const q = searchInput().trim();
    setSearchParams({ search: q || undefined, cat: undefined, tag: undefined, dbegin: undefined, dend: undefined });
    if (!q) setSearchOpen(false);
  };

  const clearAllFilters = () => {
    setSearchInput("");
    setSearchOpen(false);
    setSearchParams({ search: undefined, cat: undefined, tag: undefined, dbegin: undefined, dend: undefined });
  };

  let initialized = false;
  createEffect(() => {
    if (auth.loading) return;
    if (initialized) return;
    initialized = true;
    if (searchParams.new === "1" && role() === "owner") openArticle();
  });

  const SECTIONS = [
    ["list", "articles.title", ""],
    ["series", "articles.series_index_title", "/series"],
  ] as const;

  return (
    <Show when={section()}>
      <div class="space-y-3 max-w-5xl mx-auto">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <h1 class="text-xl font-bold text-txt">{owner() === null ? t("articles.title_mine") : t("articles.title_of", { name: owner()! })}</h1>

          <div class="flex gap-1 p-1 bg-elevated rounded-lg w-fit mx-auto">
            <For each={SECTIONS}>
              {([key, label, suffix]) => (
                <button
                  type="button"
                  aria-pressed={section() === key}
                  onClick={() => navigate(`/articles/${nick()}${suffix}`)}
                  class={`px-3 text-center text-xs py-1 rounded-md transition-colors font-medium
                    ${section() === key ? "bg-accent text-accent-fg font-semibold" : "text-muted hover:text-txt"}`}
                >
                  {t(label)}
                </button>
              )}
            </For>
          </div>

          <div class="flex items-center gap-1.5">
            <Show when={section() === "list"}>
              <Show
                when={searchOpen()}
                fallback={
                  <button
                    type="button"
                    title={t("articles.search")}
                    aria-label={t("articles.search")}
                    onClick={() => { setSearchInput(activeSearch()); setSearchOpen(true); }}
                    class={`relative ${squareBtn}`}
                  >
                    <MdFillSearch size={15} />
                    <Show when={activeSearch()}>
                      <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent" />
                    </Show>
                  </button>
                }
              >
                <form onSubmit={submitSearch} class="flex items-center gap-1">
                  <input
                    type="search"
                    value={searchInput()}
                    onInput={(e) => setSearchInput(e.currentTarget.value)}
                    placeholder={t("articles.search_placeholder")}
                    aria-label={t("articles.search")}
                    autofocus
                    onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
                    class="w-36 px-2 py-1 text-sm rounded-lg border border-rim bg-surface text-txt outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    title={t("articles.search")}
                    aria-label={t("articles.search")}
                    class="p-1.5 rounded-lg border border-rim bg-elevated text-txt hover:bg-overlay transition-colors"
                  >
                    <MdFillSearch size={15} />
                  </button>
                  <button
                    type="button"
                    title={t("articles.cancel")}
                    aria-label={t("articles.cancel")}
                    onClick={() => setSearchOpen(false)}
                    class="p-1.5 text-muted hover:text-txt transition-colors"
                  >
                    <MdFillClose size={15} />
                  </button>
                </form>
              </Show>
            </Show>

            <Show when={role() === "owner"}>
              <button
                type="button"
                onClick={openArticle}
                class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                       rounded-lg bg-accent text-accent-fg hover:opacity-90
                       transition-opacity"
              >
                <BiRegularEdit class="w-4 h-4" />
                {t("articles.new_article")}
              </button>
            </Show>
          </div>
        </div>

        <Show when={section() === "list" && (activeCategory() || activeTag() || activeDbegin() || activeSearch())}>
          <div class="flex items-center gap-x-3 gap-y-1 flex-wrap text-sm">
            <span class="text-muted">{t("articles.filtered_by")}</span>
            <Show when={activeSearch()}>
              <span class="font-medium text-accent-txt">"{activeSearch()}"</span>
            </Show>
            <Show when={activeCategory()}>
              <span class="font-medium text-accent-txt">{activeCategory()}</span>
            </Show>
            <Show when={activeTag()}>
              <span class="font-medium text-accent-txt">#{activeTag()}</span>
            </Show>
            <Show when={activeDbegin()}>
              <span class="font-medium text-accent-txt">
                {new Date(activeDbegin() + "T00:00:00").toLocaleDateString(locale(), { month: "long", day: "numeric", year: "numeric" })}
              </span>
            </Show>
            <button
              type="button"
              onClick={clearAllFilters}
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted hover:text-txt hover:bg-elevated/70 transition-colors"
            >
              <MdFillClose size={12} />
              {t("articles.clear")}
            </button>
          </div>
        </Show>
      </div>
    </Show>
  );
}
