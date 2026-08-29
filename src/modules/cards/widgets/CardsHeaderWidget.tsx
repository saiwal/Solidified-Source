import { createEffect, createSignal, For, Show } from "solid-js";
import { MdFillSearch, MdFillClose, MdOutlineGrid_view, MdOutlineView_kanban } from "solid-icons/md";
import { BiRegularEdit } from "solid-icons/bi";
import { useSearchParams } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useViewerRole, usePageNick } from "@utsukta/spa-core/store/site-config";
import CardComposer from "@/shared/editor/composers/CardComposer";
import ComposerModal from "@/shared/editor/components/ComposerModal";
import {
  activeCategory, activeTag, activeDbegin, activeSearch,
  setCardSearch, clearCardFilter,
  resetPosts, loadCards,
} from "../store";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useIsCardsList } from "../lib/isCardsList";
import { boardView, setBoardView } from "../lib/kanban";
import { fetchKanban } from "../api";

function CardModal(props: { uid: number; nick: string; onClose: () => void }) {
  const { t } = useI18n();

  return (
    <ComposerModal title={t("cards.new_card")} onClose={props.onClose} widthClass="max-w-3xl">
      <CardComposer
        profileUid={props.uid}
        nick={props.nick}
        onSaved={() => {
          props.onClose();
          resetPosts();
          loadCards(props.nick);
        }}
        onCancel={props.onClose}
      />
    </ComposerModal>
  );
}

export default function CardsHeaderWidget() {
  const { t, locale } = useI18n();
  const auth = useAuth();
  const role = useViewerRole();
  const nick = usePageNick();
  const isList = useIsCardsList();
  const [searchParams] = useSearchParams();
  // Same query key as CardsContentWidget and the board — one request.
  const [kanban] = createQueryResource("kanban-config", nick, fetchKanban);
  const showKanban = () => boardView() === "kanban" && !!kanban()?.enabled;
  const [open, setOpen] = createSignal(false);
  const [searchOpen, setSearchOpen] = createSignal(!!activeSearch());
  const [searchInput, setSearchInput] = createSignal(activeSearch());

  const submitSearch = (e?: Event) => {
    e?.preventDefault();
    const q = searchInput().trim();
    setCardSearch(q);
    if (!q) setSearchOpen(false);
  };

  const clearAllFilters = () => {
    setSearchInput("");
    setSearchOpen(false);
    clearCardFilter();
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
      {/* Matches the content widget's width so the title row lines up with
          whichever board is showing. */}
      <div class="space-y-4" classList={{ "max-w-5xl mx-auto": !showKanban() }}>
        <div class="flex items-center justify-between gap-2">
          <h1 class="text-xl font-bold text-txt">{t("cards.title")}</h1>

          <div class="flex items-center gap-1.5">
            <Show when={kanban()?.enabled}>
              <div class="flex items-center rounded-lg border border-rim bg-surface overflow-hidden">
                <For each={[["board", MdOutlineGrid_view, "cards.view_board"] as const,
                            ["kanban", MdOutlineView_kanban, "cards.view_kanban"] as const]}>
                  {([view, Icon, key]) => (
                    <button
                      type="button"
                      title={t(key)}
                      aria-pressed={boardView() === view}
                      onClick={() => setBoardView(view)}
                      class="p-1.5 transition-colors"
                      classList={{
                        "bg-accent text-accent-fg": boardView() === view,
                        "text-muted hover:bg-elevated hover:text-txt": boardView() !== view,
                      }}
                    >
                      <Icon size={15} />
                    </button>
                  )}
                </For>
              </div>
            </Show>

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
                <input
                  type="search"
                  value={searchInput()}
                  onInput={(e) => setSearchInput(e.currentTarget.value)}
                  placeholder={t("cards.search_placeholder")}
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
                {t("cards.new_card")}
              </button>
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

        <Show when={open()}>
          <CardModal
            uid={auth()!.uid}
            nick={nick()}
            onClose={() => setOpen(false)}
          />
        </Show>
      </div>
    </Show>
  );
}
