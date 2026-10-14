import {
  createEffect, createSignal, createMemo, Show, For, Switch, Match,
} from "solid-js";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillChevron_left, MdFillChevron_right } from "solid-icons/md";
import {
  events, loading, loadCalendar, monthRange, calendarRefreshVersion,
  viewType, anchor, setAnchor, type ViewType,
} from "../store";
import type { CalEvent, CalRange } from "../api";
import DayDetailModal from "../views/DayDetailModal";
import MonthView from "../views/MonthView";
import WeekView from "../views/WeekView";
import DayView from "../views/DayView";
import ListView from "../views/ListView";
import { isoDateStr, startOfWeek, addDays, eventOnDay } from "../views/calUtils";
import { iconBtn, SkeletonRows } from "@/shared/views/ui";
import { Motion, fade } from "@/shared/views/anim";

function rangeForView(view: ViewType, anchor: Date): CalRange {
  if (view === "list") {
    const now = new Date();
    const oneYearOut = new Date(now);
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
    return { start: isoDateStr(now), end: isoDateStr(oneYearOut) };
  }
  if (view === "month") {
    return monthRange(anchor.getFullYear(), anchor.getMonth() + 1);
  }
  if (view === "week") {
    const s = startOfWeek(anchor, isFeatureEnabled("cal_first_day"));
    return { start: isoDateStr(s), end: isoDateStr(addDays(s, 7)) };
  }
  return { start: isoDateStr(anchor), end: isoDateStr(addDays(anchor, 1)) };
}

export default function CalendarContentWidget() {
  const nick = usePageNick();
  const { t, locale } = useI18n();

  const [activeDay, setActiveDay] = createSignal<string | null>(null);

  const fetchRange = createMemo(() => rangeForView(viewType(), anchor()));

  createEffect(() => {
    const version = calendarRefreshVersion();
    const n = nick();
    const r = fetchRange();
    if (!n) return;
    loadCalendar(n, r, version > 0);
  });

  function navigate(dir: -1 | 1) {
    setAnchor(d => {
      const nd = new Date(d);
      if (viewType() === "month") nd.setMonth(nd.getMonth() + dir);
      else if (viewType() === "week") nd.setDate(nd.getDate() + dir * 7);
      else nd.setDate(nd.getDate() + dir);
      return nd;
    });
  }

  const periodLabel = createMemo(() => {
    const d = anchor();
    const v = viewType();
    if (v === "month")
      return new Date(d.getFullYear(), d.getMonth(), 1)
        .toLocaleDateString(locale(), { month: "long", year: "numeric" });
    if (v === "week") {
      const s = startOfWeek(d, isFeatureEnabled("cal_first_day"));
      const e = addDays(s, 6);
      return `${s.toLocaleDateString(locale(), { month: "short", day: "numeric" })} – ${e.toLocaleDateString(locale(), { month: "short", day: "numeric", year: "numeric" })}`;
    }
    if (v === "list") return t("calendar.upcoming_events") as string;
    return d.toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  });

  function refreshCurrent() {
    const n = nick();
    if (n) loadCalendar(n, fetchRange(), true);
  }

  // Category filter. Applied client-side: the range's events are already loaded, so
  // filtering here is instant and needs no refetch. (Cal.php also accepts ?cat= for
  // API consumers that want the server to narrow it.)
  const [catFilter, setCatFilter] = createSignal<string | null>(null);

  const allCategories = createMemo<string[]>(() => {
    const seen = new Set<string>();
    for (const ev of events()) for (const c of ev.categories ?? []) seen.add(c);
    return [...seen].sort((a, b) => a.localeCompare(b));
  });

  const visibleEvents = createMemo<CalEvent[]>(() => {
    const c = catFilter();
    return c ? events().filter(ev => ev.categories?.includes(c)) : events();
  });

  // Drop a filter that the newly loaded range has no events for, so the calendar
  // never looks empty because of a stale selection.
  createEffect(() => {
    const c = catFilter();
    if (c && !allCategories().includes(c)) setCatFilter(null);
  });

  const activeDayEvs = createMemo<CalEvent[]>(() => {
    const d = activeDay();
    if (!d) return [];
    return visibleEvents().filter(ev => eventOnDay(ev, d));
  });

  // The time grids scroll inside a window-sized box, so "scroll to 7am" has
  // something to scroll and the day headers stay put.
  const gridBox = "h-[calc(100dvh-15rem)] min-h-[26rem]";

  return (
    <div class="flex flex-col gap-4 max-w-5xl mx-auto">
      {/* Period + navigation */}
      <div class="flex items-center gap-1 flex-wrap">
        <h2 class="text-base font-semibold text-txt mr-auto tabular-nums">{periodLabel()}</h2>
        <Show when={viewType() !== "list"}>
          <button type="button" onClick={() => navigate(-1)} class={iconBtn}
            title={t("calendar.previous")} aria-label={t("calendar.previous")}>
            <MdFillChevron_left size={20} />
          </button>
          <button type="button" onClick={() => setAnchor(new Date())}
            class="px-3 py-1.5 rounded-full text-sm text-muted hover:text-txt hover:bg-elevated/70 transition-colors">
            {t("calendar.today")}
          </button>
          <button type="button" onClick={() => navigate(1)} class={iconBtn}
            title={t("calendar.next")} aria-label={t("calendar.next")}>
            <MdFillChevron_right size={20} />
          </button>
        </Show>
      </div>

      {/* Category filter — only when the loaded range actually has categories */}
      <Show when={allCategories().length > 0}>
        <div class="flex items-center gap-1 flex-wrap -mt-2">
          <For each={allCategories()}>
            {(cat) => (
              <button
                type="button"
                aria-pressed={catFilter() === cat}
                onClick={() => setCatFilter((c) => (c === cat ? null : cat))}
                class={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                  catFilter() === cat
                    ? "bg-accent-muted text-accent-txt font-medium"
                    : "text-muted hover:text-txt hover:bg-elevated/60"
                }`}
              >
                {cat}
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={viewType()} keyed>
        {(v) => (
          <Motion.div {...fade}>
            <Switch>
              <Match when={v === "month"}>
                <MonthView
                  year={anchor().getFullYear()}
                  month={anchor().getMonth() + 1}
                  events={visibleEvents()}
                  onDayClick={setActiveDay}
                />
              </Match>
              <Match when={v === "week"}>
                <div class={gridBox}>
                  <WeekView anchor={anchor()} events={visibleEvents()} onDayClick={setActiveDay} />
                </div>
              </Match>
              <Match when={v === "day"}>
                <div class={gridBox}>
                  <DayView date={anchor()} events={visibleEvents()} onDayClick={setActiveDay} />
                </div>
              </Match>
              <Match when={v === "list"}>
                <Show when={!loading() || events().length > 0} fallback={<SkeletonRows count={6} />}>
                  <ListView events={visibleEvents()} />
                </Show>
              </Match>
            </Switch>
          </Motion.div>
        )}
      </Show>

      <Show when={activeDay()}>
        <DayDetailModal
          date={activeDay()!}
          events={activeDayEvs()}
          onClose={() => setActiveDay(null)}
          onEventCreated={refreshCurrent}
          onEventEdited={refreshCurrent}
          onEventDeleted={refreshCurrent}
        />
      </Show>
    </div>
  );
}
