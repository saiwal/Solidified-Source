// Settings form for ClockWidget instances: clock (label + timezone) or
// countdown (label + target datetime).

import { createSignal, For, Show } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Input, Select } from "@ui/Field";

function timezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "America/New_York", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];
  }
}

const inputClass =
  "mt-1 w-full bg-elevated border border-rim rounded-lg px-2 py-1.5 text-xs text-txt";

const MAX_ZONES = 5;

interface ZoneRow {
  label: string;
  timezone: string;
}

function initialZones(config: Record<string, unknown>): ZoneRow[] {
  const raw = Array.isArray(config.zones) ? config.zones : [];
  const rows = raw
    .filter((z): z is Record<string, unknown> => !!z && typeof z === "object")
    .map((z) => ({ label: String(z.label ?? ""), timezone: String(z.timezone ?? "") }))
    .slice(0, MAX_ZONES);
  return rows.length ? rows : [{ label: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }];
}

export default function ClockConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const initialMode = props.config.mode === "countdown" || props.config.mode === "world"
    ? props.config.mode
    : "clock";
  const [mode, setMode] = createSignal<string>(initialMode);
  const [label, setLabel] = createSignal(String(props.config.label ?? ""));
  const [timezone, setTimezone] = createSignal(
    String(props.config.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [target, setTarget] = createSignal(String(props.config.target ?? ""));
  const [zones, setZones] = createSignal<ZoneRow[]>(initialZones(props.config));

  const updateZone = (i: number, patch: Partial<ZoneRow>) =>
    setZones((prev) => prev.map((z, idx) => (idx === i ? { ...z, ...patch } : z)));
  const addZone = () =>
    setZones((prev) =>
      prev.length >= MAX_ZONES
        ? prev
        : [...prev, { label: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }],
    );
  const removeZone = (i: number) => setZones((prev) => prev.filter((_, idx) => idx !== i));

  const valid = () => {
    if (mode() === "countdown") return !isNaN(new Date(target()).getTime());
    if (mode() === "world") return zones().some((z) => !!z.timezone);
    return !!timezone();
  };

  const save = () => {
    const config: Record<string, unknown> = { mode: mode() };
    if (label().trim()) config.label = label().trim();
    if (mode() === "clock") config.timezone = timezone();
    else if (mode() === "countdown") config.target = target();
    else
      config.zones = zones()
        .filter((z) => !!z.timezone)
        .map((z) => (z.label.trim() ? { label: z.label.trim(), timezone: z.timezone } : { timezone: z.timezone }));
    props.onSave(config);
  };

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_mode")}
        <Select size="sm" class="mt-1 w-full" value={mode()} onChange={(e) => setMode(e.currentTarget.value)}>
          <option value="clock">{t("widgets.clock_mode_clock")}</option>
          <option value="countdown">{t("widgets.clock_mode_countdown")}</option>
          <option value="world">{t("widgets.clock_mode_world")}</option>
        </Select>
      </label>

      <Show when={mode() !== "world"}>
        <label class="text-xs text-muted">
          {t("widgets.cfg_label")}
          <Input
            size="sm"
            class="mt-1 w-full"
            type="text"
            value={label()}
            maxLength={60}
            onInput={(e) => setLabel(e.currentTarget.value)}
          />
        </label>
      </Show>

      <Show when={mode() === "clock"}>
        <label class="text-xs text-muted">
          {t("widgets.cfg_timezone")}
          <Select
            size="sm"
            class="mt-1 w-full"
            value={timezone()}
            onChange={(e) => setTimezone(e.currentTarget.value)}
          >
            <For each={timezones()}>{(tz) => <option value={tz}>{tz}</option>}</For>
          </Select>
        </label>
      </Show>

      <Show when={mode() === "countdown"}>
        <label class="text-xs text-muted">
          {t("widgets.cfg_target")}
          <Input
            size="sm"
            class="mt-1 w-full"
            type="datetime-local"
            value={target()}
            onInput={(e) => setTarget(e.currentTarget.value)}
          />
        </label>
      </Show>

      <Show when={mode() === "world"}>
        <div class="flex flex-col gap-2">
          <For each={zones()}>
            {(zone, i) => (
              <div class="flex items-center gap-1.5">
                <input
                  type="text"
                  value={zone.label}
                  maxLength={30}
                  placeholder={zone.timezone.split("/").pop()?.replace(/_/g, " ") || t("widgets.cfg_zone_label")}
                  onInput={(e) => updateZone(i(), { label: e.currentTarget.value })}
                  class={inputClass + " flex-1"}
                />
                <select
                  value={zone.timezone}
                  onChange={(e) => updateZone(i(), { timezone: e.currentTarget.value })}
                  class={inputClass + " flex-1"}
                >
                  <For each={timezones()}>{(tz) => <option value={tz}>{tz}</option>}</For>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeZone(i())}
                  disabled={zones().length <= 1}
                  aria-label={t("widgets.remove_widget")}
                >
                  ✕
                </Button>
              </div>
            )}
          </For>
          <button
            onClick={addZone}
            disabled={zones().length >= MAX_ZONES}
            class="self-start text-xs text-accent hover:underline disabled:opacity-40 disabled:no-underline"
          >
            + {t("widgets.cfg_add_zone")}
          </button>
        </div>
      </Show>

      <Button size="sm" class="self-end" onClick={save} disabled={!valid()}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
