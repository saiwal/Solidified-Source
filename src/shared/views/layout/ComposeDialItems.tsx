import { For } from "solid-js";
import { useQuickActions } from "@/modules/hq/quick-actions";
import { getNavIcon } from "@/shared/views/NavItem";
import { DialItem } from "./FloatingActions";

/** The create actions (HQ's quick compose list) as rows of the floating column. */
export default function ComposeDialItems(props: { onPick: () => void }) {
  const actions = useQuickActions();
  return (
    <For each={actions()}>
      {(q) => (
        <li>
          <DialItem action={{ label: q.label, icon: () => getNavIcon(q.icon, 18), onClick: q.onClick }} onPick={props.onPick} />
        </li>
      )}
    </For>
  );
}
