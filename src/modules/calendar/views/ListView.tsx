import { For, Show, createMemo, createSignal } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillLocation_on, MdFillOpen_in_new, MdOutlineCalendar_today } from "solid-icons/md";
import DOMPurify from "dompurify";
import type { CalEvent } from "../api";
import { isoDateStr, localDay, fmtEventRange } from "./calUtils";
import CategoryChips from "./CategoryChips";
import { bbcodeDisplay } from "@utsukta/spa-core/lib/renderBody";
import { Motion, slideDown } from "@/shared/views/anim";

interface Props {
  events: CalEvent[];
}

function fmtDateHeader(dateStr: string, locale: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function ListView(props: Props) {
  const { t, locale } = useI18n();
  const [expandedId, setExpandedId] = createSignal<number | null>(null);

  const todayStr = isoDateStr(new Date());

  const grouped = createMemo(() => {
    const map = new Map<string, CalEvent[]>();
    const sorted = [...props.events].sort((a, b) => a.start.localeCompare(b.start));
    for (const ev of sorted) {
      const day = ev.allDay ? ev.start.slice(0, 10) : localDay(ev.start);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(ev);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  return (
    <div class="space-y-6">
      <Show
        when={grouped().length > 0}
        fallback={
          <div class="flex flex-col items-center py-16 text-center gap-3">
            <MdOutlineCalendar_today class="w-10 h-10 text-muted/40" />
            <p class="text-sm text-muted">{t("calendar.no_upcoming_events")}</p>
          </div>
        }
      >
        <For each={grouped()}>
          {([dateStr, evs]) => (
            <section>
              <h3 class={`sticky top-0 z-10 bg-base px-3 py-1.5 text-sm font-semibold ${
                dateStr === todayStr ? "text-accent-txt" : dateStr < todayStr ? "text-muted" : "text-txt"
              }`}>
                {dateStr === todayStr ? `${t("calendar.today")}, ` : ""}{fmtDateHeader(dateStr, locale())}
              </h3>

              <div class="space-y-0.5">
                <For each={evs}>
                  {(ev) => {
                    const isPast = new Date(ev.end ?? ev.start).getTime() < Date.now();
                    const open = () => expandedId() === ev.id;
                    return (
                      <div class={`rounded-xl transition-colors ${open() ? "bg-elevated/60" : "hover:bg-elevated/40"}`}>
                        <button
                          type="button"
                          aria-expanded={open()}
                          onClick={() => setExpandedId(p => p === ev.id ? null : ev.id)}
                          class="w-full text-left px-3 py-2 flex items-start gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          <span
                            class="mt-1.5 w-2 h-2 rounded-full shrink-0 bg-accent"
                            style={ev.calendarColor ? { background: ev.calendarColor } : undefined}
                          />
                          <span class="min-w-0 flex-1">
                            <span class={`block text-sm font-medium truncate ${isPast ? "text-muted" : open() ? "text-accent-txt" : "text-txt"}`}>
                              {ev.title || t("calendar.no_title")}
                            </span>
                            <span class="block text-xs text-muted mt-0.5 tabular-nums">
                              {fmtEventRange(ev, locale(), t("calendar.all_day"))}
                            </span>
                            <Show when={ev.location}>
                              <span class="flex items-center gap-1 text-xs text-muted mt-0.5">
                                <MdFillLocation_on size={12} class="shrink-0" />
                                <span class="truncate">{ev.location}</span>
                              </span>
                            </Show>
                          </span>
                        </button>

                        <Show when={open()}>
                          <EventDetailPanel event={ev} />
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            </section>
          )}
        </For>
      </Show>
    </div>
  );
}

function EventDetailPanel(props: { event: CalEvent }) {
  const ev = props.event;
  const { t } = useI18n();
  const sanitized = () => ev.description ? DOMPurify.sanitize(bbcodeDisplay(ev.description)) : "";

  return (
    <Motion.div {...slideDown} class="pl-8 pr-3 pb-3 space-y-2">
      <Show when={sanitized()}>
        <div class="text-sm text-txt leading-relaxed prose prose-sm max-w-prose" innerHTML={sanitized()} />
      </Show>
      <CategoryChips categories={ev.categories} />
      <Show when={ev.plink}>
        <a
          href={ev.plink}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-xs text-accent-txt hover:underline"
        >
          <MdFillOpen_in_new size={12} />
          {t("calendar.view_source")}
        </a>
      </Show>
    </Motion.div>
  );
}
