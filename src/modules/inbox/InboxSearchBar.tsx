// The inbox's search + filter bar.
//
// One text query holds the whole filter state (`from:alice is:unread
// after:2026-01-01 budget`), and everything here is a way of editing that one
// string — the dropdown inserts operators, the date inputs set after:/before:,
// the pills toggle flags. So the box always shows exactly what the list is
// filtered by, and there is no second copy of "what is applied" to keep in
// step. query.ts parses it; php Concerns/StreamFilters turns it into SQL.
import { For, Show, createMemo, type Component, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createPopover } from "@/shared/stream/filters/createPopover";
import {
  OPERATORS,
  completeTrailing,
  hasOperator,
  operatorValue,
  setOperator,
  toggleOperator,
  trailingOperator,
  type OperatorInfo,
} from "./query";

/** Toggles that aren't already a row in the folder sidebar. */
const PILLS = [
  { op: "is:unread", labelKey: "hq.filter_unread" },
  { op: "has:attachment", labelKey: "hq.filter_attachment" },
  { op: "is:mentioned", labelKey: "hq.filter_mentioned" },
] as const;

const INPUT =
  "w-full text-xs bg-overlay border-0 rounded-lg px-2.5 py-1.5 text-txt " +
  "placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent";

const Pill: Component<{ on: boolean; label: string; onClick: () => void }> = (props) => (
  <button
    type="button"
    onClick={props.onClick}
    aria-pressed={props.on}
    class="shrink-0 px-2.5 py-1 rounded-full text-xs transition-colors"
    classList={{
      "bg-accent-muted text-accent font-medium": props.on,
      "bg-overlay text-muted hover:bg-elevated hover:text-txt": !props.on,
    }}
  >
    {props.label}
  </button>
);

export const InboxSearchBar: Component<{
  query: string;
  onQuery: (q: string) => void;
  /** Folder names, offered as values after `in:`. */
  folders: string[];
  inputRef?: (el: HTMLInputElement) => void;
  /** Rendered at the right of the bar — refresh, Empty Trash. */
  actions?: JSX.Element;
}> = (props) => {
  const { t } = useI18n();
  const pop = createPopover({ placement: "bottom-end" });
  const tr = (k: string) => t(k as Parameters<typeof t>[0]) as string;

  let inputEl: HTMLInputElement | undefined;
  const focusInput = () => queueMicrotask(() => inputEl?.focus());

  // The operator being typed (or just inserted) drives the hint line and the
  // value suggestions — see trailingOperator on why the tail is enough.
  const trailing = createMemo(() => trailingOperator(props.query));

  const suggestions = createMemo<string[]>(() => {
    const cur = trailing();
    if (!cur) return [];
    const all = cur.info.folderValues ? props.folders : cur.info.values ?? [];
    const typed = cur.value.toLowerCase();
    return all.filter((v) => v.toLowerCase().startsWith(typed)).slice(0, 8);
  });

  function insertOperator(info: OperatorInfo) {
    const q = props.query.trimEnd();
    props.onQuery(`${q ? q + " " : ""}${info.key}:`);
    pop.setOpen(false);
    focusInput();
  }

  const pick = (value: string) => {
    props.onQuery(completeTrailing(props.query, value));
    focusInput();
  };

  const setDate = (key: "after" | "before", value: string) =>
    props.onQuery(setOperator(props.query, key, value));

  return (
    <div class="px-4 py-2 shrink-0 flex flex-col gap-1.5 border-b border-rim">
      <div class="flex items-center gap-2">
        <div class="relative flex-1 min-w-0">
          <svg
            class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={(el) => { inputEl = el; props.inputRef?.(el); }}
            type="text"
            value={props.query}
            onInput={(e) => props.onQuery(e.currentTarget.value)}
            placeholder={t("hq.search_placeholder")}
            class={`${INPUT} pl-8 pr-14`}
          />

          <div class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <Show when={props.query}>
              <button
                type="button"
                onClick={() => { props.onQuery(""); focusInput(); }}
                title={t("hq.clear_search")}
                aria-label={t("hq.clear_search")}
                class="p-0.5 rounded text-muted hover:text-txt hover:bg-elevated"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </Show>
            <span ref={pop.ref}>
              <button
                type="button"
                onClick={() => pop.setOpen(!pop.open())}
                title={t("hq.search_tags")}
                aria-label={t("hq.search_tags")}
                aria-expanded={pop.open()}
                class="p-0.5 rounded text-muted hover:text-txt hover:bg-elevated"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </span>
          </div>
        </div>

        {props.actions}
      </div>

      {/* Hint for the operator under the cursor, or the values it accepts. */}
      <Show when={trailing()}>
        {(cur) => (
          <div class="flex flex-wrap items-center gap-1.5 text-[0.625rem] text-muted">
            <code class="px-1 py-0.5 rounded bg-overlay text-accent">{cur().info.key}:</code>
            <span>{tr(cur().info.hintKey)}</span>
            <For each={suggestions()}>
              {(v) => (
                <button
                  type="button"
                  onClick={() => pick(v)}
                  class="px-1.5 py-0.5 rounded bg-overlay text-txt hover:bg-elevated"
                >
                  {v}
                </button>
              )}
            </For>
          </div>
        )}
      </Show>

      <div class="flex flex-wrap items-center gap-1.5">
        <For each={PILLS}>
          {(pill) => (
            <Pill
              on={hasOperator(props.query, pill.op)}
              label={tr(pill.labelKey)}
              onClick={() => props.onQuery(toggleOperator(props.query, pill.op))}
            />
          )}
        </For>
      </div>

      <Show when={pop.open()}>
        <Portal>
          <div
            ref={pop.floating}
            style={pop.style()}
            class="z-50 w-72 max-h-[70vh] overflow-y-auto rounded-xl border border-rim
                   bg-surface shadow-xl p-2 space-y-2"
          >
            <p class="px-1 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
              {t("hq.operators")}
            </p>
            <div>
              <For each={OPERATORS}>
                {(info) => (
                  <button
                    type="button"
                    onClick={() => insertOperator(info)}
                    class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-overlay flex flex-col gap-0.5"
                  >
                    <code class="text-xs text-accent">{tr(info.labelKey)}</code>
                    <span class="text-[0.625rem] text-muted leading-snug">{tr(info.hintKey)}</span>
                  </button>
                )}
              </For>
            </div>

            {/* Native date inputs rather than a picker component — they write
                after:/before: into the same query string. */}
            <div class="border-t border-rim pt-2">
              <p class="px-1 pb-1 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
                {t("hq.date_range")}
              </p>
              <div class="flex items-center gap-1.5 px-1">
                <label class="flex-1 min-w-0">
                  <span class="block text-[0.625rem] text-muted mb-0.5">{t("hq.date_from")}</span>
                  <input
                    type="date"
                    value={operatorValue(props.query, "after")}
                    onInput={(e) => setDate("after", e.currentTarget.value)}
                    class={INPUT}
                  />
                </label>
                <label class="flex-1 min-w-0">
                  <span class="block text-[0.625rem] text-muted mb-0.5">{t("hq.date_to")}</span>
                  <input
                    type="date"
                    value={operatorValue(props.query, "before")}
                    onInput={(e) => setDate("before", e.currentTarget.value)}
                    class={INPUT}
                  />
                </label>
              </div>
            </div>

            <div class="border-t border-rim pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => { props.onQuery(""); pop.setOpen(false); }}
                class="px-2 py-1 rounded-lg text-xs text-muted hover:bg-overlay hover:text-txt"
              >
                {t("hq.clear_filters")}
              </button>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  );
};

export default InboxSearchBar;
