/**
 * CardPickerModal.tsx
 * Picks one of the composing user's own cards and inserts it as a compact
 * [card=<id>][/card] token. The token is expanded into a self-contained block
 * at save time (Api/Concerns/EmbedsCards.php) and rendered live in the WYSIWYG
 * by hydrateCardEmbeds().
 *
 * Only the user's own cards are offered: expandCardTags refuses anything the
 * composing channel can't embed, so listing other people's cards here would
 * just be a way to earn a 422 on save.
 */
import { createSignal, createMemo, onMount, Show, For, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import { fetchCardsPickerList } from "@/modules/cards/api";

import { Modal, ModalPanel } from "@ui/Modal";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { CardHeader } from "@ui/Card";
interface Props {
  onClose: () => void;
  onInsert: (iid: number) => void;
}

const CardPickerModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const [query, setQuery] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  const nick = currentNick;

  const [cards] = createQueryResource(
    "card-picker",
    () => nick() || null,
    (n) => fetchCardsPickerList(n),
  );

  // Filtering is client-side: the picker fetches one page of the user's own
  // cards, and re-querying the server per keystroke would be a request per
  // character for a list this size.
  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    const all = cards() ?? [];
    if (!q) return all;
    return all.filter(
      (c) => c.title.toLowerCase().includes(q) || (c.deck ?? "").toLowerCase().includes(q),
    );
  });

  onMount(() => inputRef?.focus());

  const choose = (iid: number) => {
    props.onInsert(iid);
    props.onClose();
  };

  return (
    <Modal onClose={props.onClose} class="z-[80]">
      <ModalPanel
        title={t("cards.insert_card")}
        size="lg"
        class="max-h-[70vh] flex flex-col text-txt overflow-hidden"
      >
        <CardHeader class="shrink-0">
          <Input
            class="w-full"
            ref={inputRef}
            type="search"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={t("cards.card_picker_search")}
          />
        </CardHeader>

        <div class="flex-1 overflow-y-auto min-h-0">
          <Show when={cards.loading}>
            <div class="p-4 space-y-2">
              <For each={Array(4).fill(0)}>
                {() => <div class="h-10 rounded-lg bg-elevated animate-pulse" />}
              </For>
            </div>
          </Show>

          <Show when={!cards.loading}>
            <Show
              when={filtered().length > 0}
              fallback={<p class="p-6 text-center text-sm text-muted">{t("cards.card_picker_empty")}</p>}
            >
              <ul class="divide-y divide-rim">
                <For each={filtered()}>
                  {(c) => (
                    <li>
                      <button
                        type="button"
                        onClick={() => choose(c.iid)}
                        class="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-elevated transition-colors"
                      >
                        <Show
                          when={c.cover}
                          fallback={<span class="w-9 h-9 shrink-0 rounded bg-elevated border border-rim" />}
                        >
                          <img src={c.cover} alt="" loading="lazy"
                               class="w-9 h-9 shrink-0 rounded object-cover border border-rim" />
                        </Show>
                        <span class="flex-1 min-w-0">
                          <span class="block text-sm text-txt truncate">
                            {c.title || t("cards.untitled")}
                          </span>
                          <Show when={c.deck}>
                            <span class="block text-xs text-muted truncate">{c.deck}</span>
                          </Show>
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </div>

        <div class="px-4 py-3 border-t border-rim flex justify-end shrink-0">
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            {t("editor.cancel_btn")}
          </Button>
        </div>
      </ModalPanel>
    </Modal>
  );
};

export default CardPickerModal;
