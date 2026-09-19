import { For, Show } from "solid-js";
import { useQuickActions } from "../quick-actions";
import { getNavIcon } from "@/shared/views/NavItem";

export default function QuickComposeWidget() {
  const actions = useQuickActions();

  return (
    <Show when={actions().length > 0}>
      <div class="flex flex-wrap justify-evenly gap-3 py-1">
        <For each={actions()}>
          {(action) => (
            <button
              type="button"
              data-tour={`hq.quick_compose.${action.key}`}
              onClick={action.onClick}
              title={action.label}
              aria-label={action.label}
              class="flex h-10 w-10 items-center justify-center rounded-full bg-surface
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
