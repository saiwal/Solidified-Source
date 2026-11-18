/**
 * CategoryTagsField.tsx
 * Renders the category tag-chip row driven by useCategoryTags(). Supports
 * two visual variants via `showLabel`: Post's compact inline row (default)
 * and Article's labelled, bordered-box row.
 */

import { For, Show, createSignal, type Component } from "solid-js";
import type { JSX } from "@solidjs/web";
import SuggestPopup from "./SuggestPopup";

export interface CategoryTagsFieldProps {
  tags: () => string[];
  pending: () => string;
  onPendingInput: (v: string) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onRemove: (tag: string) => void;
  onBlur: () => void;
  placeholder: string;
  /** Article/Webpage's underline row vs Post's plain inline row. Default false (Post's style). */
  showLabel?: boolean;
  label?: string;
  /** Suppress the label text above the field even when showLabel is set — the placeholder already names the field. */
  hideLabel?: boolean;
  /** Existing categories matching the pending input. */
  suggestions?: () => string[];
  activeSuggestion?: () => number;
  onSelectSuggestion?: (v: string) => void;
}

const CategoryTagsField: Component<CategoryTagsFieldProps> = (props) => {
  const [inputEl, setInputEl] = createSignal<HTMLInputElement>();
  const suggestionItems = () => props.suggestions?.() ?? [];
  const showSuggestions = () => suggestionItems().length > 0 && !!inputEl();

  const chips = (): JSX.Element => (
    <For each={props.tags()}>
      {(tag) => (
        <span
          class={
            props.showLabel
              ? "flex items-center gap-1 px-2 py-0.5 rounded bg-elevated text-xs text-txt"
              : "flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-elevated text-xs text-txt"
          }
        >
          {tag}
          <button
            type="button"
            onClick={() => props.onRemove(tag)}
            class="text-muted hover:text-txt leading-none"
          >
            ×
          </button>
        </span>
      )}
    </For>
  );

  const input = (): JSX.Element => (
    <input
      ref={setInputEl}
      type="text"
      placeholder={props.tags().length ? "" : props.placeholder}
      value={props.pending()}
      onInput={(e) => props.onPendingInput(e.currentTarget.value)}
      onKeyDown={props.onKeyDown}
      onBlur={props.onBlur}
      class={
        props.showLabel
          ? "flex-1 min-w-16 bg-transparent text-sm text-txt outline-none placeholder:text-muted"
          : "flex-1 min-w-0 bg-transparent text-sm text-txt placeholder:text-muted outline-none"
      }
    />
  );

  return (
    <>
      <Show
        when={props.showLabel}
        fallback={
          <div class="flex flex-wrap items-center gap-1 px-4 py-2 border-b border-rim shrink-0">
            {chips()}
            {input()}
          </div>
        }
      >
        <div class="flex-1 min-w-0">
          <Show when={!props.hideLabel}>
            <label class="block text-xs text-muted mb-1">{props.label}</label>
          </Show>
          <div
            class="flex flex-wrap items-center gap-1.5 px-0 py-1.5 bg-transparent
                   border-0 border-b border-rim focus-within:border-accent transition-colors"
          >
            {chips()}
            {input()}
          </div>
        </div>
      </Show>

      <Show when={showSuggestions()}>
        <SuggestPopup
          items={suggestionItems()}
          anchorRect={inputEl()!.getBoundingClientRect()}
          activeIdx={props.activeSuggestion?.() ?? -1}
          onSelect={(item) => props.onSelectSuggestion?.(item)}
        />
      </Show>
    </>
  );
};

export default CategoryTagsField;
