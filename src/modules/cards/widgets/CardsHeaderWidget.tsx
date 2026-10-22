import { createEffect, createSignal, Show } from "solid-js";
import { MdFillSearch, MdFillClose } from "solid-icons/md";
import { BiRegularEdit } from "solid-icons/bi";
import { useSearchParams } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageOwnerName } from "@/shared/lib/pageOwnerName";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useViewerRole, usePageNick } from "@utsukta/spa-core/store/site-config";
import { openComposer } from "@/shared/views/modal-host";
import { resetPosts, loadCards } from "../store";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useIsCardsList } from "../lib/isCardsList";
import { boardView, setBoardView } from "../lib/kanban";
import { fetchKanban } from "../api";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { Tabs } from "@ui/Tabs";

export default function CardsHeaderWidget() {
  const { t, locale } = useI18n();
  const owner = usePageOwnerName();
  const auth = useAuth();
  const role = useViewerRole();
  const nick = usePageNick();
  const isList = useIsCardsList();
  const [searchParams, setSearchParams] = useSearchParams();
  const p = (k: string) => String(searchParams[k] ?? "");
  const activeCategory = () => p("cat");
  const activeTag = () => p("tag");
  const activeDbegin = () => p("dbegin");
  const activeSearch = () => p("search");
  // Same query key as CardsContentWidget and the board — one request.
  const [kanban] = createQueryResource("kanban-config", nick, fetchKanban);
  // resetPosts/loadCards are module-level (../store), so they still work when
  // the composer publishes from another page.
  const openCard = () =>
    openComposer({
      kind: "card",
      scope: "card:new",
      title: t("cards.new_card"),
      props: {
        uid: auth()!.uid,
        nick: nick(),
        onSaved: () => {
          resetPosts();
          void loadCards(nick());
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
    if (searchParams.new === "1" && role() === "owner") openCard();
  });

  return (
    <Show when={isList()}>
      {/* Matches the content widget's width so the title row lines up with
          whichever board is showing. */}
      <div class="space-y-4 max-w-5xl mx-auto">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <h1 class="text-xl font-bold text-txt">{owner() === null ? t("cards.title_mine") : t("cards.title_of", { name: owner()! })}</h1>

          <Show when={kanban()?.enabled}>
            <Tabs
              label={t("nav.cards")}
              class="mx-auto"
              value={boardView()}
              onChange={setBoardView}
              items={[
                { value: "board", label: t("cards.view_board") },
                { value: "kanban", label: t("cards.view_kanban") },
              ]}
            />
          </Show>

          <div class="flex items-center gap-1.5">
            <Show
              when={searchOpen()}
              fallback={
                <button
                  type="button"
                  title={t("cards.search")}
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
                <Input
                  class="w-36"
                  type="search"
                  value={searchInput()}
                  onInput={(e) => setSearchInput(e.currentTarget.value)}
                  placeholder={t("cards.search_placeholder")}
                  autofocus
                  onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
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
              <Button size="sm" onClick={openCard}>
                <BiRegularEdit class="w-4 h-4" />
                {t("cards.new_card")}
              </Button>
            </Show>
          </div>
        </div>

        <Show when={activeCategory() || activeTag() || activeDbegin() || activeSearch()}>
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/25 text-sm">
            <span class="text-muted">{t("cards.filtered_by")}</span>
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
              {t("cards.clear")}
            </button>
          </div>
        </Show>
      </div>
    </Show>
  );
}
