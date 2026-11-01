import { For, type Component } from "solid-js";
import {
  resolveGlobalSlots,
  resolveModuleSlot,
  getLazy,
} from "@utsukta/spa-core/module-registry";
import type { WidgetSlotName } from "@utsukta/spa-core/types/module.types";

/*
 * Minimal read-only starter — resolves and renders a slot's default widgets
 * (global + this module's defaultModules), one column, no styling opinion.
 *
 * NOT included, unlike solidified's Slot.tsx: user layout overrides
 * (@utsukta/spa-core/store/widget-layout's layoutFor/pageLayoutFor — the
 * "customize this sidebar" feature), edit mode (add/remove/reorder picker),
 * multiInstance widget config panels, masonry column packing, per-page
 * layout templates. All of that machinery already exists in spa-core's
 * stores — this component just doesn't call into it yet. See solidified's
 * Slot.tsx (src/shared/views/Slot.tsx) for the full pattern to build
 * toward, and src/docs/dev/en/1-architecture/slot-system.md for the complete reference.
 */
export default function Slot(props: { name: WidgetSlotName; moduleId: string }) {
  const widgets = () => [
    ...resolveGlobalSlots(props.name),
    ...resolveModuleSlot(props.name, props.moduleId),
  ];

  return (
    <div class="flex flex-col gap-3">
      <For each={widgets()}>
        {(widget) => {
          const Comp = getLazy(widget.loader) as Component<{ config?: Record<string, unknown> }>;
          return <Comp />;
        }}
      </For>
    </div>
  );
}
