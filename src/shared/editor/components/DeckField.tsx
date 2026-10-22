/**
 * DeckField.tsx
 * Optional "Deck name" + "Card #" pair for CardComposer. Both empty
 * means the card isn't part of a deck — stored via iconfig, not a
 * dedicated schema field (see Cards.php).
 */

import { Show, createSignal, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import SuggestPopup from "./SuggestPopup";
import { Input } from "@ui/Field";

export interface DeckFieldProps {
  name: () => string;
  onNameInput: (v: string) => void;
  order: () => number | null;
  onOrderInput: (v: number | null) => void;
  hideLabel?: boolean;
  /** Existing deck names matching the typed name — pick one or keep typing to create a new deck. */
  suggestions?: () => string[];
  activeSuggestion?: () => number;
  onSelectSuggestion?: (v: string) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
}

const DeckField: Component<DeckFieldProps> = (props) => {
  const { t } = useI18n();
  const [inputEl, setInputEl] = createSignal<HTMLInputElement>();
  const [focused, setFocused] = createSignal(false);
  const suggestionItems = () => props.suggestions?.() ?? [];
  const showSuggestions = () => focused() && suggestionItems().length > 0 && !!inputEl();
  return (
    <div class="flex items-end gap-3">
      <div class="flex-1 min-w-0 relative">
        <Show when={!props.hideLabel}>
          <label class="block text-xs text-muted mb-1">{t("editor.deck_label")}</label>
        </Show>
        <Input
          class="w-full"
          ref={setInputEl}
          type="text"
          placeholder={t("editor.deck_placeholder")}
          value={props.name()}
          onInput={(e) => props.onNameInput(e.currentTarget.value)}
          onKeyDown={props.onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <Show when={showSuggestions()}>
          <SuggestPopup
            items={suggestionItems()}
            anchorRect={inputEl()!.getBoundingClientRect()}
            activeIdx={props.activeSuggestion?.() ?? -1}
            onSelect={(item) => props.onSelectSuggestion?.(item)}
          />
        </Show>
      </div>
      <div class="w-20 shrink-0">
        <Show when={!props.hideLabel}>
          <label class="block text-xs text-muted mb-1">{t("editor.deck_order_label")}</label>
        </Show>
        <Input class="w-full" type="number" min="1" placeholder={t("editor.deck_order_placeholder")} value={props.order() ?? ""} onInput={(e) => {
            const v = e.currentTarget.value;
            props.onOrderInput(v === "" ? null : Number(v));
          }} />
      </div>
    </div>
  );
};

export default DeckField;
