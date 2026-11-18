// Kanban view of the cards page: cards carrying the `kanban` category, in
// columns by deck ("shelf"). The column list is the channel's own ordered list
// (pconfig spa/kanban_columns) so Todo→Doing→Done survives and an empty column
// can exist; any kanban card whose deck isn't a configured column lands in
// Unfiled, so a card is never invisible.
//
// Its own query rather than the module's createStreamStore: that store is the
// masonry view's paginated, filter-driven singleton, and sharing it would make
// a category click in one view mutate the other.

import { createMemo, createSignal, Show, For, createOptimistic, action, isPending } from "solid-js";
import { MdOutlineStyle, MdOutlineAdd, MdOutlineEdit, MdOutlineClose,
         MdOutlineDrag_indicator, MdOutlineView_kanban } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import CardComposer from "@/shared/editor/composers/CardComposer";
import ComposerModal from "@/shared/editor/components/ComposerModal";
import { useAsyncQuery } from "@utsukta/spa-core/lib/query";
import { invalidate } from "@utsukta/spa-core/lib/query-client";
import AsyncBoundary from "@/shared/views/AsyncBoundary";
import { toast } from "@utsukta/spa-core/store/toast";
import type { Post } from "@utsukta/spa-core/types/post.types";
import CardFace from "./CardFace";
import { useSearchParams } from "@solidjs/router";
import { fetchCards, fetchKanban, saveKanbanBoards, moveCard, renameDeck, renameBoard,
         type KanbanBoardDef } from "../api";
import { UNFILED } from "../lib/kanban";
import { createKanbanDrag, type Column } from "../lib/useKanbanDrag";
import { Button, IconButton } from "@ui/Button";
import { EmptyState } from "@ui/EmptyState";

export default function KanbanBoard(props: { nick: string }) {
  const { t } = useI18n();
  const role = useViewerRole();
  const auth = useAuth();
  const isOwner = () => role() === "owner";
  // Which column's "new card" composer is open (null = none). Empty string is
  // the Unfiled column, so this can't be a plain string.
  const [composeIn, setComposeIn] = createSignal<string | null>(null);

  // Same cache keys the header/content widgets read through createQueryResource.
  const configKey = () => ["kanban-config", props.nick] as const;
  const configQ = useAsyncQuery(() => ({ queryKey: configKey(), queryFn: () => fetchKanban(props.nick) }));
  // The saved board list, with an edit shown at once; a failed save rolls it back.
  const [boards, setBoards] = createOptimistic((): KanbanBoardDef[] => configQ.data?.boards ?? []);

  // A board is a category; the active one lives in the URL so it is linkable
  // and survives a reload, unlike the board/masonry choice.
  const [params, setParams] = useSearchParams<{ board?: string }>();
  // "" means the channel has no boards yet — nothing to fetch, nothing to show
  // but the invitation to create one.
  const activeBoard = () => {
    const list = boards();
    const wanted = params.board;
    if (wanted && list.some((b) => b.name === wanted)) return wanted;
    return list[0]?.name ?? "";
  };

  // No `enabled`: a disabled native query never settles. With no board the
  // fn answers [] without a request.
  const cardsKey = () => ["kanban-cards", { nick: props.nick, board: activeBoard() }] as const;
  const cardsQ = useAsyncQuery(() => ({
    queryKey: cardsKey(),
    queryFn: async () => (activeBoard() ? (await fetchCards(props.nick, { cat: activeBoard() })).cards : []),
  }));
  const refetchCards = () => invalidate(cardsKey());
  // The fetched cards, with a drop shown at once until the write settles.
  const [cards, setCards] = createOptimistic((): Post[] => cardsQ.data);

  const columnNames = () =>
    boards().find((b) => b.name === activeBoard())?.columns ?? [];

  // Source grouping: configured columns in their configured order, then the
  // Unfiled catch-all. Cards sort by deck_order, unordered ones last.
  const grouped = createMemo<Column<Post>[]>(() => {
    const names = columnNames();
    const cols: Column<Post>[] = [...names, UNFILED].map((key) => ({ key, items: [] }));
    const byKey = new Map(cols.map((c) => [c.key, c]));
    for (const card of cards()) {
      const deck = card.deck?.name ?? "";
      (byKey.get(deck) ?? byKey.get(UNFILED)!).items.push(card);
    }
    for (const c of cols) {
      c.items.sort((a, b) => (a.deck?.order ?? 1e9) - (b.deck?.order ?? 1e9));
    }
    return cols;
  });

  const drag = createKanbanDrag<Post>(
    grouped,
    (c) => c.uuid,
    (card, columnKey, index) => void commitMove(card, columnKey, index),
  );

  const commitMove = action(function* (card: Post, columnKey: string, index: number) {
    if ((card.deck?.name ?? "") === columnKey && (card.deck?.order ?? 0) === index + 1) return;
    // The target column as dropped: its other cards in order, the card at
    // `index`. Built here, not read back from the board — writes are batched,
    // so the board still shows the old layout until this action yields.
    const siblings = (grouped().find((c) => c.key === columnKey)?.items ?? []).filter((c) => c.uuid !== card.uuid);
    siblings.splice(index, 0, card);
    const order = new Map(siblings.map((c, i) => [c.uuid, i + 1]));
    // Every card in the column keeps its slot while the writes are in flight.
    setCards((list) =>
      list.map((c) =>
        order.has(c.uuid) ? { ...c, deck: columnKey ? { name: columnKey, order: order.get(c.uuid)! } : null } : c,
      ),
    );
    try {
      yield moveCard(props.nick, card.uuid, columnKey, index + 1);
      // Renumber the rest of the target column so a later drop lands where it
      // was aimed rather than behind every unnumbered sibling.
      yield Promise.all(
        siblings.map((s, i) =>
          s.uuid === card.uuid ? null : moveCard(props.nick, s.uuid, columnKey, i + 1),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("cards.kanban_move_failed"));
    }
    yield refetchCards();
  });

  const persistBoards = action(function* (next: KanbanBoardDef[]) {
    setBoards(next);
    try {
      yield saveKanbanBoards(props.nick, next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Saving boards failed");
      return;
    }
    yield invalidate(configKey());
  });

  /** Rewrite only the active board's columns. */
  const persistColumns = (next: string[]) => {
    const name = activeBoard();
    const list = boards();
    return persistBoards(
      list.some((b) => b.name === name)
        ? list.map((b) => (b.name === name ? { ...b, columns: next } : b))
        : [...list, { name, columns: next }],
    );
  };

  function addBoard() {
    const name = window.prompt(t("cards.kanban_board_name"), "")?.trim();
    if (!name || boards().some((b) => b.name === name)) return;
    void persistBoards([...boards(), { name, columns: [] }]);
    setParams({ board: name });
  }

  async function doRenameBoard(from: string) {
    const to = window.prompt(t("cards.kanban_board_name"), from)?.trim();
    if (!to || to === from || boards().some((b) => b.name === to)) return;
    try {
      // Retag first: if this fails the board keeps its name and its cards.
      await renameBoard(props.nick, from, to);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
      return;
    }
    await persistBoards(boards().map((b) => (b.name === from ? { ...b, name: to } : b)));
    setParams({ board: to });
    void refetchCards();
  }

  /** Removes the board from the list only — its cards keep the category. */
  function removeBoard(name: string) {
    if (!window.confirm(t("cards.kanban_remove_board_confirm"))) return;
    void persistBoards(boards().filter((b) => b.name !== name));
    setParams({ board: undefined });
  }

  function addColumn() {
    const name = window.prompt(t("cards.kanban_column_name"), "")?.trim();
    if (!name || columnNames().includes(name)) return;
    void persistColumns([...columnNames(), name]);
  }

  async function doRenameColumn(from: string) {
    const to = window.prompt(t("cards.kanban_column_name"), from)?.trim();
    if (!to || to === from || columnNames().includes(to)) return;
    try {
      await renameDeck(props.nick, from, to);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
      return;
    }
    await persistColumns(columnNames().map((n) => (n === from ? to : n)));
    void refetchCards();
  }

  /** Removes the column from the board only — its cards fall into Unfiled. */
  function removeColumn(name: string) {
    void persistColumns(columnNames().filter((n) => n !== name));
  }

  const label = (key: string) => key || t("cards.kanban_unfiled");

  /** Append position for a card created in this column. */
  const nextOrderIn = (key: string) =>
    (grouped().find((c) => c.key === key)?.items.length ?? 0) + 1;

  return (
    <AsyncBoundary fallback={<BoardSkeleton />}>
     <Show when={boards().length > 0} fallback={<NoBoards onCreate={addBoard} owner={isOwner()} />}>
      {/* Board tabs. A board is a category, so switching boards refetches with
          a different `cat` — the URL carries it so the tab is linkable. */}
      <div class="flex items-center gap-1 border-b border-rim overflow-x-auto">
        <For each={boards()}>
          {(b) => (
            <Button
              variant="ghost"
              size="sm"
              pressed={b.name === activeBoard()}
              class="-mb-px"
              onClick={() => setParams({ board: b.name })}
            >
              {b.name}
            </Button>
          )}
        </For>

        <Show when={isOwner()}>
          <IconButton label={t("cards.kanban_add_board")} onClick={addBoard}>
            <MdOutlineAdd size={16} />
          </IconButton>

          <div class="ml-auto flex items-center gap-0.5 pl-2">
            <IconButton
              label={t("cards.kanban_rename_board")}
              size="sm"
              onClick={() => void doRenameBoard(activeBoard())}
            >
              <MdOutlineEdit size={14} />
            </IconButton>
            <Show when={boards().length > 1}>
              <IconButton
                label={t("cards.kanban_remove_board")}
                size="sm"
                onClick={() => removeBoard(activeBoard())}
              >
                <MdOutlineClose size={14} />
              </IconButton>
            </Show>
          </div>
        </Show>
      </div>

      <div class={["flex gap-3 items-start overflow-x-auto pb-2 pt-3 transition-opacity", { "opacity-60": isPending(() => cardsQ.data) }]}>
        <For each={drag.display()}>
          {(col) => (
            // The Unfiled column is noise when it's empty — on an empty board
            // it reads as a broken placeholder, so it appears only once it
            // actually holds cards.
            <Show when={col.key !== UNFILED || col.items.length > 0}>
              <div class="w-64 shrink-0 rounded-2xl bg-elevated/40 border border-rim p-2 flex flex-col gap-2">
                <div class="flex items-center gap-1 px-1">
                  <h3
                    class={["text-sm font-semibold truncate", { "text-txt": !!col.key, "text-muted italic": !col.key }]}
                  >
                    {label(col.key)}
                  </h3>
                  <span class="text-xs text-muted">{col.items.length}</span>
                  <Show when={isOwner()}>
                    <div class="ml-auto flex items-center gap-0.5">
                      <IconButton
                        label={t("cards.kanban_add_card")}
                        size="sm"
                        onClick={() => setComposeIn(col.key)}
                      >
                        <MdOutlineAdd size={14} />
                      </IconButton>
                    </div>
                  </Show>
                  <Show when={isOwner() && col.key}>
                    <div class="flex items-center gap-0.5">
                      <IconButton
                        label={t("cards.kanban_rename_column")}
                        size="sm"
                        onClick={() => void doRenameColumn(col.key)}
                      >
                        <MdOutlineEdit size={14} />
                      </IconButton>
                      <IconButton
                        label={t("cards.kanban_remove_column")}
                        size="sm"
                        onClick={() => removeColumn(col.key)}
                      >
                        <MdOutlineClose size={14} />
                      </IconButton>
                    </div>
                  </Show>
                </div>

                <div ref={drag.registerColumn(col.key)} class="flex flex-col gap-2 min-h-16">
                  <For
                    each={col.items}
                    fallback={
                      <EmptyState size="sm" class="border border-dashed border-rim rounded-xl">
                        {t("cards.kanban_empty_column")}
                      </EmptyState>
                    }
                  >
                    {(card) => (
                      <div
                        ref={drag.registerCard(card.uuid)}
                        class={["relative transition-opacity", { "opacity-50": drag.draggingKey() === card.uuid }]}
                      >
                        <CardFace card={card} nick={props.nick} />
                        <Show when={isOwner()}>
                          <button
                            type="button"
                            aria-label={t("cards.kanban_drag")}
                            title={t("cards.kanban_drag")}
                            onPointerDown={drag.onHandlePointerDown(card)}
                            class="absolute top-1 right-1 p-1 rounded-lg bg-surface/80 text-muted
                                   hover:text-txt hover:bg-elevated cursor-grab active:cursor-grabbing
                                   touch-none transition-colors"
                          >
                            <MdOutlineDrag_indicator size={16} />
                          </button>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          )}
        </For>

        <Show when={isOwner()}>
          <button
            type="button"
            onClick={addColumn}
            class="w-64 shrink-0 flex items-center justify-center gap-1.5 py-3 text-sm
                   rounded-2xl border border-dashed border-rim text-muted
                   hover:text-txt hover:bg-elevated transition-colors"
          >
            <MdOutlineAdd size={16} />
            {t("cards.kanban_add_column")}
          </button>
        </Show>
      </div>

      <Show when={(cards()?.length ?? 0) === 0}>
        <div class="text-center py-16 text-muted text-sm space-y-2">
          <MdOutlineStyle class="text-2xl text-muted mx-auto" />
          <p>{t("cards.kanban_no_cards", { board: activeBoard() })}</p>
        </div>
      </Show>

      {/* New card seeded into the column it was started from: the kanban
          category is what puts it on the board, the deck is which column. Both
          stay editable in the composer's own fields. */}
      <Show when={composeIn() !== null}>
        <ComposerModal
          title={t("cards.new_card")}
          onClose={() => setComposeIn(null)}
          widthClass="max-w-3xl"
        >
          <CardComposer
            profileUid={auth()!.uid}
            nick={props.nick}
            initial={{
              uuid: "", title: "", summary: "", slug: "", body: "",
              category: activeBoard(),
              deck: composeIn()
                ? { name: composeIn()!, order: nextOrderIn(composeIn()!) }
                : null,
            }}
            onSaved={() => { setComposeIn(null); void refetchCards(); }}
            onCancel={() => setComposeIn(null)}
          />
        </ComposerModal>
      </Show>
     </Show>
    </AsyncBoundary>
  );
}

function NoBoards(props: { owner: boolean; onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <div class="text-center py-16 text-muted text-sm space-y-3">
      <MdOutlineView_kanban class="text-3xl text-muted mx-auto" />
      <p>{t("cards.kanban_no_boards")}</p>
      <Show when={props.owner}>
        <Button variant="ghost" size="sm" onClick={props.onCreate}>
          <MdOutlineAdd size={16} />
          {t("cards.kanban_add_board")}
        </Button>
      </Show>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div class="flex gap-3 items-start overflow-hidden">
      <For each={[0, 1, 2]}>
        {() => <div class="w-64 h-64 shrink-0 rounded-2xl bg-elevated animate-pulse" />}
      </For>
    </div>
  );
}
