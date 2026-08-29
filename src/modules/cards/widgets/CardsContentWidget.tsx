// The card board: a masonry pinboard rather than the chronological list the
// articles module uses, since cards are peers with no reading order.
//
// Masonry is a round-robin split across N flex columns (splitIntoColumns +
// useColumnCount, the same helpers the gridTop slot and ScrapbookView use),
// NOT CSS multi-column. `columns-*` is column-major: it fills column 1 top to
// bottom before starting column 2, so the newest card sits above the second
// card rather than beside it and the board reads top-to-bottom. Round-robin
// assigns card i to column i % n, so it reads left-to-right across the row
// while still packing columns of unequal height with no measurement pass.
// See Slot.tsx's gridTop comment for the same reasoning.
//
// ponytail: deliberately unvirtualised at v1 — masonry and virtualisation
// don't compose (a virtualiser needs to know row heights that the column
// packer decides), and the store's own pagination caps what's mounted. Revisit
// only if a board of many hundreds of cards is a real workload.

import { createEffect, createMemo, createSignal, onCleanup, Show, For } from "solid-js";
import { MdOutlineStyle } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { splitIntoColumns, useColumnCount } from "@utsukta/spa-core/lib/masonry";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { posts, loading, hasMore, loadCards, resetPosts, loadMore } from "../store";
import CardFace from "../components/CardFace";
import KanbanBoard from "../components/KanbanBoard";
import { useIsCardsList } from "../lib/isCardsList";
import { boardView } from "../lib/kanban";
import { fetchKanban } from "../api";

// 20rem minimum column with a ceiling of 3 reproduces the density the old
// `columns-1 sm:columns-2 lg:columns-3` gave: 3 columns across the full
// max-w-5xl board, 2 around tablet width, 1 on phones. (ScrapbookView's 16rem
// suits its image tiles; a card carries a title and a text excerpt and reads
// badly below ~320px.) useColumnCount measures the container, not the
// viewport, so the right sidebar's width is already accounted for.
const MIN_COLUMN_REM = 20;
const MAX_COLUMNS = 3;

function CardsBoardSkeleton() {
  const [gridEl, setGridEl] = createSignal<HTMLDivElement>();
  const colCount = useColumnCount(gridEl, MIN_COLUMN_REM, MAX_COLUMNS);
  const columns = createMemo(() => splitIntoColumns(Array(6).fill(0), colCount()));
  return (
    <div class="flex gap-4 items-start" ref={setGridEl}>
      <For each={columns()}>
        {(col) => (
          <div class="flex-1 flex flex-col gap-4 min-w-0">
            <For each={col}>
              {() => <div class="h-64 rounded-2xl bg-elevated animate-pulse" />}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}

export default function CardsContentWidget() {
  const auth = useAuth();
  const { t } = useI18n();
  const nick = usePageNick();
  const isList = useIsCardsList();
  // Same query key as the header switcher and the board — one request.
  const [kanban] = createQueryResource("kanban-config", nick, fetchKanban);
  const showKanban = () => boardView() === "kanban" && !!kanban()?.enabled;
  const [gridEl, setGridEl] = createSignal<HTMLDivElement>();
  const colCount = useColumnCount(gridEl, MIN_COLUMN_REM, MAX_COLUMNS);
  const columns = createMemo(() => splitIntoColumns(posts(), colCount()));
  let initialized = false;

  createEffect(() => {
    if (auth.loading) return;
    if (showKanban()) return; // the board runs its own query
    if (initialized) return;
    initialized = true;
    resetPosts();
    loadCards(nick());
  });

  onCleanup(() => resetPosts());

  return (
    <Show when={isList()}>
      {/* The kanban board fills the main column like the post streams do — its
          columns scroll horizontally, so a reading-width cap only shrinks how
          many fit. The masonry board keeps its cap. */}
      <div class="space-y-4" classList={{ "max-w-5xl mx-auto": !showKanban() }}>
        <Show when={!showKanban()} fallback={<KanbanBoard nick={nick()} />}>
        <Show when={!loading()} fallback={<CardsBoardSkeleton />}>
          <Show
            when={posts().length > 0}
            fallback={
              <div class="text-center py-16 text-muted text-sm space-y-2">
                <MdOutlineStyle class="text-2xl text-muted mx-auto" />
                <p>{t("cards.no_cards")}</p>
              </div>
            }
          >
            <div class="flex gap-4 items-start" ref={setGridEl}>
              <For each={columns()}>
                {(col) => (
                  <div class="flex-1 flex flex-col gap-4 min-w-0">
                    <For each={col}>
                      {(post) => (
                        <CardFace card={post} nick={nick()} />
                      )}
                    </For>
                  </div>
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
                  {t("cards.load_more")}
                </button>
              </div>
            </Show>

            <Show when={!hasMore()}>
              <p class="text-center py-2 text-xs text-muted">{t("cards.all_loaded")}</p>
            </Show>
          </Show>
        </Show>
        </Show>
      </div>
    </Show>
  );
}
