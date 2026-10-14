// Event card (config: { uri }): one upcoming event with date, time, and
// location. multiInstance. Events outside the calendar feed's upcoming
// window (e.g. past events) show the unavailable hint in edit mode.

import { Show } from "solid-js";
import { A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillEvent } from "solid-icons/md";
import { fetchEvents, type CalEvent } from "../api";

function eventDate(ev: CalEvent, locale: string): string {
  const d = new Date(ev.start);
  if (isNaN(d.getTime())) return ev.start;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(ev.allDay ? {} : { timeStyle: "short" }),
  }).format(d);
}

function EditHint(props: { text: string }) {
  return (
    <Show when={editingWidgets()}>
      <div class="bg-surface border border-rim rounded-xl px-4 py-3">
        <p class="text-xs text-muted">{props.text}</p>
      </div>
    </Show>
  );
}

export default function EventCardWidget(props: WidgetProps) {
  const { t, locale } = useI18n();
  const nick = usePageNick();
  const uri = () => String(props.config?.uri ?? "");

  const [event] = createQueryResource(
    "calendar-event",
    () => (nick() && uri() ? { nick: nick(), uri: uri() } : null),
    async (p) => {
      const events = await fetchEvents(p.nick);
      return events.find((e) => e.uri === p.uri) ?? null;
    },
  );

  return (
    <Show when={uri()} fallback={<EditHint text={t("widgets.not_configured")} />}>
      <Show when={event.loading}>
        <div class="bg-surface border border-rim rounded-xl p-4 space-y-2 animate-pulse">
          <div class="h-3 bg-elevated rounded w-2/3" />
          <div class="h-3 bg-elevated rounded w-1/2" />
        </div>
      </Show>

      <Show when={!event.loading}>
        <Show when={event()} fallback={<EditHint text={t("widgets.item_unavailable")} />}>
          {(ev) => (
            <div class="bg-surface border border-rim rounded-xl overflow-hidden">
              <div class="px-4 py-3 flex items-start gap-2">
                <MdFillEvent size={18} class="text-accent-txt shrink-0 mt-0.5" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-txt">{ev().title}</p>
                  <p class="text-xs text-muted mt-0.5">{eventDate(ev(), locale())}</p>
                  <Show when={ev().location}>
                    <p class="text-xs text-muted mt-0.5 truncate">{ev().location}</p>
                  </Show>
                </div>
              </div>
              <A
                href={`/cal/${nick()}`}
                class="block px-4 py-2 border-t border-rim text-center text-xs font-medium
                       text-accent-txt hover:bg-elevated transition-colors"
              >
                {t("widgets.view_calendar")}
              </A>
            </div>
          )}
        </Show>
      </Show>
    </Show>
  );
}
