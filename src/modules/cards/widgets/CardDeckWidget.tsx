// CardDeckWidget.tsx
// API: GET /spa/stream-widgets/series?channel_nick=<nick>&type=cards
//
// Like the article series widget, clicking a deck navigates to its dedicated
// page — a deck is an ordered sequence, not a facet of the current board.
// Shuffle needs no endpoint of its own: the deck's members are already
// fetched to render the row, so picking one at random is a client-side
// concern (see the ponytail note on pickRandom below).

import { For, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { MdOutlineShuffle } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchDeckDetail } from "../api";
import { cardPath } from "@/shared/lib/shareLinks";

interface DeckItem {
  name: string;
  count: number;
}

async function fetchDecks(nick: string): Promise<DeckItem[]> {
  const url = new URL("/spa/stream-widgets/series", window.location.origin);
  url.searchParams.set("channel_nick", nick);
  url.searchParams.set("type", "cards");
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const json = await res.json();
  return json.data?.series ?? [];
}

/** Two offset outlines behind the row, so a deck reads as a stack of cards. */
function StackGlyph() {
  return (
    <span class="relative inline-block w-4 h-5 shrink-0" aria-hidden="true">
      <span class="absolute inset-0 translate-x-1 -translate-y-0.5 rounded-[3px] border border-rim opacity-50" />
      <span class="absolute inset-0 translate-x-0.5 rounded-[3px] border border-rim opacity-75" />
      <span class="absolute inset-0 rounded-[3px] border border-rim bg-elevated" />
    </span>
  );
}

export default function CardDeckWidget() {
  const { t } = useI18n();
  const nick = usePageNick();
  const navigate = useNavigate();

  const [data] = createQueryResource(
    "stream-decks",
    () => nick(),
    (n) => fetchDecks(n),
  );

  // ponytail: fetches the deck on click rather than prefetching every deck's
  // members up front. One extra request on a rare action beats N requests on
  // every render; swap to a server-side random endpoint only if this shows up.
  async function shuffle(e: MouseEvent, deckName: string) {
    e.preventDefault();
    e.stopPropagation();
    const { cards } = await fetchDeckDetail(nick(), deckName);
    if (!cards.length) return;
    navigate(cardPath(nick(), cards[Math.floor(Math.random() * cards.length)]));
  }

  return (
    <div class="bg-surface border border-rim rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-rim">
        <h3 class="text-sm font-semibold text-txt">{t("widgets.card_deck")}</h3>
      </div>

      <Show when={!data.loading}>
        <Show
          when={(data() ?? []).length > 0}
          fallback={<p class="px-4 py-3 text-xs text-muted">{t("cards.deck_no_decks")}</p>}
        >
          <ul class="divide-y divide-rim">
            <For each={data()}>
              {(deck) => (
                <li>
                  <A
                    href={`/cards/${nick()}/deck/${encodeURIComponent(deck.name)}`}
                    class="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-elevated transition-colors group"
                  >
                    <StackGlyph />
                    <span class="flex-1 text-sm truncate text-txt group-hover:text-accent transition-colors">
                      {deck.name}
                    </span>
                    <span class="text-xs text-muted shrink-0">{deck.count}</span>
                    <button
                      type="button"
                      onClick={(e) => void shuffle(e, deck.name)}
                      title={t("cards.shuffle")}
                      class="p-1 rounded text-muted hover:text-accent hover:bg-surface transition-colors shrink-0"
                    >
                      <MdOutlineShuffle size={15} />
                    </button>
                  </A>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}
