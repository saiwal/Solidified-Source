import {
  createEffect, createSignal, createMemo, Show, For,
} from "solid-js";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useAuth, isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillChevron_left, MdFillChevron_right, MdOutlineAdd } from "solid-icons/md";
import {
  events, loading, loadCalendar, monthRange, calendarRefreshVersion,
} from "../store";
import type { CalEvent, CalRange } from "../api";
import DayDetailModal from "../views/DayDetailModal";
import EventCreatorModal from "./EventCreatorModal";
import MonthView from "../views/MonthView";
import WeekView from "../views/WeekView";
import DayView from "../views/DayView";
import ListView from "../views/ListView";
import { isoDateStr, startOfWeek, addDays, eventOnDay } from "../views/calUtils";

type ViewType = "month" | "week" | "day" | "list";

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
  const auth = useAuth();
  // New events always go to the viewer's own calendar, regardless of whose
  // /cal/:nick page is open — creation requires a local channel on this server.
  const canCreate = () => auth()?.isLocal === true;

  const today = new Date();
  const [viewType, setViewType] = createSignal<ViewType>("month");
  const [anchor, setAnchor] = createSignal(today);
  const [activeDay, setActiveDay] = createSignal<string | null>(null);
  const [showModal, setShowModal] = createSignal(false);
  const [showCreator, setShowCreator] = createSignal(false);

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

  function handleDayClick(date: string) {
    setActiveDay(date);
    setShowModal(true);
  }

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

  const VIEWS: { key: ViewType; label: () => string }[] = [
    { key: "month", label: () => t("calendar.view_month") as string },
    { key: "week",  label: () => t("calendar.view_week")  as string },
    { key: "day",   label: () => t("calendar.view_day")   as string },
    { key: "list",  label: () => t("calendar.view_list")  as string },
  ];

  return (
    <div class="flex flex-col gap-3 h-full min-h-0 max-w-5xl mx-auto">
      {/* Toolbar */}
      <div class="flex items-center gap-2 flex-wrap">
        <h2 class="text-lg font-semibold text-txt mr-auto">{periodLabel()}</h2>
        <Show when={loading()}>
          <span class="text-xs text-muted">{t("calendar.loading")}</span>
        </Show>

        {/* Navigation */}
        <Show when={viewType() !== "list"}>
          <div class="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              class="p-1.5 rounded-lg border border-rim text-muted hover:bg-elevated hover:text-txt transition-colors"
              aria-label="Previous"
            >
              <MdFillChevron_left size={18} />
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              class="px-2 py-1 text-xs rounded-lg border border-rim text-muted hover:bg-elevated hover:text-txt transition-colors"
            >
              {t("calendar.today") as string}
            </button>
            <button
              onClick={() => navigate(1)}
              class="p-1.5 rounded-lg border border-rim text-muted hover:bg-elevated hover:text-txt transition-colors"
              aria-label="Next"
            >
              <MdFillChevron_right size={18} />
            </button>
          </div>
        </Show>
 
        {/* View switcher */}
        <div class="flex rounded-lg border border-rim overflow-hidden shrink-0">
          {VIEWS.map(v => (
            <button
              type="button"
              onClick={() => setViewType(v.key)}
              class={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewType() === v.key
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:bg-elevated hover:text-txt"
              }`}
            >
              {v.label()}
            </button>
          ))}
        </div>

        {/* New event */}
        <Show when={canCreate()}>
          <button
            type="button"
            onClick={() => setShowCreator(true)}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                   bg-accent text-accent-fg hover:opacity-90 transition-opacity"
          >
            <MdOutlineAdd class="w-3.5 h-3.5" />
            {t("calendar.new_event")}
          </button>
        </Show>
     </div>

      {/* Category filter — only when the loaded range actually has categories */}
      <Show when={allCategories().length > 0}>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-xs text-muted mr-0.5">{t("calendar.categories_label")}</span>
          <For each={allCategories()}>
            {(cat) => (
              <button
                type="button"
                aria-pressed={catFilter() === cat}
                onClick={() => setCatFilter((c) => (c === cat ? null : cat))}
                class={`px-2 py-0.5 rounded text-xs transition-colors ${
                  catFilter() === cat
                    ? "bg-accent text-accent-fg"
                    : "bg-elevated text-txt hover:opacity-80"
                }`}
              >
                {cat}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* View content */}
      <div class="flex-1 min-h-0 overflow-auto">
        <Show when={viewType() === "month"}>
          <MonthView
            year={anchor().getFullYear()}
            month={anchor().getMonth() + 1}
            events={visibleEvents()}
            onDayClick={handleDayClick}
          />
        </Show>
        <Show when={viewType() === "week"}>
          <WeekView
            anchor={anchor()}
            events={visibleEvents()}
            onDayClick={handleDayClick}
          />
        </Show>
        <Show when={viewType() === "day"}>
          <DayView
            date={anchor()}
            events={visibleEvents()}
            onDayClick={handleDayClick}
          />
        </Show>
        <Show when={viewType() === "list"}>
          <ListView events={visibleEvents()} />
        </Show>
      </div>

      <Show when={showModal() && activeDay()}>
        <DayDetailModal
          date={activeDay()!}
          events={activeDayEvs()}
          onClose={() => { setShowModal(false); setActiveDay(null); }}
          onEventCreated={refreshCurrent}
          onEventEdited={refreshCurrent}
          onEventDeleted={refreshCurrent}
        />
      </Show>

      <Show when={showCreator()}>
        <EventCreatorModal
          onClose={() => setShowCreator(false)}
          onCreated={() => { setShowCreator(false); refreshCurrent(); }}
        />
      </Show>
    </div>
  );
}
