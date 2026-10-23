// solidified's implementation of the menu-button contract
// (spa-core types/ui.types.ts): a labelled text Button that opens a Menu.
// Icon-only triggers keep using Menu directly; this is the "More actions" shell.
import { Show } from "solid-js";
import type { MenuButtonProps } from "@utsukta/spa-core/types/ui.types";
import { Menu } from "@ui/Menu";
import { Button } from "@ui/Button";
import { MdOutlineExpand_more } from "solid-icons/md";

export function MenuButton(props: MenuButtonProps) {
  return (
    <Menu
      label={props.label}
      placement={props.placement}
      class={`min-w-48 ${props.menuClass ?? ""}`}
      trigger={(trigger, open) => (
        <Button
          {...trigger}
          variant={props.variant ?? "ghost"}
          size={props.size ?? "sm"}
          class={props.class}
        >
          <Show when={props.icon}>
            <span class="shrink-0" aria-hidden="true">{props.icon}</span>
          </Show>
          <span>{props.label}</span>
          <Show when={props.chevron !== false}>
            <MdOutlineExpand_more
              class={`w-3.5 h-3.5 shrink-0 transition-transform ${open() ? "rotate-180" : ""}`}
            />
          </Show>
        </Button>
      )}
    >
      {props.children}
    </Menu>
  );
}
