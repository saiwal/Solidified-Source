import { For, Show, createMemo, createSignal } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillLocation_on, MdFillOpen_in_new } from "solid-icons/md";
import DOMPurify from "dompurify";
import type { CalEvent } from "../api";
import { isoDateStr, localDay, fmtEventRange } from "./calUtils";
import CategoryChips from "./CategoryChips";
import { bbcodeDisplay } from "@utsukta/spa-core/lib/renderBody";

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
    <div class="space-y-5">
      <Show
        when={grouped().length > 0}
        fallback={
          <div class="flex flex-col items-center py-16 text-center gap-2">
            <svg class="w-10 h-10 text-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p class="text-sm text-muted">{t("calendar.no_upcoming_events")}</p>
          </div>
        }
      >
        <For each={grouped()}>
          {([dateStr, evs]) => (
            <div>
              <div class="flex items-center gap-2 mb-2 sticky top-0 bg-base py-1 z-10">
                <span class={`text-sm font-semibold shrink-0 ${
                  dateStr === todayStr ? "text-accent" : dateStr < todayStr ? "text-muted" : "text-txt"
                }`}>
                  {fmtDateHeader(dateStr, locale())}
                </span>
                <Show when={dateStr === todayStr}>
                  <span class="text-xs font-medium px-1.5 py-0.5 rounded-full bg-accent text-accent-fg shrink-0">
                    {t("calendar.today")}
                  </span>
                </Show>
                <div class="flex-1 border-t border-rim" />
              </div>

              <div class="space-y-1.5 pl-2">
                <For each={evs}>
                  {(ev) => {
                    const isPast = new Date(ev.end ?? ev.start).getTime() < Date.now();
                    return (
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedId(p => p === ev.id ? null : ev.id)}
                        class={`w-full text-left rounded-xl border p-3 transition-colors flex items-start gap-3
                          ${expandedId() === ev.id
                            ? "border-accent bg-accent-muted"
                            : "border-rim bg-surface hover:bg-elevated hover:border-rim-strong"}
                          ${isPast && expandedId() !== ev.id ? "opacity-50" : ""}`}
                      >
                        <Show when={ev.calendarColor}>
                          <span
                            class="w-1 self-stretch rounded-full shrink-0"
                            style={{ background: ev.calendarColor }}
                          />
                        </Show>
                        <div class="min-w-0 flex-1">
                          <p
                            class="text-sm font-medium leading-snug truncate"
                            classList={{ "text-txt": !isPast, "text-muted": isPast }}
                          >
                            {ev.title || t("calendar.no_title")}
                          </p>
                          <p class="text-xs text-muted mt-0.5">
                            {fmtEventRange(ev, locale(), t("calendar.all_day"))}
                          </p>
                          <Show when={ev.location}>
                            <p class="flex items-center gap-1 text-xs text-muted mt-0.5">
                              <MdFillLocation_on size={12} />
                              {ev.location}
                            </p>
                          </Show>
                        </div>
                      </button>

                      <Show when={expandedId() === ev.id}>
                        <EventDetailPanel event={ev} />
                      </Show>
                    </div>
                    );
                  }}
                </For>
              </div>
            </div>
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
    <div class="mt-1 ml-5 bg-base border border-rim/60 rounded-xl p-3.5 space-y-2">
      <Show when={sanitized()}>
        <div
          class="text-sm text-txt leading-relaxed prose prose-sm max-w-none"
          innerHTML={sanitized()}
        />
      </Show>
      <CategoryChips categories={ev.categories} />
      <Show when={ev.plink}>
        <a
          href={ev.plink}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <MdFillOpen_in_new size={12} />
          {t("calendar.view_source")}
        </a>
      </Show>
    </div>
  );
}
