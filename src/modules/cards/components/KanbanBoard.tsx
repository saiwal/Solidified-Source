// Kanban view of the cards page: cards carrying the `kanban` category, in
// columns by deck ("shelf"). The column list is the channel's own ordered list
// (pconfig spa/kanban_columns) so Todo→Doing→Done survives and an empty column
// can exist; any kanban card whose deck isn't a configured column lands in
// Unfiled, so a card is never invisible.
//
// Its own query rather than the module's createStreamStore: that store is the
// masonry view's paginated, filter-driven singleton, and sharing it would make
// a category click in one view mutate the other.

import { createMemo, createSignal, Show, For } from "solid-js";
import { MdOutlineStyle, MdOutlineAdd, MdOutlineEdit, MdOutlineClose,
         MdOutlineDrag_indicator } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import CardComposer from "@/shared/editor/composers/CardComposer";
import ComposerModal from "@/shared/editor/components/ComposerModal";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { toast } from "@utsukta/spa-core/store/toast";
import type { Post } from "@utsukta/spa-core/types/post.types";
import CardFace from "./CardFace";
import { useSearchParams } from "@solidjs/router";
import { fetchCards, fetchKanban, saveKanbanBoards, moveCard, renameDeck, renameBoard,
         type KanbanBoardDef } from "../api";
import { DEFAULT_BOARD, UNFILED } from "../lib/kanban";
import { createKanbanDrag, type Column } from "../lib/useKanbanDrag";

export default function KanbanBoard(props: { nick: string }) {
  const { t } = useI18n();
  const role = useViewerRole();
  const auth = useAuth();
  const isOwner = () => role() === "owner";
  // Which column's "new card" composer is open (null = none). Empty string is
  // the Unfiled column, so this can't be a plain string.
  const [composeIn, setComposeIn] = createSignal<string | null>(null);

  const [config, { mutate: mutateConfig }] = createQueryResource(
    "kanban-config",
    () => props.nick,
    fetchKanban,
  );

  // A board is a category; the active one lives in the URL so it is linkable
  // and survives a reload, unlike the board/masonry choice.
  const [params, setParams] = useSearchParams<{ board?: string }>();
  const boards = (): KanbanBoardDef[] => config()?.boards ?? [];
  const activeBoard = () => {
    const list = boards();
    const wanted = params.board;
    if (wanted && list.some((b) => b.name === wanted)) return wanted;
    return list[0]?.name ?? DEFAULT_BOARD;
  };

  const [cards, { mutate: mutateCards, refetch: refetchCards }] = createQueryResource(
    "kanban-cards",
    () => ({ nick: props.nick, board: activeBoard() }),
    async ({ nick, board }) => (await fetchCards(nick, { cat: board })).cards,
  );

  const columnNames = () =>
    boards().find((b) => b.name === activeBoard())?.columns ?? [];

  // Source grouping: configured columns in their configured order, then the
  // Unfiled catch-all. Cards sort by deck_order, unordered ones last.
  const grouped = createMemo<Column<Post>[]>(() => {
    const names = columnNames();
    const cols: Column<Post>[] = [...names, UNFILED].map((key) => ({ key, items: [] }));
    const byKey = new Map(cols.map((c) => [c.key, c]));
    for (const card of cards() ?? []) {
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

  async function commitMove(card: Post, columnKey: string, index: number) {
    if ((card.deck?.name ?? "") === columnKey && (card.deck?.order ?? 0) === index + 1) return;
    // Patch the cached list so the card stays put while the write is in flight.
    mutateCards((list) =>
      (list ?? []).map((c) =>
        c.uuid === card.uuid
          ? { ...c, deck: columnKey ? { name: columnKey, order: index + 1 } : null }
          : c,
      ),
    );
    try {
      await moveCard(props.nick, card.uuid, columnKey, index + 1);
      // Renumber the rest of the target column so a later drop lands where it
      // was aimed rather than behind every unnumbered sibling.
      const siblings = drag.display().find((c) => c.key === columnKey)?.items ?? [];
      await Promise.all(
        siblings.map((s, i) =>
          s.uuid === card.uuid ? null : moveCard(props.nick, s.uuid, columnKey, i + 1),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("cards.kanban_move_failed"));
    }
    refetchCards();
  }

  async function persistBoards(next: KanbanBoardDef[]) {
    const prev = boards();
    mutateConfig((c) => (c ? { ...c, boards: next } : c));
    try {
      await saveKanbanBoards(props.nick, next);
    } catch (e) {
      mutateConfig((c) => (c ? { ...c, boards: prev } : c));
      toast.error(e instanceof Error ? e.message : "Saving boards failed");
    }
  }

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
    refetchCards();
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
    refetchCards();
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
    <Show when={!config.loading && !cards.loading} fallback={<BoardSkeleton />}>
      {/* Board tabs. A board is a category, so switching boards refetches with
          a different `cat` — the URL carries it so the tab is linkable. */}
      <div class="flex items-center gap-1 border-b border-rim overflow-x-auto">
        <For each={boards()}>
          {(b) => (
            <button
              type="button"
              onClick={() => setParams({ board: b.name })}
              class="px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
              classList={{
                "border-accent text-txt font-medium": b.name === activeBoard(),
                "border-transparent text-muted hover:text-txt": b.name !== activeBoard(),
              }}
            >
              {b.name}
            </button>
          )}
        </For>

        <Show when={isOwner()}>
          <button
            type="button"
            title={t("cards.kanban_add_board")}
            onClick={addBoard}
            class="px-2 py-2 text-muted hover:text-txt transition-colors"
          >
            <MdOutlineAdd size={16} />
          </button>

          <div class="ml-auto flex items-center gap-0.5 pl-2">
            <button
              type="button"
              title={t("cards.kanban_rename_board")}
              onClick={() => void doRenameBoard(activeBoard())}
              class="p-1.5 rounded text-muted hover:text-txt hover:bg-elevated transition-colors"
            >
              <MdOutlineEdit size={14} />
            </button>
            <Show when={boards().length > 1}>
              <button
                type="button"
                title={t("cards.kanban_remove_board")}
                onClick={() => removeBoard(activeBoard())}
                class="p-1.5 rounded text-muted hover:text-txt hover:bg-elevated transition-colors"
              >
                <MdOutlineClose size={14} />
              </button>
            </Show>
          </div>
        </Show>
      </div>

      <div class="flex gap-3 items-start overflow-x-auto pb-2 pt-3">
        <For each={drag.display()}>
          {(col) => (
            // The Unfiled column is noise when it's empty and there are real
            // columns to drop into — but it must stay visible while dragging.
            <Show when={col.key !== UNFILED || col.items.length > 0 || columnNames().length === 0}>
              <div class="w-64 shrink-0 rounded-2xl bg-elevated/40 border border-rim p-2 flex flex-col gap-2">
                <div class="flex items-center gap-1 px-1">
                  <h3
                    class="text-sm font-semibold truncate"
                    classList={{ "text-txt": !!col.key, "text-muted italic": !col.key }}
                  >
                    {label(col.key)}
                  </h3>
                  <span class="text-xs text-muted">{col.items.length}</span>
                  <Show when={isOwner()}>
                    <div class="ml-auto flex items-center gap-0.5">
                      <button
                        type="button"
                        title={t("cards.kanban_add_card")}
                        onClick={() => setComposeIn(col.key)}
                        class="p-1 rounded text-muted hover:text-txt hover:bg-elevated transition-colors"
                      >
                        <MdOutlineAdd size={14} />
                      </button>
                    </div>
                  </Show>
                  <Show when={isOwner() && col.key}>
                    <div class="flex items-center gap-0.5">
                      <button
                        type="button"
                        title={t("cards.kanban_rename_column")}
                        onClick={() => void doRenameColumn(col.key)}
                        class="p-1 rounded text-muted hover:text-txt hover:bg-elevated transition-colors"
                      >
                        <MdOutlineEdit size={14} />
                      </button>
                      <button
                        type="button"
                        title={t("cards.kanban_remove_column")}
                        onClick={() => removeColumn(col.key)}
                        class="p-1 rounded text-muted hover:text-txt hover:bg-elevated transition-colors"
                      >
                        <MdOutlineClose size={14} />
                      </button>
                    </div>
                  </Show>
                </div>

                <div ref={drag.registerColumn(col.key)} class="flex flex-col gap-2 min-h-16">
                  <For
                    each={col.items}
                    fallback={
                      <p class="text-xs text-muted text-center py-6 border border-dashed border-rim rounded-xl">
                        {t("cards.kanban_empty_column")}
                      </p>
                    }
                  >
                    {(card) => (
                      <div
                        ref={drag.registerCard(card.uuid)}
                        class="relative transition-opacity"
                        classList={{ "opacity-50": drag.draggingKey() === card.uuid }}
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
            onSaved={() => { setComposeIn(null); refetchCards(); }}
            onCancel={() => setComposeIn(null)}
          />
        </ComposerModal>
      </Show>
    </Show>
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
