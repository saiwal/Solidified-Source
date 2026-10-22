// src/modules/cards/views/DeckIndexView.tsx
import { Show, For } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchDeckList } from "../api";
import { EmptyState } from "@ui/EmptyState";

export default function DeckIndexView() {
  const params = useParams<{ nick: string }>();
  const pageNick = usePageNick();
  const nick = () => params.nick || pageNick();
  const { t } = useI18n();

  const [data] = createQueryResource(
    "deck-list",
    () => nick(),
    (n) => fetchDeckList(n),
  );

  return (
    <div class="space-y-6 max-w-3xl mx-auto">
      <A
        href={`/cards/${nick()}`}
        class="inline-flex items-center gap-1 text-sm text-muted hover:text-txt transition-colors"
      >
        {t("cards.all_cards")}
      </A>

      <h1 class="text-xl font-bold text-txt">{t("cards.deck_index_title")}</h1>

      <Show when={!data.loading}>
        <Show
          when={(data() ?? []).length > 0}
          fallback={<EmptyState>{t("cards.deck_no_decks")}</EmptyState>}
        >
          <div class="space-y-2">
            <For each={data()}>
              {(deck) => (
                <A
                  href={`/cards/${nick()}/deck/${encodeURIComponent(deck.name)}`}
                  class="flex items-center justify-between gap-3 bg-surface border border-rim rounded-xl
                         px-4 py-3 hover:border-rim-strong hover:bg-elevated transition-colors"
                >
                  <span class="text-sm font-medium text-txt">{deck.name}</span>
                  <span class="text-xs text-muted">{t("cards.deck_cards_count", { count: deck.count })}</span>
                </A>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
