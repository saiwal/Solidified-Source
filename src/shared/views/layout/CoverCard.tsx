import { Show } from "solid-js";
import { A } from "@solidjs/router";
import { MdOutlineExpand_more } from "solid-icons/md";
import { helpable } from "@utsukta/spa-core/lib/helpable";
import { useI18n } from "@utsukta/spa-core/i18n";
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
 * menu trigger; without, a static header for the channel a visitor is on —
 * labelled "Visiting" so the two don't read as the same card.
 */
export default function CoverCard(props: {
  who: CoverIdentity;
  /** The channel page this identity belongs to. Linked from the name on the
   *  static card; the interactive (own) card is the account menu trigger. */
  channelHref?: string;
  open?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useI18n();
  // The static card is always someone else's channel; the interactive one is
  // the signed-in user's own identity.
  const interactive = () => !!props.onToggle;

  // The cover is flush with the rail, so a busy image would otherwise end in
  // a hard horizontal seam right above the identity row. A short scrim fades
  // the image into whatever surface that row is using (surface, or elevated
  // while the card is hovered/open) and lets the avatar sit *in* the cover.
  const scrimTone = () =>
    props.open
      ? "from-elevated"
      : interactive()
        ? "from-surface group-hover:from-elevated"
        : "from-surface";
  const ringTone = () =>
    props.open
      ? "ring-elevated"
      : interactive()
        ? "ring-surface group-hover:ring-elevated"
        : "ring-surface";

  const body = (
    <>
      {/* Gradient is the fallback when there's no cover. 3.4:1 rather than
          3:1 keeps the header short enough for a 224px rail on a 768px-tall
          laptop, where the nav below already has to scroll. */}
      <div class="relative bg-gradient-to-br from-accent to-accent-txt" style="aspect-ratio: 3.4 / 1;">
        <Show when={props.who.cover}>
          <img src={props.who.cover} alt="" aria-hidden="true" class="absolute inset-0 h-full w-full object-cover" />
        </Show>
        <div
          aria-hidden="true"
          class={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t to-transparent ${scrimTone()}`}
        />
        <Show when={!interactive()}>
          <span
            class="absolute right-2 top-2 rounded-full border border-rim/60 bg-surface/85 px-2 py-0.5
                   text-[0.625rem] font-semibold uppercase tracking-widest text-muted backdrop-blur-sm"
          >
            {t("nav.visiting")}
          </span>
        </Show>
        <div class="absolute -bottom-6 left-[18px]">
          <Avatar
            src={props.who.avatar}
            name={props.who.name}
            size={12}
            class={`ring-4 transition-transform duration-200 ease-out group-hover:scale-105 ${ringTone()}`}
          />
        </div>
      </div>
      <div
        class={`flex items-end gap-2 pt-8 px-[18px] pb-2.5 transition-colors duration-150
                group-focus-visible:ring-2 group-focus-visible:ring-inset group-focus-visible:ring-accent/60
                ${props.open ? "bg-elevated" : props.onToggle ? "group-hover:bg-elevated" : ""}`}
      >
        <span class="min-w-0 flex-1">
          <Show
            when={props.channelHref && !props.onToggle}
            fallback={<span class="block truncate text-sm font-semibold text-txt">{props.who.name}</span>}
          >
            <A
              href={props.channelHref!}
              class="block truncate text-sm font-semibold text-txt transition-colors
                     hover:text-accent-txt hover:underline hover:underline-offset-2"
            >
              {props.who.name}
            </A>
          </Show>
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
