// solidified's implementation of the collapsible contract
// (spa-core types/ui.types.ts). The header is a render prop because real
// section headers carry links and buttons beside the toggle target — markup
// that cannot live inside a <button>. Spread the trigger props onto each
// toggle so aria-expanded/aria-controls are wired once.
import { Show, createUniqueId } from "solid-js";
import type {
  CollapsibleProps,
  CollapsibleTriggerProps,
} from "@utsukta/spa-core/types/ui.types";

export function Collapsible(props: CollapsibleProps) {
  const panelId = createUniqueId();
  const trigger: CollapsibleTriggerProps = {
    get "aria-expanded"() {
      return props.open;
    },
    "aria-controls": panelId,
    onClick: () => props.onOpenChange(!props.open),
  };

  return (
    <div class={`hz-collapsible ${props.class ?? ""}`}>
      {props.header(trigger)}
      <Show when={props.open}>
        <div id={panelId} class={props.panelClass}>
          {props.children}
        </div>
      </Show>
    </div>
  );
}
