// Same layout as the Cards header: title left, Articles | Series switcher in
// the middle, search + New article on the right. Shown on the list and on the
// series index; the filter line only on the list.
import { createEffect, createSignal, Show } from "solid-js";
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
import { Button, IconButton } from "@ui/Button";
import { Input } from "@ui/Field";
import { Tabs } from "@ui/Tabs";
import PageActions from "@/shared/views/layout/PageActions";

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

          <Tabs
            label={t("nav.articles")}
            class="mx-auto"
            value={section()!}
            onChange={(key) => navigate(`/articles/${nick()}${SECTIONS.find(([k]) => k === key)![2]}`)}
            items={SECTIONS.map(([key, label]) => ({ value: key, label: t(label) }))}
          />

          <div class="flex items-center gap-1.5">
            <Show when={section() === "list"}>
              <Show
                when={searchOpen()}
                fallback={
                  <IconButton
                    label={t("articles.search")}
                    variant="outline"
                    class="relative"
                    onClick={() => { setSearchInput(activeSearch()); setSearchOpen(true); }}
                  >
                    <MdFillSearch size={15} />
                    <Show when={activeSearch()}>
                      <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent" />
                    </Show>
                  </IconButton>
                }
              >
                <form onSubmit={submitSearch} class="flex items-center gap-1">
                  <Input
                    class="w-36"
                    type="search"
                    value={searchInput()}
                    onInput={(e) => setSearchInput(e.currentTarget.value)}
                    placeholder={t("articles.search_placeholder")}
                    aria-label={t("articles.search")}
                    autofocus
                    onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
                  />
                  <IconButton label={t("articles.search")} variant="outline" type="submit">
                    <MdFillSearch size={15} />
                  </IconButton>
                  <IconButton label={t("articles.cancel")} size="sm" onClick={() => setSearchOpen(false)}>
                    <MdFillClose size={15} />
                  </IconButton>
                </form>
              </Show>
            </Show>

            <PageActions actions={[
              { label: t("articles.new_article"), icon: BiRegularEdit, onClick: openArticle, primary: true, show: role() === "owner" },
            ]} />
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
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              <MdFillClose size={12} />
              {t("articles.clear")}
            </Button>
          </div>
        </Show>
      </div>
    </Show>
  );
}
