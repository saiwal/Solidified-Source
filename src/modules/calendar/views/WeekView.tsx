import { For, Show, createMemo, onMount } from "solid-js";
import type { CalEvent } from "../api";
import {
  HOUR_H, localDay, startOfWeek, addDays, isoDateStr, todayKey,
  weekLayout, columnLayout, eventTopPx, eventHeightPx, eventChip,
  evTitle,
} from "./calUtils";
import NowLine from "./NowLine";
import { useI18n } from "@utsukta/spa-core/i18n";
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";

interface Props {
  anchor: Date;
  events: CalEvent[];
  onDayClick: (date: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const TIME_W = 44;

export default function WeekView(props: Props) {
  const { t, locale } = useI18n();
  const todayK = todayKey();

  const weekDates = createMemo(() => {
    const s = startOfWeek(new Date(props.anchor), isFeatureEnabled("cal_first_day"));
    return Array.from({ length: 7 }, (_, i) => isoDateStr(addDays(s, i)));
  });

  // All-day events + multi-day timed events → banner strip.
  // Single-day timed events → time grid (timedByDay).
  const allDayEvs = createMemo(() =>
    props.events.filter(ev =>
      ev.allDay || localDay(ev.start) !== localDay(ev.end ?? ev.start)
    )
  );

  const timedByDay = createMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of props.events) {
      if (ev.allDay) continue;
      const s = localDay(ev.start);
      const e = localDay(ev.end ?? ev.start);
      if (s === e) {
        if (!map.has(s)) map.set(s, []);
        map.get(s)!.push(ev);
      }
    }
    return map;
  });

  // allInLanes=true: single-day all-day events also appear in the banner (not just multi-day ones).
  const banner = createMemo(() => weekLayout(weekDates(), allDayEvs(), true));
  const cols = `${TIME_W}px repeat(7, minmax(0, 1fr))`;

  let gridRef!: HTMLDivElement;
  onMount(() => gridRef?.scrollTo({ top: 7 * HOUR_H - 16 }));

  return (
    <div class="flex flex-col h-full">
      {/* Day headers */}
      <div class="grid shrink-0 pb-2" style={{ "grid-template-columns": cols }}>
        <div />
        <For each={weekDates()}>
          {(date) => {
            const isToday = date === todayK;
            const d = new Date(date + "T12:00:00");
            return (
              <button
                type="button"
                aria-current={isToday ? "date" : undefined}
                aria-label={d.toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" })}
                class="flex flex-col items-center gap-0.5 py-1 rounded-xl hover:bg-elevated/40 transition-colors
                  focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => props.onDayClick(date)}
              >
                <span class={`text-xs ${isToday ? "text-accent-txt font-medium" : "text-muted"}`}>
                  {d.toLocaleDateString(locale(), { weekday: "short" })}
                </span>
                <span
                  class={`text-sm font-semibold w-8 h-8 flex items-center justify-center rounded-full tabular-nums
                    ${isToday ? "bg-accent text-accent-fg" : "text-txt"}`}
                >
                  {d.getDate()}
                </span>
              </button>
            );
          }}
        </For>
      </div>

      {/* All-day banner */}
      <Show when={banner().lanes.length > 0}>
        <div class="grid shrink-0 pb-2" style={{ "grid-template-columns": `${TIME_W}px 1fr` }}>
          <div class="text-[0.625rem] text-muted flex items-center justify-end pr-2">
            {t("calendar.all_day")}
          </div>
          <div class="relative" style={{ "min-height": `${banner().lanes.length * 22 + 6}px` }}>
            <For each={banner().lanes}>
              {(lane, li) => (
                <div class="absolute left-0 right-0" style={{ top: `${li() * 22 + 3}px`, height: "20px" }}>
                  <For each={lane}>
                    {(span) => {
                      const pct = 100 / 7;
                      const chip = eventChip(span.event);
                      return (
                        <div
                          class={`absolute h-full text-[0.625rem] leading-[20px] font-medium px-1.5 truncate
                            cursor-pointer ${chip.class} ${span.startsBefore ? "" : "rounded-l-md"} ${span.endsAfter ? "" : "rounded-r-md"}`}
                          style={{
                            left: span.startsBefore ? "0" : `calc(${span.startCol * pct}% + 2px)`,
                            right: span.endsAfter ? "0" : `calc(${(6 - span.endCol) * pct}% + 2px)`,
                            ...chip.style,
                          }}
                          onClick={() => props.onDayClick(weekDates()[span.startCol])}
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
        </div>
      </Show>

      {/* Scrollable time grid */}
      <div class="flex-1 min-h-0 overflow-y-auto border-t border-rim/40" ref={gridRef!}>
        <div class="relative grid" style={{ "grid-template-columns": cols, height: `${24 * HOUR_H}px` }}>
          {/* Time labels */}
          <div class="relative">
            <For each={HOURS}>
              {(h) => (
                <div
                  class="absolute right-2 text-[0.625rem] text-muted leading-none tabular-nums"
                  style={{ top: `${h * HOUR_H - 5}px` }}
                >
                  {h > 0 ? `${h}:00` : ""}
                </div>
              )}
            </For>
          </div>

          {/* Day columns */}
          <For each={weekDates()}>
            {(date) => {
              const isToday = date === todayK;
              const items = createMemo(() => columnLayout(timedByDay().get(date) ?? []));

              return (
                <div
                  class={`relative border-l border-rim/30 ${isToday ? "bg-accent-muted/20" : ""}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-ev]")) return;
                    props.onDayClick(date);
                  }}
                >
                  {/* Hour lines */}
                  <For each={HOURS}>
                    {(h) => (
                      <div class="absolute left-0 right-0 border-t border-rim/30" style={{ top: `${h * HOUR_H}px` }} />
                    )}
                  </For>

                  <Show when={isToday}>
                    <NowLine />
                  </Show>

                  {/* Timed events */}
                  <For each={items()}>
                    {(item) => {
                      const chip = eventChip(item.event, true);
                      const top = eventTopPx(item.event.start);
                      const height = eventHeightPx(item.event.start, item.event.end);
                      const startLbl = new Date(item.event.start).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
                      return (
                        <div
                          data-ev
                          class={`absolute rounded-md overflow-hidden px-1.5 py-0.5 text-[0.625rem] font-medium
                            cursor-pointer leading-snug ${chip.class}`}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            left: `${(item.col / item.totalCols) * 100}%`,
                            width: `calc(${(1 / item.totalCols) * 100}% - 3px)`,
                            "margin-left": "2px",
                            ...chip.style,
                          }}
                          onClick={() => props.onDayClick(date)}
                        >
                          <div class="font-semibold truncate">{evTitle(item.event, t("calendar.no_title"))}</div>
                          <div class="opacity-70 tabular-nums">{startLbl}</div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
