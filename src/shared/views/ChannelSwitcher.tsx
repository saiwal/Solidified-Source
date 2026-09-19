import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import type { NavChannel } from "@utsukta/spa-core/lib/nav-api";
import { getNavIcon } from "./NavItem";
import { doSwitchChannel } from "@/modules/manage/store";
import { Motion, Presence, slideDownPreset } from "@utsukta/spa-core/lib/motion-presets";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineCheck, MdOutlineExpand_more } from "solid-icons/md";

interface ChannelSwitcherProps {
  channels: NavChannel[];
  currentNick?: string;
  open: boolean;
  onToggle: () => void;
  label: string;
  /** Fires after navigating to /new_channel or /manage — lets callers close a drawer. */
  onNavigate?: () => void;
}

/** Switches the active channel and hard-redirects, same as ManagePage.tsx. */
export async function switchToChannel(channelId: number): Promise<void> {
  const redirectTo = await doSwitchChannel(channelId);
  if (redirectTo) window.location.href = redirectTo;
}

// Inline-expanding "channels" nav entry — same interaction shape as the
// avatar/user-menu accordion (a boolean open state + a Show block), not the
// floating useDropdown popover used for compact widgets like ThemeToggle.
const ChannelSwitcher = (props: ChannelSwitcherProps) => {
  const { t } = useI18n();

  return (
    <div>
      <button
        type="button"
        onClick={props.onToggle}
        aria-expanded={props.open}
        class={`group relative flex items-center gap-3 rounded-xl px-2.5 py-2 w-full
                text-sm text-muted transition-colors duration-150 cursor-pointer
                hover:bg-elevated hover:text-txt
                ${props.open ? "bg-elevated text-txt" : ""}`}
      >
        <span aria-hidden="true" class="shrink-0 w-5 h-5 flex items-center justify-center">
          {getNavIcon("manage", 20)}
        </span>
        <span class="flex-1 truncate leading-tight text-left">{props.label}</span>
        <MdOutlineExpand_more class={`w-3.5 h-3.5 shrink-0 text-muted transition-transform duration-200 ease-out
                  ${props.open ? "rotate-180" : "rotate-0"}`} />
      </button>

      <Presence>
        <Show when={props.open}>
          <Motion.div {...slideDownPreset} class="mt-0.5 flex flex-col gap-0.5 pl-2">
            <For each={props.channels}>
              {(ch) => {
                const isCurrent = () => ch.nick === props.currentNick;
                return (
                  <button
                    type="button"
                    disabled={isCurrent()}
                    onClick={() => switchToChannel(ch.id)}
                    class={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left
                            transition-colors truncate
                            ${
                              isCurrent()
                                ? "text-txt font-medium cursor-default"
                                : "text-muted hover:bg-elevated hover:text-txt cursor-pointer"
                            }`}
                  >
                    <span class="truncate flex-1">{ch.name}</span>
                    <Show when={isCurrent()}>
                      <MdOutlineCheck class="w-3.5 h-3.5 text-accent shrink-0" />
                    </Show>
                  </button>
                );
              }}
            </For>

            <div class="my-1 h-px bg-rim" />

            <A
              href="/new_channel"
              onClick={props.onNavigate}
              class="rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-elevated hover:text-txt transition-colors"
            >
              {t("nav.new_channel")}
            </A>
            <A
              href="/manage"
              onClick={props.onNavigate}
              class="rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-elevated hover:text-txt transition-colors"
            >
              {t("nav.manage_channels")}
            </A>
          </Motion.div>
        </Show>
      </Presence>
    </div>
  );
};

export default ChannelSwitcher;

// ── Mobile tile variant ──────────────────────────────────────────────────────
//
// The "more" drawer lays action items out as a grid of square tiles (icon
// above label). An expandable vertical list doesn't fit inside one tile, so
// when the channel-select feature is active the trigger tile itself just
// toggles visibility and these extra tiles render as siblings in the same
// grid — matching how every other drawer item looks, per design feedback.

const tileClass =
  "flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border text-xs " +
  "font-medium leading-tight text-center transition-all";

export function ChannelSwitcherTiles(props: {
  channels: NavChannel[];
  currentNick?: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <For each={props.channels}>
        {(ch) => {
          const isCurrent = () => ch.nick === props.currentNick;
          return (
            <button
              type="button"
              disabled={isCurrent()}
              onClick={() => switchToChannel(ch.id)}
              class={`${tileClass} ${
                isCurrent()
                  ? "border-accent bg-accent/10 text-accent cursor-default"
                  : "bg-elevated border-rim text-txt hover:brightness-95 cursor-pointer"
              }`}
            >
              <span aria-hidden="true" class={isCurrent() ? "" : "text-muted"}>
                {getNavIcon("person", 20)}
              </span>
              <span class="truncate w-full text-center">{ch.name}</span>
            </button>
          );
        }}
      </For>

      <A
        href="/new_channel"
        onClick={props.onNavigate}
        class={`${tileClass} bg-elevated border-rim text-txt hover:brightness-95`}
      >
        <span aria-hidden="true" class="text-muted">{getNavIcon("register", 20)}</span>
        <span class="truncate w-full text-center">{t("nav.new_channel")}</span>
      </A>
      <A
        href="/manage"
        onClick={props.onNavigate}
        class={`${tileClass} bg-elevated border-rim text-txt hover:brightness-95`}
      >
        <span aria-hidden="true" class="text-muted">{getNavIcon("manage", 20)}</span>
        <span class="truncate w-full text-center">{t("nav.manage_channels")}</span>
      </A>
    </>
  );
}
