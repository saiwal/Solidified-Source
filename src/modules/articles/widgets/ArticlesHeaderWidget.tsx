import { createEffect, createSignal, Show } from "solid-js";
import { MdFillSearch, MdFillClose } from "solid-icons/md";
import { BiRegularEdit } from "solid-icons/bi";
import { useSearchParams } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useViewerRole, usePageNick } from "@utsukta/spa-core/store/site-config";
import ArticleComposer from "@/shared/editor/composers/ArticleComposer";
import ComposerModal from "@/shared/editor/components/ComposerModal";
import { resetPosts, loadArticles } from "../store";
import { useIsArticlesList } from "../lib/isArticlesList";

function ArticleModal(props: { uid: number; nick: string; onClose: () => void }) {
  const { t } = useI18n();

  return (
    <ComposerModal title={t("articles.new_article")} onClose={props.onClose} widthClass="max-w-3xl">
      <ArticleComposer
        profileUid={props.uid}
        nick={props.nick}
        onSaved={() => {
          props.onClose();
          resetPosts();
          loadArticles(props.nick);
        }}
        onCancel={props.onClose}
      />
    </ComposerModal>
  );
}

export default function ArticlesHeaderWidget() {
  const { t, locale } = useI18n();
  const auth = useAuth();
  const role = useViewerRole();
  const nick = usePageNick();
  const isList = useIsArticlesList();
  const [searchParams, setSearchParams] = useSearchParams();
  const p = (k: string) => String(searchParams[k] ?? "");
  const activeCategory = () => p("cat");
  const activeTag = () => p("tag");
  const activeDbegin = () => p("dbegin");
  const activeSearch = () => p("search");
  const [open, setOpen] = createSignal(false);
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
    if (searchParams.new === "1" && role() === "owner") setOpen(true);
  });

  return (
    <Show when={isList()}>
      <div class="space-y-4 max-w-5xl mx-auto">
        <div class="flex items-center justify-between gap-2">
          <h1 class="text-xl font-bold text-txt">{t("articles.title")}</h1>

          <div class="flex items-center gap-1.5">
            <Show
              when={searchOpen()}
              fallback={
                <button
                  type="button"
                  title={t("articles.search")}
                  onClick={() => { setSearchInput(activeSearch()); setSearchOpen(true); }}
                  class={`p-1.5 rounded-lg border transition-colors
                    ${activeSearch()
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
                  placeholder={t("articles.search_placeholder")}
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
                  onClick={() => setSearchOpen(false)}
                  class="p-1.5 text-muted hover:text-txt transition-colors"
                >
                  <MdFillClose size={15} />
                </button>
              </form>
            </Show>

            <Show when={role() === "owner"}>
              <button
                type="button"
                onClick={() => setOpen(true)}
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

        <Show when={activeCategory() || activeTag() || activeDbegin() || activeSearch()}>
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/25 text-sm">
            <span class="text-muted">{t("articles.filtered_by")}</span>
            <Show when={activeSearch()}>
              <span class="font-medium text-accent">"{activeSearch()}"</span>
            </Show>
            <Show when={activeCategory()}>
              <span class="font-medium text-accent">{activeCategory()}</span>
            </Show>
            <Show when={activeTag()}>
              <span class="font-medium text-accent">#{activeTag()}</span>
            </Show>
            <Show when={activeDbegin()}>
              <span class="font-medium text-accent">
                {new Date(activeDbegin() + "T00:00:00").toLocaleDateString(locale(), { month: "long", day: "numeric", year: "numeric" })}
              </span>
            </Show>
            <button
              type="button"
              onClick={clearAllFilters}
              class="ml-auto text-xs text-muted hover:text-txt transition-colors"
            >
              {t("articles.clear")}
            </button>
          </div>
        </Show>

        <Show when={open()}>
          <ArticleModal
            uid={auth()!.uid}
            nick={nick()}
            onClose={() => setOpen(false)}
          />
        </Show>
      </div>
    </Show>
  );
}
