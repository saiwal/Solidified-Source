// The frame every directory section shares: one header row (title, tools,
// page actions), an optional description, then the section's own content.
// The mobile back bar already names the section, so the title is md+ only.
import { createSignal, Show, type JSX } from "solid-js";
import { createMediaQuery } from "@solid-primitives/media";
import { MdOutlineClose, MdOutlineSearch } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import PageActions, { PageActionsLabel, type PageAction } from "@/shared/views/layout/PageActions";
import { IconButton } from "@ui/Button";
import { SearchField } from "@ui/SearchField";

import { cardClass } from "@ui/Card";
export function Section(props: {
  title: string;
  description?: JSX.Element;
  /** Outlined icon buttons / switchers, left of the page actions. */
  tools?: JSX.Element;
  actions?: PageAction[];
  /** narrow: a form column. Default: the list/grid width. */
  narrow?: boolean;
  /** Frame the content in a reading panel (default). false for content that
   *  is already cards — a DirectoryCard grid — so cards don't nest in a card. */
  panel?: boolean;
  children: JSX.Element;
}) {
  return (
    <PageActionsLabel.Provider value={() => props.title}>
      <div class={`${props.narrow ? "max-w-3xl" : "max-w-5xl"} mx-auto px-4 md:px-6 py-6 space-y-4`}>
        <div class="space-y-1">
          <div class="flex items-center justify-end gap-2 flex-wrap">
            <h1 class="hidden md:block text-xl font-bold text-txt mr-auto">{props.title}</h1>
            {props.tools}
            <Show when={props.actions}>
              {(a) => <PageActions actions={a()} />}
            </Show>
          </div>
          <Show when={props.description}>
            <p class="text-sm text-muted max-w-prose">{props.description}</p>
          </Show>
        </div>
        <Show when={props.panel !== false} fallback={props.children}>
          <div class={`${cardClass()} p-2`}>{props.children}</div>
        </Show>
      </div>
    </PageActionsLabel.Provider>
  );
}

/**
 * Header search: an outlined icon until clicked, then a field with a submit
 * button (plus `extra` buttons acting on the same text) and a close button.
 * Below md, where the title is hidden, it is always open: a lone icon there
 * left the header row looking empty.
 * `live` searches on every keystroke, for lists filtered client-side.
 */
export function SearchToggle(props: {
  applied: string;
  onSearch: (q: string) => void;
  placeholder: string;
  live?: boolean;
  onInput?: (q: string) => void;
  extra?: (input: () => string, clear: () => void) => JSX.Element;
}) {
  const { t } = useI18n();
  const [open, setOpen] = createSignal(!!props.applied);
  const phone = createMediaQuery("(max-width: 767px)");
  const [input, setInput] = createSignal(props.applied);
  const update = (q: string) => {
    setInput(q);
    props.onInput?.(q);
    // Emptying the field drops the applied search too — the only way to on
    // phones, which have no close button.
    if (props.live || (!q && props.applied)) props.onSearch(q);
  };
  const close = () => {
    setOpen(false);
    setInput("");
    if (props.applied) props.onSearch("");
  };

  return (
    <Show
      when={open() || phone()}
      fallback={
        <IconButton
          label={t("directory.search")}
          variant="outline"
          pressed={!!props.applied}
          onClick={() => { setInput(props.applied); setOpen(true); }}
        >
          <MdOutlineSearch size={15} />
        </IconButton>
      }
    >
      {/* Below md: its own full-width line, first in the row. */}
      <form
        class="flex items-center gap-1.5 basis-full md:basis-auto md:w-80 order-first md:order-none"
        onSubmit={(e) => { e.preventDefault(); props.onSearch(input().trim()); }}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      >
        <SearchField
          class="flex-1 min-w-0"
          value={input()}
          onInput={update}
          label={props.placeholder}
          clearLabel={t("ui.clear")}
          placeholder={props.placeholder}
          autofocus
        />
        <Show when={!props.live}>
          <IconButton label={t("directory.search")} variant="outline" type="submit">
            <MdOutlineSearch size={15} />
          </IconButton>
        </Show>
        {props.extra?.(input, () => update(""))}
        <Show when={!phone()}>
          <IconButton label={t("directory.close")} size="sm" onClick={close}>
            <MdOutlineClose size={15} />
          </IconButton>
        </Show>
      </form>
    </Show>
  );
}

/** A list row's classes: no border, a soft hover, actions always reachable. */
export const ROW = "rounded-xl hover:bg-elevated/40 items-center!";
