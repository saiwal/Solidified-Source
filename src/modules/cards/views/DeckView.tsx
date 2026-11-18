// src/modules/cards/views/DeckView.tsx
import { createMemo, Show, For, createOptimistic, action } from "solid-js";
import { useParams } from "@solidjs/router";
import { BiRegularChevronUp, BiRegularChevronDown, BiRegularEdit } from "solid-icons/bi";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { useViewerRole, usePageNick } from "@utsukta/spa-core/store/site-config";
import { useAsyncQuery } from "@utsukta/spa-core/lib/query";
import { invalidate } from "@utsukta/spa-core/lib/query-client";
import AsyncBoundary from "@/shared/views/AsyncBoundary";
import { fetchDeckDetail, renameDeck, reorderDeck } from "../api";
import { cardPath } from "@/shared/lib/shareLinks";
import type { Post } from "@utsukta/spa-core/types/post.types";
import PageActions from "@/shared/views/layout/PageActions";
import { cardClass } from "@ui/Card";
import { EmptyState } from "@ui/EmptyState";

export default function DeckView() {
  const params = useParams<{ nick: string; name: string }>();
  const pageNick = usePageNick();
  const nick = () => params.nick || pageNick();
  // Pinned so the leaving view's key doesn't change mid-navigation (see SeriesView).
  const name = createMemo((prev?: string) => (params.name ? decodeURIComponent(params.name) : prev ?? ""));
  const role = useViewerRole();
  const { t } = useI18n();
  const isOwner = () => role() === "owner";

  const key = () => ["deck-detail", { nick: nick(), name: name() }] as const;
  const q = useAsyncQuery(() => ({ queryKey: key(), queryFn: () => fetchDeckDetail(nick(), name()) }));

  // The fetched order, with a move shown at once; a failed save rolls it back.
  const [order, setOrder] = createOptimistic((): Post[] => q.data.cards);

  const persistOrder = action(function* (next: Post[]) {
    setOrder(next);
    try {
      yield reorderDeck(nick(), name(), next.map((a) => a.uuid));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
      return;
    }
    yield invalidate(key());
  });

  function move(index: number, dir: -1 | 1) {
    const next = [...order()];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void persistOrder(next);
  }

  async function doRename() {
    const to = window.prompt(t("cards.deck_rename_prompt"), name());
    if (!to || to.trim() === name()) return;
    try {
      await renameDeck(nick(), name(), to.trim());
      window.location.href = `/cards/${nick()}/deck/${encodeURIComponent(to.trim())}`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    }
  }

  return (
    <div class="space-y-6 max-w-3xl mx-auto">
      <a
        href={`/cards/${nick()}/deck`}
        class="inline-flex items-center gap-1 text-sm text-muted hover:text-txt transition-colors"
      >
        {t("cards.back_to_deck_index")}
      </a>

      <div class="flex items-center justify-between gap-3">
        <h1 class="text-xl font-bold text-txt">{name()}</h1>
        <PageActions label={name()} actions={[
          { label: t("cards.deck_rename"), icon: BiRegularEdit, onClick: doRename, show: isOwner() },
        ]} />
      </div>

      <Show when={isOwner()}>
        <p class="text-xs text-muted">{t("cards.deck_reorder_hint")}</p>
      </Show>

      <AsyncBoundary fallback={<p class="text-sm text-muted">…</p>}>
        <Show
          when={order().length > 0}
          fallback={<EmptyState>{t("cards.deck_no_decks")}</EmptyState>}
        >
          <ol class="space-y-2">
            <For each={order()}>
              {(card, i) => (
                <li class={`${cardClass()} flex items-center gap-3 px-4 py-3`}>
                  <span class="text-sm text-muted w-6 shrink-0">{i() + 1}.</span>
                  <a
                    href={cardPath(nick(), card)}
                    class="flex-1 min-w-0 truncate text-sm font-medium text-txt hover:text-accent transition-colors"
                  >
                    {card.title || t("cards.untitled")}
                  </a>
                  <Show when={isOwner()}>
                    <div class="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={i() === 0}
                        onClick={() => move(i(), -1)}
                        class="p-1 rounded text-muted hover:text-txt hover:bg-elevated disabled:opacity-30 transition-colors"
                      >
                        <BiRegularChevronUp class="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={i() === order().length - 1}
                        onClick={() => move(i(), 1)}
                        class="p-1 rounded text-muted hover:text-txt hover:bg-elevated disabled:opacity-30 transition-colors"
                      >
                        <BiRegularChevronDown class="w-4 h-4" />
                      </button>
                    </div>
                  </Show>
                </li>
              )}
            </For>
          </ol>
        </Show>
      </AsyncBoundary>
    </div>
  );
}
