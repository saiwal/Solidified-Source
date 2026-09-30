import { For, Show } from "solid-js";
import { useQuickActions } from "../quick-actions";
import { getNavIcon } from "@/shared/views/NavItem";

export default function QuickComposeWidget() {
  const actions = useQuickActions();

  return (
    <Show when={actions().length > 0}>
      {/* One scrolling row, never wrapping: the action list runs to 7 items
          (post, dm, webpage, wiki, article, card, event) and 7 x 40px + gaps
          overflows a 360px masonry cell, where flex-wrap left a single
          centred orphan on a second row. */}
      <div class="flex gap-3 py-1 px-1 overflow-x-auto snap-x">
        <For each={actions()}>
          {(action) => (
            <button
              type="button"
              data-tour={`hq.quick_compose.${action.key}`}
              onClick={action.onClick}
              title={action.label}
              aria-label={action.label}
              class="flex h-10 w-10 shrink-0 snap-start items-center justify-center rounded-full bg-surface
                     text-accent shadow-md hover:bg-elevated hover:shadow-lg
                     focus-visible:outline-2 focus-visible:outline-accent transition-all"
            >
              {getNavIcon(action.icon, 17)}
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
