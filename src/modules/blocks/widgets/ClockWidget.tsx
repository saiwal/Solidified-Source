// World clock / countdown card (config: { mode, label?, timezone?, target?, zones? }).
// mode "clock" shows the current time in a chosen timezone; mode "countdown"
// counts down to a target date; mode "world" lists several timezones at once.
// Pure client-side.

import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Card } from "@ui/Card";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

interface Zone {
  label?: string;
  timezone: string;
}

export default function ClockWidget(props: WidgetProps) {
  const { t } = useI18n();
  const mode = () => {
    const m = props.config?.mode;
    return m === "countdown" || m === "world" ? m : "clock";
  };
  const label = () => String(props.config?.label ?? "");
  const timezone = () => String(props.config?.timezone ?? "");
  const target = () => String(props.config?.target ?? "");
  const zones = (): Zone[] =>
    Array.isArray(props.config?.zones)
      ? (props.config!.zones as unknown[])
          .filter((z): z is Zone => !!z && typeof z === "object" && !!(z as Zone).timezone)
          .slice(0, 5)
      : [];

  const configured = () => {
    if (mode() === "countdown") return !!target();
    if (mode() === "world") return zones().length > 0;
    return !!timezone();
  };

  const zoneTime = (tz: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
      }).format(now());
    } catch {
      return "";
    }
  };

  const zoneDayOffset = (tz: string) => {
    try {
      const here = new Intl.DateTimeFormat("en-CA", { timeZone: undefined }).format(now());
      const there = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now());
      return here === there ? "" : there > here ? "+1" : "-1";
    } catch {
      return "";
    }
  };

  const [now, setNow] = createSignal(Date.now());
  onMount(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(id));
  });

  const clockTime = () => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: timezone(),
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(now());
    } catch {
      return ""; // unknown timezone id
    }
  };

  const clockDate = () => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: timezone(),
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(now());
    } catch {
      return "";
    }
  };

  const remainingMs = () => new Date(target()).getTime() - now();

  const countdownText = () => {
    const ms = remainingMs();
    if (isNaN(ms)) return "";
    if (ms <= 0) return t("widgets.countdown_reached");
    const s = Math.floor(ms / 1000);
    const days = Math.floor(s / 86400);
    const hms = `${pad2(Math.floor((s % 86400) / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
    return days > 0 ? `${days}d ${hms}` : hms;
  };

  return (
    <Show
      when={configured()}
      fallback={
        <Show when={editingWidgets()}>
          <Card class="px-4 py-3">
            <p class="text-xs text-muted">{t("widgets.not_configured")}</p>
          </Card>
        </Show>
      }
    >
      <div
        class="bg-surface border border-rim rounded-xl px-4 py-4"
        classList={{ "text-center": mode() !== "world" }}
      >
        <Show when={label()}>
          <p class="text-xs font-medium text-muted mb-1 truncate">{label()}</p>
        </Show>

        <Show when={mode() === "clock"}>
          <p class="text-2xl font-semibold text-txt tabular-nums">{clockTime()}</p>
          <p class="text-xs text-muted mt-1">
            {clockDate()} · {timezone().split("/").pop()?.replace(/_/g, " ")}
          </p>
        </Show>

        <Show when={mode() === "countdown"}>
          <p
            class="text-2xl font-semibold tabular-nums"
            classList={{
              "text-accent": remainingMs() <= 0,
              "text-txt": remainingMs() > 0,
            }}
          >
            {countdownText()}
          </p>
        </Show>

        <Show when={mode() === "world"}>
          <ul class="divide-y divide-rim -mx-4 -mb-4 mt-1">
            <For each={zones()}>
              {(zone) => (
                <li class="flex items-baseline justify-between px-4 py-2">
                  <span class="text-sm text-txt truncate">
                    {zone.label || zone.timezone.split("/").pop()?.replace(/_/g, " ")}
                  </span>
                  <span class="text-sm font-semibold tabular-nums text-txt">
                    {zoneTime(zone.timezone)}
                    <Show when={zoneDayOffset(zone.timezone)}>
                      <sup class="ml-0.5 text-[0.625rem] text-muted">{zoneDayOffset(zone.timezone)}</sup>
                    </Show>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </Show>
  );
}
