import { For, Show, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { createMediaQuery } from "@solid-primitives/media";
import {
  MdFillSchedule,
  MdFillForum,
  MdFillFormat_list_bulleted,
  MdFillTrending_up,
  MdFillLocal_fire_department,
  MdFillQuestion_answer,
  MdFillCompare_arrows,
  MdFillKeyboard_arrow_down,
} from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import FilterChip from "./FilterChip";
import { RANGE_AWARE, RANGES, DEFAULT_RANGE, resolveRange, type SortOrder, type SortRange } from "./ranked";
import { createPopover } from "./createPopover";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;

type IconType = Component<{ size?: number; class?: string }>;

const ALL_ORDERS: { id: SortOrder; key: string; icon: IconType }[] = [
  { id: "created",       key: "latest",            icon: MdFillSchedule               },
  { id: "commented",     key: "active",            icon: MdFillForum                  },
  { id: "top",           key: "sort_top",          icon: MdFillTrending_up            },
  { id: "hot",           key: "sort_hot",          icon: MdFillLocal_fire_department  },
  { id: "discussed",     key: "sort_discussed",    icon: MdFillQuestion_answer        },
  { id: "controversial", key: "sort_controversial", icon: MdFillCompare_arrows        },
  { id: "unthreaded",    key: "unthreaded",        icon: MdFillFormat_list_bulleted   },
];

export default function SortSelect(props: {
  order: SortOrder;
  range?: SortRange;
  onChange: (order: SortOrder, range?: SortRange) => void;
  available?: SortOrder[];
  /** Help-mode target; the module doc needs a matching "Sort Order" heading. */
  help?: string;
}) {
  const { t } = useI18n();
  const { open, setOpen, ref, floating, style } = createPopover();
  // Tabs need room for the labels; below this the same options collapse into
  // the dropdown. `md` is the app-wide desktop breakpoint (see Layout.tsx).
  const wide = createMediaQuery("(min-width: 768px)");

  const orders = () =>
    props.available
      ? ALL_ORDERS.filter((o) => props.available!.includes(o.id))
      : ALL_ORDERS;

  const current = () => ALL_ORDERS.find((o) => o.id === props.order) ?? ALL_ORDERS[0];
  const CurrentIcon = () => { const I = current().icon; return <I size={14} />; };
  const range = () => resolveRange(props.order, props.range) ?? DEFAULT_RANGE;
  const rangeAware = () => RANGE_AWARE.includes(props.order);

  const pickOrder = (id: SortOrder) => {
    // Dropping a range on an order that can't use one would leave a stale
    // ?range= in the URL that nothing reads.
    props.onChange(id, RANGE_AWARE.includes(id) ? range() : undefined);
    // Range-aware orders leave the panel open so the range can be picked next;
    // re-clicking the active one is how you reopen it to change the range.
    setOpen(RANGE_AWARE.includes(id) && !(open() && props.order === id));
  };

  const pickRange = (r: SortRange) => {
    props.onChange(props.order, r);
    setOpen(false);
  };

  // "Most discussed (Week)" — the window is part of what the order means, so
  // it belongs in the label rather than in a second control taking up space.
  const labelFor = (o: SortOrder, key: string) => {
    const base = t(`network.${key}` as any);
    if (o !== props.order || !RANGE_AWARE.includes(o) || range() === "all") return base;
    const rk = RANGES.find((r) => r.id === range())?.key;
    return rk ? `${base} (${t(`network.${rk}` as any)})` : base;
  };

  // Shared by both segmented groups (orders, and the range row beside them).
  const segCls = (active: boolean) =>
    `flex items-center gap-1 py-1.5 px-1.5 lg:px-2.5 transition-colors whitespace-nowrap
     ${active ? "bg-accent text-accent-fg" : "bg-surface text-muted hover:bg-elevated"}`;

  return (
    <div class="min-w-0" ref={ref} use:helpable={props.help ?? "network.sort_order"}>
      <Show
        when={wide()}
        fallback={
          <>
            <button
              title={t("network.sort_by")}
              aria-expanded={open()}
              aria-haspopup="listbox"
              onClick={() => setOpen(!open())}
              class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-rim
                     bg-surface text-muted hover:bg-elevated hover:text-txt transition-colors"
            >
              <CurrentIcon />
              <span class="hidden sm:inline text-xs font-medium">
                {labelFor(current().id, current().key)}
              </span>
              <MdFillKeyboard_arrow_down size={14} />
            </button>

            <Show when={open()}>
              <Portal>
                <div
                  ref={floating}
                  style={style()}
                  role="listbox"
                  class="z-50 w-52 p-1 rounded-lg border border-rim bg-surface shadow-lg"
                >
                <For each={orders()}>
                  {(o) => (
                    <button
                      role="option"
                      aria-selected={props.order === o.id}
                      onClick={() => pickOrder(o.id)}
                      class={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left
                        transition-colors
                        ${props.order === o.id
                          ? "bg-accent text-accent-fg"
                          : "text-txt hover:bg-elevated"}`}
                    >
                      <o.icon size={14} />
                      <span>{labelFor(o.id, o.key)}</span>
                    </button>
                  )}
                </For>

                  <Show when={rangeAware()}>
                    <div class="mt-1 pt-2 border-t border-rim flex flex-wrap gap-1 px-1 pb-1">
                      <For each={RANGES}>
                        {(r) => (
                          <FilterChip
                            active={range() === r.id}
                            onClick={() => pickRange(r.id)}
                            label={<span class="text-xs">{t(`network.${r.key}` as any)}</span>}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Portal>
            </Show>
          </>
        }
      >
        {/* Wide: tabs. The row scrolls rather than wraps, so the toolbar
            keeps its height whatever the caller's `available` list is. */}
        <div class="flex items-center gap-1.5 min-w-0 overflow-x-auto">
          <div
            class="flex rounded-lg border border-rim overflow-hidden shrink-0"
            role="tablist"
            aria-label={t("network.sort_by")}
          >
            <For each={orders()}>
              {(o) => (
                <button
                  role="tab"
                  title={labelFor(o.id, o.key)}
                  aria-selected={props.order === o.id}
                  aria-haspopup={RANGE_AWARE.includes(o.id) ? "listbox" : undefined}
                  aria-expanded={
                    RANGE_AWARE.includes(o.id) ? open() && props.order === o.id : undefined
                  }
                  onClick={() => pickOrder(o.id)}
                  class={segCls(props.order === o.id)}
                >
                  <o.icon size={14} />
                  <span class="hidden lg:inline text-xs font-medium">
                    {labelFor(o.id, o.key)}
                  </span>
                  <Show when={RANGE_AWARE.includes(o.id) && props.order === o.id}>
                    <MdFillKeyboard_arrow_down size={14} />
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Ranges float above the toolbar instead of sitting in the row —
            inline they resized the toolbar every time a ranked order was
            picked. Anchored to the row start, since the row itself scrolls. */}
        <Show when={rangeAware() && open()}>
          <Portal>
            <div
              ref={floating}
              style={style()}
              role="listbox"
              aria-label={t("network.sort_by")}
              class="z-50 flex gap-1 p-1 rounded-lg border border-rim bg-surface shadow-lg"
            >
              <For each={RANGES}>
                {(r) => (
                  <button
                    role="option"
                    aria-selected={range() === r.id}
                    onClick={() => pickRange(r.id)}
                    class={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap
                      transition-colors
                      ${range() === r.id
                        ? "bg-accent text-accent-fg"
                        : "text-txt hover:bg-elevated"}`}
                  >
                    {t(`network.${r.key}` as any)}
                  </button>
                )}
              </For>
            </div>
          </Portal>
        </Show>
      </Show>
    </div>
  );
}
