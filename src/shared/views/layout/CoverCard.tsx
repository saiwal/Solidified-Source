import { Show } from "solid-js";
import { MdOutlineExpand_more } from "solid-icons/md";
import { helpable } from "@utsukta/spa-core/lib/helpable";
import { Avatar } from "@ui/Avatar";
void helpable;

export interface CoverIdentity {
  name: string;
  addr?: string;
  avatar?: string;
  cover?: string;
}

/**
 * Full-bleed cover + avatar + name at the top of the desktop rail, styled like
 * the channel contact card. With `onToggle` it is the signed-in user's account
 * menu trigger; without, a static header for the channel a visitor is on.
 */
export default function CoverCard(props: {
  who: CoverIdentity;
  open?: boolean;
  onToggle?: () => void;
}) {
  const body = (
    <>
      {/* Gradient is the fallback when there's no cover. */}
      <div class="relative bg-gradient-to-br from-accent to-accent-txt" style="aspect-ratio: 3 / 1;">
        <Show when={props.who.cover}>
          <img src={props.who.cover} alt="" aria-hidden="true" class="absolute inset-0 h-full w-full object-cover" />
        </Show>
        <div class="absolute -bottom-7 left-4">
          <Avatar
            src={props.who.avatar}
            name={props.who.name}
            size={14}
            class="ring-4 ring-surface transition-transform duration-200 ease-out group-hover:scale-105"
          />
        </div>
      </div>
      <div
        class={`flex items-end gap-2 pt-9 px-4 pb-3 transition-colors duration-150
                group-focus-visible:ring-2 group-focus-visible:ring-inset group-focus-visible:ring-accent/60
                ${props.open ? "bg-elevated" : props.onToggle ? "group-hover:bg-elevated" : ""}`}
      >
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold text-txt">{props.who.name}</span>
          <Show when={props.who.addr}>
            <span class="block truncate text-xs text-muted">@{props.who.addr}</span>
          </Show>
        </span>
        <Show when={props.onToggle}>
          <MdOutlineExpand_more
            class={`mb-0.5 w-4 h-4 shrink-0 text-muted transition-transform duration-200 ease-out
                    ${props.open ? "rotate-180" : "rotate-0"}`}
          />
        </Show>
      </div>
    </>
  );

  return (
    <Show when={props.onToggle} fallback={<div class="select-none">{body}</div>}>
      <button
        onClick={props.onToggle}
        title={props.who.name}
        aria-expanded={!!props.open}
        data-tour="nav.user_menu"
        use:helpable="nav.account_menu"
        class="group block w-full text-left select-none focus-visible:outline-none"
      >
        {body}
      </button>
    </Show>
  );
}
