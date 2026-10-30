import { For, Show, createMemo, onMount } from "solid-js";
import type { CalEvent } from "../api";
import {
  HOUR_H, isoDateStr, todayKey, prevDay,
  columnLayout, eventTopPx, eventHeightPx, eventChip,
  evTitle,
} from "./calUtils";
import NowLine from "./NowLine";
import { useI18n } from "@utsukta/spa-core/i18n";

interface Props {
  date: Date;
  events: CalEvent[];
  onDayClick: (date: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const TIME_W = 44;

// The date itself is the toolbar's period label above, so no header here.
export default function DayView(props: Props) {
  const { t, locale } = useI18n();
  const todayK = todayKey();

  const dateStr = createMemo(() => isoDateStr(props.date));
  const isToday = createMemo(() => dateStr() === todayK);

  const allDayEvs = createMemo(() =>
    props.events.filter(ev => {
      if (ev.allDay) {
        // Use UTC date slices for all-day events (no meaningful timezone offset).
        const startD = ev.start.slice(0, 10);
        const endD = ev.end ? ev.end.slice(0, 10) : startD;
        // CalDAV uses exclusive DTEND (next day); channel events use inclusive DTEND (same day).
        // Normalize to inclusive so a June 10 CalDAV event doesn't bleed into June 11.
        const inclusiveEnd = (ev.end && endD > startD) ? prevDay(endD) : endD;
        // Malformed end-before-start data shouldn't vanish from the day view.
        return startD <= dateStr() && (inclusiveEnd < startD ? startD : inclusiveEnd) >= dateStr();
      }
      // Multi-day timed events that started before this day but extend through it
      const s = isoDateStr(new Date(ev.start));
      const e = isoDateStr(new Date(ev.end ?? ev.start));
      return s < dateStr() && e >= dateStr();
    })
  );

  const timedEvs = createMemo(() =>
    props.events.filter(ev => {
      if (ev.allDay) return false;
      // Use local-time date comparison to match how dateStr() is computed
      return isoDateStr(new Date(ev.start)) === dateStr();
    })
  );

  const colItems = createMemo(() => columnLayout(timedEvs()));

  let scrollRef!: HTMLDivElement;
  onMount(() => scrollRef?.scrollTo({ top: 7 * HOUR_H - 16 }));

  return (
    <div class="flex flex-col h-full">
      {/* All-day events */}
      <Show when={allDayEvs().length > 0}>
        <div class="pb-2 flex flex-col gap-1 shrink-0" style={{ "padding-left": `${TIME_W}px` }}>
          <For each={allDayEvs()}>
            {(ev) => {
              const chip = eventChip(ev);
              return (
                <div
                  class={`text-xs font-medium rounded-md px-2 py-1 truncate cursor-pointer ${chip.class}`}
                  style={chip.style}
                  onClick={() => props.onDayClick(dateStr())}
                >
                  {evTitle(ev, t("calendar.no_title"))}
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      {/* Time grid */}
      <div class="flex-1 min-h-0 overflow-y-auto border-t border-rim/40" ref={scrollRef!}>
        <div class="relative grid" style={{ "grid-template-columns": `${TIME_W}px 1fr`, height: `${24 * HOUR_H}px` }}>
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

          {/* Event column */}
          <div
            class={`relative ${isToday() ? "bg-accent-muted/20" : ""}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("[data-ev]")) return;
              props.onDayClick(dateStr());
            }}
          >
            {/* Hour lines */}
            <For each={HOURS}>
              {(h) => (
                <div class="absolute left-0 right-0 border-t border-rim/30" style={{ top: `${h * HOUR_H}px` }} />
              )}
            </For>

            <Show when={isToday()}>
              <NowLine />
            </Show>

            {/* Timed events */}
            <For each={colItems()}>
              {(item) => {
                const chip = eventChip(item.event, true);
                const top = eventTopPx(item.event.start);
                const rawH = eventHeightPx(item.event.start, item.event.end);
                // Cap at midnight so multi-day events don't overflow the 24-hour grid
                const height = Math.min(rawH, 24 * HOUR_H - top);
                const crossesMidnight = rawH > height;
                const fmt = { hour: "numeric", minute: "2-digit" } as const;
                const startLbl = new Date(item.event.start).toLocaleTimeString(locale(), fmt);
                const endLbl = item.event.end
                  ? new Date(item.event.end).toLocaleTimeString(locale(), fmt)
                  : null;
                return (
                  <div
                    data-ev
                    class={`absolute rounded-md overflow-hidden px-2 py-1 text-xs font-medium
                      cursor-pointer leading-snug ${chip.class}`}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `calc(${(item.col / item.totalCols) * 100}% + 2px)`,
                      width: `calc(${(1 / item.totalCols) * 100}% - 4px)`,
                      ...chip.style,
                    }}
                    onClick={() => props.onDayClick(dateStr())}
                  >
                    <div class="font-semibold truncate">{evTitle(item.event, t("calendar.no_title"))}</div>
                    <div class="opacity-70 text-[0.625rem] tabular-nums">
                      {startLbl}{endLbl ? ` – ${crossesMidnight ? endLbl + " →" : endLbl}` : ""}
                    </div>
                    <Show when={item.event.location}>
                      <div class="opacity-60 text-[0.625rem] truncate">{item.event.location}</div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
