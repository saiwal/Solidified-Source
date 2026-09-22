import { createSignal, For, Show, onMount } from "solid-js";
import { toast } from "@utsukta/spa-core/store/toast";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import { fetchEvents, type CalEvent } from "@/modules/calendar/api";
import { openEvent } from "@/shared/views/modal-host";
import DayDetailModal from "@/modules/calendar/views/DayDetailModal";
import { localDay, todayKey } from "@/modules/calendar/views/calUtils";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineAdd, MdOutlineCalendar_today } from "solid-icons/md";

function next30DaysRange() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 30);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short" });
}

function fmtDay(iso: string) {
  return new Date(iso).getDate();
}

function fmtTime(iso: string, allDay: boolean, allDayLabel: string) {
  if (allDay) return allDayLabel;
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

const SkeletonRow = () => (
  <div class="px-3.5 py-2.5 flex items-center gap-2.5 animate-pulse">
    <div class="w-8 h-9 rounded-lg bg-overlay shrink-0" />
    <div class="flex-1 space-y-2">
      <div class="h-3 bg-overlay rounded w-3/5" />
      <div class="h-3 bg-overlay rounded w-2/5" />
    </div>
  </div>
);

export default function UpcomingEventsWidget() {
  const { t } = useI18n();
  const [events, setEvents] = createSignal<CalEvent[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [activeEvent, setActiveEvent] = createSignal<CalEvent | null>(null);

  async function load() {
    const nick = currentNick();
    if (!nick) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEvents(nick, next30DaysRange());
      setEvents(data.slice(0, 8));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load events";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  onMount(load);

  return (
    <>
      <div data-tour="hq.events" class="bg-surface border border-rim rounded-2xl shadow-sm flex flex-col overflow-hidden">

        {/* Header */}
        <div class="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between shrink-0">
          <span class="text-xs font-medium uppercase tracking-wider text-muted">
            {t("hq.upcoming_events")}
          </span>
          <button
            type="button"
            onClick={() => openEvent({ onCreated: load })}
            class="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
                   bg-accent text-accent-fg hover:opacity-90 transition-opacity"
          >
            <MdOutlineAdd class="w-3 h-3" />
            {t("hq.new_event")}
          </button>
        </div>

        {/* Body */}
        <div class="flex flex-col">
          <Show when={loading()}>
            <For each={[1, 2, 3]}>{() => <SkeletonRow />}</For>
          </Show>

          <Show when={!loading() && error()}>
            <div class="px-4 py-4 text-center">
              <button onClick={load} class="text-xs text-accent hover:underline">{t("hq.retry")}</button>
            </div>
          </Show>

          <Show when={!loading() && !error() && events().length === 0}>
            <div class="px-4 py-6 flex flex-col items-center gap-2 text-muted">
              <MdOutlineCalendar_today class="w-7 h-7 opacity-30" />
              <span class="text-xs">{t("hq.no_upcoming_events")}</span>
              <button
                type="button"
                onClick={() => openEvent({ onCreated: load })}
                class="text-xs text-accent hover:underline mt-1"
              >
                {t("hq.create_one")}
              </button>
            </div>
          </Show>

          <For each={events()}>
            {(ev, i) => {
              // Evaluated at render — the widget reloads on mount and after
              // create/edit/delete, so no ticking clock.
              const isPast = new Date(ev.end ?? ev.start).getTime() < Date.now();
              const isToday = !isPast && localDay(ev.start) === todayKey();
              return (
              <div
                role="button"
                tabindex="0"
                onClick={() => setActiveEvent(ev)}
                onKeyDown={(e) => e.key === "Enter" && setActiveEvent(ev)}
                class={`px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-elevated transition-colors cursor-pointer
                  ${i() < events().length - 1 ? "border-b border-rim" : ""}
                  ${isPast ? "opacity-50" : ""} ${isToday ? "bg-accent-muted/25" : ""}`}
              >
                {/* Date badge — colored when from a CalDAV calendar */}
                <div
                  class="shrink-0 flex flex-col items-center justify-center w-8 h-9 rounded-lg"
                  style={ev.calendarColor
                    ? { background: ev.calendarColor + "22", color: ev.calendarColor }
                    : undefined}
                  classList={{ "bg-accent-muted": !ev.calendarColor }}
                >
                  <span
                    class="text-[0.5625rem] font-bold uppercase tracking-wide leading-none"
                    classList={{ "text-accent": !ev.calendarColor }}
                  >
                    {fmtMonth(ev.start)}
                  </span>
                  <span
                    class="text-sm font-bold leading-tight"
                    classList={{ "text-accent": !ev.calendarColor }}
                  >
                    {fmtDay(ev.start)}
                  </span>
                </div>

                {/* Info */}
                <div class="flex-1 min-w-0">
                  <p
                    class="text-sm font-medium truncate leading-snug"
                    classList={{ "text-txt": !isPast, "text-muted": isPast }}
                  >
                    {ev.title || "(no title)"}
                  </p>
                  <p class="text-xs text-muted mt-0.5 truncate">
                    <Show when={isToday}>
                      <span class="text-[0.625rem] font-semibold uppercase tracking-wide text-accent mr-1.5">
                        {t("calendar.today")}
                      </span>
                    </Show>
                    {fmtTime(ev.start, ev.allDay, t("hq.all_day"))}
                    <Show when={ev.location}>
                      <span class="mx-1 opacity-40">·</span>
                      {ev.location}
                    </Show>
                  </p>
                </div>
              </div>
              );
            }}
          </For>
        </div>
      </div>

      <Show when={activeEvent()}>
        {(ev) => (
          <DayDetailModal
            date={ev().start.slice(0, 10)}
            events={[ev()]}
            onClose={() => setActiveEvent(null)}
            onEventEdited={load}
            onEventDeleted={() => {
              setActiveEvent(null);
              load();
            }}
          />
        )}
      </Show>
    </>
  );
}
