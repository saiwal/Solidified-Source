import { For, Show, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { createMediaQuery } from "@solid-primitives/media";
import {
  MdFillApps,
  MdFillFormat_list_bulleted, MdFillShort_text, MdFillTimeline,
  MdFillKeyboard_arrow_down,
} from "solid-icons/md";
import type { ViewMode } from "@/shared/stream/types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createPopover } from "./createPopover";

type IconType = Component<{ size?: number; class?: string }>;

const ALL_VIEWS: { id: ViewMode; key: string; icon: IconType }[] = [
  { id: "feed",    key: "feed", icon: MdFillShort_text },
  { id: "masonry", key: "grid", icon: MdFillApps },
  { id: "list",    key: "list", icon: MdFillFormat_list_bulleted },
  { id: "timeline", key: "timeline", icon: MdFillTimeline },
];

export default function ViewSwitcher(props: {
  viewMode: ViewMode;
  onChange: (v: ViewMode) => void;
  available?: ViewMode[];
}) {
  const { t } = useI18n();
  const { open, setOpen, ref, floating, style } = createPopover({ placement: "bottom-end" });
  // Below `sm` the toolbar is sharing one row with the sort control and the
  // compose/DM/search buttons, so the whole group collapses into one button.
  const wide = createMediaQuery("(min-width: 640px)");

  const views = () =>
    props.available
      ? ALL_VIEWS.filter((v) => props.available!.includes(v.id))
      : ALL_VIEWS;

  const current = () => views().find((v) => v.id === props.viewMode) ?? views()[0];
  const CurrentIcon = () => { const I = current().icon; return <I size={15} />; };

  const pick = (v: ViewMode) => { props.onChange(v); setOpen(false); };

  return (
    <div class="shrink-0" ref={ref}>
      <Show
        when={wide()}
        fallback={
          <>
            <button
              title={t(`network.${current().key}` as any)}
              aria-expanded={open()}
              aria-haspopup="listbox"
              onClick={() => setOpen(!open())}
              class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-rim
                     bg-surface text-muted hover:bg-elevated hover:text-txt transition-colors"
            >
              <CurrentIcon />
              <MdFillKeyboard_arrow_down size={14} />
            </button>

            <Show when={open()}>
              <Portal>
                <div
                  ref={floating}
                  style={style()}
                  role="listbox"
                  aria-label="View mode"
                  class="z-50 w-40 p-1 rounded-lg border border-rim bg-surface shadow-lg"
                >
                  <For each={views()}>
                    {(v) => (
                      <button
                        role="option"
                        aria-selected={props.viewMode === v.id}
                        onClick={() => pick(v.id)}
                        class={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left
                          transition-colors
                          ${props.viewMode === v.id
                            ? "bg-accent text-accent-fg"
                            : "text-txt hover:bg-elevated"}`}
                      >
                        <v.icon size={14} />
                        <span>{t(`network.${v.key}` as any)}</span>
                      </button>
                    )}
                  </For>
                </div>
              </Portal>
            </Show>
          </>
        }
      >
        <div class="flex rounded-lg border border-rim overflow-hidden shrink-0"
          role="group" aria-label="View mode">
          <For each={views()}>
            {(v) => (
              <button
                title={t(`network.${v.key}` as any)}
                aria-pressed={props.viewMode === v.id}
                onClick={() => props.onChange(v.id)}
                class={`px-2 py-1.5 transition-colors
                  ${props.viewMode === v.id
                    ? "bg-elevated text-txt"
                    : "bg-surface text-muted hover:bg-elevated hover:text-txt"}`}
              >
                <v.icon size={15} />
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
