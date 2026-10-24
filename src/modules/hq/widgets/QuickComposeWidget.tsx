import { For, Show } from "solid-js";
import { useQuickActions } from "../quick-actions";
import { getNavIcon } from "@/shared/views/NavItem";
import { TileFace, tileClass } from "@/shared/views/layout/AppDrawer";

export default function QuickComposeWidget() {
  const actions = useQuickActions();

  return (
    <Show when={actions().length > 0}>
      {/* Drawer-style tiles; auto-fill gives four per row in the mobile
          actions sheet and as many as fit in an HQ masonry cell. */}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1">
        <For each={actions()}>
          {(action) => (
            <button
              type="button"
              data-tour={`hq.quick_compose.${action.key}`}
              onClick={action.onClick}
              class={`${tileClass} focus-visible:outline-2 focus-visible:outline-accent`}
            >
              <TileFace icon={getNavIcon(action.icon, 24)} label={action.label} />
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
