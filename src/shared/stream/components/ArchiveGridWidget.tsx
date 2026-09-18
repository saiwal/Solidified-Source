// src/shared/stream/components/ArchiveGridWidget.tsx
//
// Alternate archive layout: a month calendar with a dot under each day that
// has a post, plus prev/next month + prev/next year navigation. Clicking a
// dotted day toggles a single-day dbegin/dend filter.

import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  Show,
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import {
  dayRange,
  fetchArchiveDays,
  parseYearMonth,
  type ArchiveWidgetProps,
} from "./ArchiveWidget";

// 2000-01-02 is a Sunday — anchor for building a Sun-first weekday label row.
function weekdayLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2000, 0, 2 + i)));
}

function monthName(month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, month - 1, 1));
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

export interface ArchiveCalendarProps extends ArchiveWidgetProps {
  onDayClick?: (year: number, month: number, day: number) => void;
}

function CalendarSkeleton() {
  return (
    <div class="px-3 py-3 animate-pulse">
      <div class="h-4 w-28 bg-elevated rounded mx-auto mb-3" />
      <div class="grid grid-cols-7 gap-1">
        <For each={Array.from({ length: 35 })}>
          {() => <div class="aspect-square bg-elevated rounded-lg" />}
        </For>
      </div>
    </div>
  );
}

const ArchiveGridWidget: Component<ArchiveCalendarProps> = (props) => {
  const { t, locale } = useI18n();

  const today = new Date();
  const initial = parseYearMonth(props.activeDbegin ?? "")
    ?? { year: today.getFullYear(), month: today.getMonth() + 1 };

  const [viewYear, setViewYear] = createSignal(initial.year);
  const [viewMonth, setViewMonth] = createSignal(initial.month);

  const prevMonth = () => {
    if (viewMonth() === 1) { setViewMonth(12); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth() === 12) { setViewMonth(1); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };
  const prevYear = () => setViewYear((y) => y - 1);
  const nextYear = () => setViewYear((y) => y + 1);

  const isCurrentMonth = () =>
    viewYear() === today.getFullYear() && viewMonth() === today.getMonth() + 1;
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth() + 1);
  };

  const [remote] = createQueryResource(
    "stream-archive-days",
    () => ({
      channelNick: props.channelNick,
      type: props.type,
      year: viewYear(),
      month: viewMonth(),
    }),
    fetchArchiveDays,
  );

  createEffect(
    on(() => remote.error, (err) => {
      if (err) toast.error((err as Error).message ?? t("widgets.load_error"));
    }),
  );

  const counts = createMemo(() => {
    const map = new Map<number, number>();
    for (const d of remote() ?? []) map.set(d.day, d.count);
    return map;
  });

  const cells = createMemo(() => {
    const offset = firstWeekday(viewYear(), viewMonth());
    const total = daysInMonth(viewYear(), viewMonth());
    const out: Array<number | null> = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let d = 1; d <= total; d++) out.push(d);
    return out;
  });

  const isActiveDay = (day: number) => {
    const [db, de] = dayRange(viewYear(), viewMonth(), day);
    return props.activeDbegin === db && props.activeDend === de;
  };

  return (
    <div class="bg-surface border border-rim rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-rim">
        <h3 class="text-sm font-semibold text-txt">{props.title ?? t("widgets.archive")}</h3>
      </div>

      <div class="px-3 pt-3">
        {/* Month/year navigation */}
        <div class="flex items-center gap-1 mb-2">
          <button
            type="button"
            onClick={prevYear}
            title={t("widgets.archive_prev_year")}
            class="px-1.5 py-1 text-xs text-muted rounded hover:bg-elevated hover:text-txt transition-colors"
          >
            «
          </button>
          <button
            type="button"
            onClick={prevMonth}
            title={t("widgets.archive_prev_month")}
            class="px-1.5 py-1 text-xs text-muted rounded hover:bg-elevated hover:text-txt transition-colors"
          >
            ‹
          </button>

          <button
            type="button"
            onClick={goToday}
            disabled={isCurrentMonth()}
            class="flex-1 text-center text-sm font-medium text-txt rounded py-1 transition-colors disabled:cursor-default hover:enabled:bg-elevated"
          >
            {monthName(viewMonth(), locale())} {viewYear()}
          </button>

          <button
            type="button"
            onClick={nextMonth}
            title={t("widgets.archive_next_month")}
            class="px-1.5 py-1 text-xs text-muted rounded hover:bg-elevated hover:text-txt transition-colors"
          >
            ›
          </button>
          <button
            type="button"
            onClick={nextYear}
            title={t("widgets.archive_next_year")}
            class="px-1.5 py-1 text-xs text-muted rounded hover:bg-elevated hover:text-txt transition-colors"
          >
            »
          </button>
        </div>
      </div>

      <Show when={remote.loading}>
        <CalendarSkeleton />
      </Show>

      <Show when={!remote.loading}>
        <div class="px-3 pb-3">
          {/* Weekday header */}
          <div class="grid grid-cols-7 gap-1 mb-1">
            <For each={weekdayLabels(locale())}>
              {(label) => (
                <div class="text-center text-[0.625rem] font-medium text-muted">{label}</div>
              )}
            </For>
          </div>

          {/* Day cells */}
          <div class="grid grid-cols-7 gap-1">
            <For each={cells()}>
              {(day) => {
                if (day === null) return <div />;
                const count = () => counts().get(day) ?? 0;
                const active = () => isActiveDay(day);
                return (
                  <button
                    type="button"
                    disabled={count() === 0}
                    onClick={() => props.onDayClick?.(viewYear(), viewMonth(), day)}
                    title={count() > 0 ? `${monthName(viewMonth(), locale())} ${day}, ${viewYear()} — ${count()}` : undefined}
                    class="aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors"
                    classList={{
                      "bg-accent-muted": active(),
                      "hover:bg-elevated": !active() && count() > 0,
                      "cursor-default": count() === 0,
                    }}
                  >
                    <span
                      class="text-xs leading-none"
                      classList={{
                        "text-accent font-medium": active(),
                        "text-txt": !active() && count() > 0,
                        "text-muted": count() === 0,
                      }}
                    >
                      {day}
                    </span>
                    <Show when={count() > 0}>
                      <span
                        class="w-1 h-1 rounded-full"
                        classList={{
                          "bg-accent": active(),
                          "bg-accent/60": !active(),
                        }}
                      />
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default ArchiveGridWidget;
