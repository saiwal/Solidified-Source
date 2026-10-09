import { For, Show, createSignal, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
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

  // Range-aware orders are split buttons: the label picks the order, the
  // caret opens the range picker for that order without reloading first.
  // `rangeFor` is the order the range panel is currently aimed at.
  const [rangeFor, setRangeFor] = createSignal<SortOrder | null>(null);
  // Only the active order has a range in force; another order's panel starts unselected.
  const panelRange = () => (rangeFor() === props.order ? range() : null);

  const pickOrder = (id: SortOrder) => {
    // Dropping a range on an order that can't use one would leave a stale
    // ?range= in the URL that nothing reads.
    if (id !== props.order) props.onChange(id, RANGE_AWARE.includes(id) ? range() : undefined);
    setOpen(false);
  };

  // Wide: the range panel anchors under the split button that opened it.
  // Narrow: it anchors to the whole control, and the chips sit under their row.
  let root!: HTMLDivElement;
  const groupEls: Partial<Record<SortOrder, HTMLElement>> = {};
  const toggleRanges = (id: SortOrder, anchor?: HTMLElement) => {
    const same = open() && rangeFor() === id;
    if (anchor) ref(anchor);
    setRangeFor(same ? null : id);
    // The narrow dropdown stays open; the caret just folds its chips away.
    setOpen(!same || !wide());
  };

  const pickRange = (r: SortRange) => {
    const o = rangeFor();
    if (o) props.onChange(o, r);
    setRangeFor(null);
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
    <div class="min-w-0" ref={(el) => { root = el; ref(el); }} use:helpable={props.help ?? "network.sort_order"}>
      <Show
        when={wide()}
        fallback={
          <>
            <button
              title={t("network.sort_by")}
              aria-expanded={open()}
              aria-haspopup="listbox"
              onClick={() => { ref(root); setRangeFor(null); setOpen(!open()); }}
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
              <Portal mount={topLayer()}>
                <div
                  ref={floating}
                  style={style()}
                  role="listbox"
                  class="z-50 w-52 p-1 rounded-lg border border-rim bg-surface shadow-lg"
                >
                <For each={orders()}>
                  {(o) => (
                    <>
                    <div
                      class={`flex items-center rounded-md transition-colors
                        ${props.order === o.id
                          ? "bg-accent text-accent-fg"
                          : "text-txt hover:bg-elevated"}`}
                    >
                      <button
                        role="option"
                        aria-selected={props.order === o.id}
                        onClick={() => pickOrder(o.id)}
                        class="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-sm text-left"
                      >
                        <o.icon size={14} />
                        <span>{labelFor(o.id, o.key)}</span>
                      </button>
                      <Show when={RANGE_AWARE.includes(o.id)}>
                        <button
                          title={t("network.date_range")}
                          aria-label={t("network.date_range")}
                          aria-expanded={rangeFor() === o.id}
                          onClick={() => toggleRanges(o.id)}
                          class="px-2 py-1.5 self-stretch flex items-center rounded-r-md hover:bg-black/10"
                        >
                          <MdFillKeyboard_arrow_down size={14}
                            class={rangeFor() === o.id ? "rotate-180" : ""} />
                        </button>
                      </Show>
                    </div>
                    <Show when={rangeFor() === o.id}>
                    <div class="flex flex-wrap gap-1 pl-7 pr-1 py-1.5">
                      <For each={RANGES}>
                        {(r) => (
                          <FilterChip
                            active={panelRange() === r.id}
                            onClick={() => pickRange(r.id)}
                            label={<span class="text-xs">{t(`network.${r.key}` as any)}</span>}
                          />
                        )}
                      </For>
                    </div>
                    </Show>
                    </>
                  )}
                </For>
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
            class="flex rounded-lg border border-rim overflow-hidden shrink-0 divide-x divide-rim"
            role="tablist"
            aria-label={t("network.sort_by")}
          >
            <For each={orders()}>
              {(o) => (
                <div class="flex" ref={(el) => (groupEls[o.id] = el)}>
                  <button
                    role="tab"
                    title={labelFor(o.id, o.key)}
                    aria-selected={props.order === o.id}
                    onClick={() => pickOrder(o.id)}
                    class={segCls(props.order === o.id)}
                  >
                    <o.icon size={14} />
                    <span class="hidden lg:inline text-xs font-medium">
                      {labelFor(o.id, o.key)}
                    </span>
                  </button>
                  <Show when={RANGE_AWARE.includes(o.id)}>
                    <button
                      title={t("network.date_range")}
                      aria-label={t("network.date_range")}
                      aria-haspopup="listbox"
                      aria-expanded={open() && rangeFor() === o.id}
                      onClick={() => toggleRanges(o.id, groupEls[o.id])}
                      class={`${segCls(props.order === o.id)} pl-0! pr-1!`}
                    >
                      <MdFillKeyboard_arrow_down size={14}
                        class={open() && rangeFor() === o.id ? "rotate-180" : ""} />
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* Ranges float above the toolbar instead of sitting in the row —
            inline they resized the toolbar every time a ranked order was
            picked. Anchored under the split button whose caret opened it. */}
        <Show when={rangeFor() && open()}>
          <Portal mount={topLayer()}>
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
                    aria-selected={panelRange() === r.id}
                    onClick={() => pickRange(r.id)}
                    class={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap
                      transition-colors
                      ${panelRange() === r.id
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
