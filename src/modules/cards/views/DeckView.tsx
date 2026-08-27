// src/modules/cards/views/DeckView.tsx
import { createSignal, createEffect, Show, For } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { BiRegularChevronUp, BiRegularChevronDown, BiRegularEdit } from "solid-icons/bi";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { useViewerRole, usePageNick } from "@utsukta/spa-core/store/site-config";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchDeckDetail, renameDeck, reorderDeck } from "../api";
import { cardPath } from "@/shared/lib/shareLinks";
import type { Post } from "@utsukta/spa-core/types/post.types";

export default function DeckView() {
  const params = useParams<{ nick: string; name: string }>();
  const pageNick = usePageNick();
  const nick = () => params.nick || pageNick();
  const name = () => decodeURIComponent(params.name);
  const role = useViewerRole();
  const { t } = useI18n();
  const isOwner = () => role() === "owner";

  const [data, { refetch }] = createQueryResource(
    "deck-detail",
    () => ({ nick: nick(), name: name() }),
    ({ nick, name }) => fetchDeckDetail(nick, name),
  );

  const [order, setOrder] = createSignal<Post[]>([]);
  createEffect(() => setOrder(data()?.cards ?? []));

  async function persistOrder(next: Post[]) {
    setOrder(next);
    try {
      await reorderDeck(nick(), name(), next.map((a) => a.uuid));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
      refetch();
    }
  }

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
      <A
        href={`/cards/${nick()}/deck`}
        class="inline-flex items-center gap-1 text-sm text-muted hover:text-txt transition-colors"
      >
        {t("cards.back_to_deck_index")}
      </A>

      <div class="flex items-center justify-between gap-3">
        <h1 class="text-xl font-bold text-txt">{name()}</h1>
        <Show when={isOwner()}>
          <button
            type="button"
            onClick={doRename}
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-rim
                   text-muted hover:text-txt hover:bg-elevated transition-colors"
          >
            <BiRegularEdit class="w-4 h-4" />
            {t("cards.deck_rename")}
          </button>
        </Show>
      </div>

      <Show when={isOwner()}>
        <p class="text-xs text-muted">{t("cards.deck_reorder_hint")}</p>
      </Show>

      <Show when={!data.loading} fallback={<p class="text-sm text-muted">…</p>}>
        <Show
          when={order().length > 0}
          fallback={<p class="text-sm text-muted py-8 text-center">{t("cards.deck_no_decks")}</p>}
        >
          <ol class="space-y-2">
            <For each={order()}>
              {(card, i) => (
                <li class="flex items-center gap-3 bg-surface border border-rim rounded-xl px-4 py-3">
                  <span class="text-sm text-muted w-6 shrink-0">{i() + 1}.</span>
                  <A
                    href={cardPath(nick(), card)}
                    class="flex-1 min-w-0 truncate text-sm font-medium text-txt hover:text-accent transition-colors"
                  >
                    {card.title || t("cards.untitled")}
                  </A>
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
      </Show>
    </div>
  );
}
