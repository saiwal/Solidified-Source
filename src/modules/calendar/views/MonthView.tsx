import { For, Show, createMemo } from "solid-js";
import type { CalEvent } from "../api";
import { weeksForMonth, weekLayout, todayKey, eventChip, evTitle } from "./calUtils";
import { useI18n } from "@utsukta/spa-core/i18n";
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";

const LANE_H = 22;
const DAY_NUM_H = 34;

// 2000-01-02 is a Sunday — anchor for building the weekday header labels.
function weekdayLabels(locale: string, mondayStart: boolean): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const offset = mondayStart ? 1 : 0;
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2000, 0, 2 + offset + i)));
}

interface Props {
  year: number;
  month: number;
  events: CalEvent[];
  onDayClick: (date: string) => void;
}

export default function MonthView(props: Props) {
  const { t, locale } = useI18n();
  const todayK = todayKey();
  const mondayStart = () => isFeatureEnabled("cal_first_day");
  const monthPrefix = () => `${props.year}-${String(props.month).padStart(2, "0")}`;
  const weeks = createMemo(() => weeksForMonth(props.year, props.month, mondayStart()));
  const headerLabels = () => weekdayLabels(locale(), mondayStart());
  const fullDate = (date: string) =>
    new Date(date + "T00:00:00").toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" });

  return (
    <div class="flex flex-col">
      {/* Weekday header */}
      <div class="grid grid-cols-7 sticky top-0 bg-base z-10">
        <For each={headerLabels()}>
          {(wd) => <div class="text-center text-xs text-muted py-2">{wd}</div>}
        </For>
      </div>

      <For each={weeks()}>
        {(weekDates) => {
          const layout = createMemo(() => weekLayout(weekDates, props.events));

          return (
            <div class="relative border-t border-rim/40">
              {/* Day cells — day number + spacer + single-day pills */}
              <div class="grid grid-cols-7">
                <For each={weekDates}>
                  {(date) => {
                    const inMonth = date.startsWith(monthPrefix());
                    const isToday = date === todayK;
                    const day = parseInt(date.slice(8));
                    const dayEvs = () => layout().singleDay.get(date) ?? [];
                    const spacerH = () => layout().lanes.length * LANE_H;

                    return (
                      <button
                        type="button"
                        aria-label={fullDate(date)}
                        aria-current={isToday ? "date" : undefined}
                        class={`block text-left p-1 min-h-[88px] rounded-xl transition-colors
                          hover:bg-elevated/40 focus-visible:outline-2 focus-visible:outline-accent
                          ${isToday ? "bg-accent-muted/30" : ""}`}
                        onClick={() => props.onDayClick(date)}
                      >
                        <span
                          class={`text-xs w-7 h-7 flex items-center justify-center rounded-full tabular-nums
                            ${isToday ? "bg-accent text-accent-fg font-semibold"
                              : inMonth ? "text-txt" : "text-muted/50"}`}
                        >
                          {day}
                        </span>
                        {/* Spacer reserves room for the absolute-positioned spanning bars */}
                        <Show when={spacerH() > 0}>
                          <span class="block" style={{ height: `${spacerH()}px` }} />
                        </Show>
                        <For each={dayEvs().slice(0, 2)}>
                          {(ev) => {
                            const chip = eventChip(ev);
                            return (
                              <span
                                class={`block text-[0.625rem] leading-[18px] rounded-md px-1.5 mb-0.5 font-medium truncate ${chip.class}`}
                                style={chip.style}
                              >
                                {evTitle(ev, t("calendar.no_title"))}
                              </span>
                            );
                          }}
                        </For>
                        <Show when={dayEvs().length > 2}>
                          <span class="block text-[0.625rem] text-muted pl-1.5">
                            {t("calendar.more_events", { count: String(dayEvs().length - 2) })}
                          </span>
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>

              {/* Spanning event bars — absolutely overlaid on the spacer area */}
              <Show when={layout().lanes.length > 0}>
                <div
                  class="absolute left-0 right-0 pointer-events-none"
                  style={{ top: `${DAY_NUM_H}px` }}
                >
                  <For each={layout().lanes}>
                    {(lane) => (
                      <div class="relative" style={{ height: `${LANE_H}px` }}>
                        <For each={lane}>
                          {(span) => {
                            const pct = 100 / 7;
                            const chip = eventChip(span.event);
                            return (
                              <div
                                class={`absolute top-0.5 bottom-0.5 text-[0.625rem] leading-[18px] font-medium px-1.5
                                  truncate pointer-events-auto cursor-pointer ${chip.class}
                                  ${span.startsBefore ? "" : "rounded-l-md"} ${span.endsAfter ? "" : "rounded-r-md"}`}
                                style={{
                                  left: span.startsBefore ? "0" : `calc(${span.startCol * pct}% + 4px)`,
                                  right: span.endsAfter ? "0" : `calc(${(6 - span.endCol) * pct}% + 4px)`,
                                  ...chip.style,
                                }}
                                onClick={() => props.onDayClick(weekDates[span.startCol])}
                              >
                                {!span.startsBefore && evTitle(span.event, t("calendar.no_title"))}
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
