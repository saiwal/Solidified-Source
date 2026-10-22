// Current-conditions card (config: { location, unit }). Data comes from
// GET /spa/weather, a server-side proxy to Open-Meteo — see Handlers/Weather.php.

import { Show, type Component } from "solid-js";
import {
  WiDaySunny, WiNightClear, WiDayCloudy, WiNightAltCloudy, WiCloudy,
  WiFog, WiDayRain, WiNightAltRain, WiDayShowers, WiNightAltShowers,
  WiDaySnow, WiNightAltSnow, WiDayThunderstorm, WiNightAltThunderstorm, WiNa,
} from "solid-icons/wi";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Card } from "@ui/Card";

interface WeatherData {
  label: string;
  unit: "c" | "f";
  temperature: number;
  windspeed: number;
  weathercode: number;
  is_day: boolean;
  updated: string | null;
}

// Distinguishes "no such place" (404, a real not-found) from anything else
// (network failure, 502 from the geocode/forecast upstream, 500, ...) so the
// widget doesn't tell the user their input was wrong when the real problem
// is e.g. the server couldn't reach the geocoding API.
class WeatherFetchError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function fetchWeather(params: { location: string; unit: string }): Promise<WeatherData> {
  const u = new URL("/spa/weather", window.location.origin);
  u.searchParams.set("place", params.location);
  u.searchParams.set("unit", params.unit);
  const res = await apiFetch(u.pathname + u.search);
  if (!res.ok) throw new WeatherFetchError(res.status);
  const json = await res.json();
  return (json.data ?? json) as WeatherData;
}

// WMO weather interpretation codes → icon (day/night variants).
function iconFor(code: number, isDay: boolean): Component {
  if (code === 0) return isDay ? WiDaySunny : WiNightClear;
  if (code <= 2) return isDay ? WiDayCloudy : WiNightAltCloudy;
  if (code === 3) return WiCloudy;
  if (code === 45 || code === 48) return WiFog;
  if (code >= 51 && code <= 67) return isDay ? WiDayRain : WiNightAltRain;
  if (code >= 80 && code <= 82) return isDay ? WiDayShowers : WiNightAltShowers;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return isDay ? WiDaySnow : WiNightAltSnow;
  if (code >= 95) return isDay ? WiDayThunderstorm : WiNightAltThunderstorm;
  return WiNa;
}

export default function WeatherWidget(props: WidgetProps) {
  const { t } = useI18n();
  const location = () => String(props.config?.location ?? "");
  const unit = () => (props.config?.unit === "f" ? "f" : "c");

  const [weather] = createQueryResource(
    "weather",
    () => (location() ? { location: location(), unit: unit() } : null),
    fetchWeather,
  );

  const icon = () => iconFor(weather()?.weathercode ?? -1, weather()?.is_day ?? true);

  return (
    <Show
      when={location()}
      fallback={
        <Show when={editingWidgets()}>
          <Card class="px-4 py-3">
            <p class="text-xs text-muted">{t("widgets.not_configured")}</p>
          </Card>
        </Show>
      }
    >
      <Card class="px-4 py-4">
        <Show when={weather.loading}>
          <div class="animate-pulse flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-elevated" />
            <div class="h-5 w-16 bg-elevated rounded" />
          </div>
        </Show>

        <Show when={weather.error}>
          <p class="text-xs text-muted">
            {weather.error instanceof WeatherFetchError && weather.error.status === 404
              ? t("widgets.weather_not_found")
              : t("widgets.load_error")}
          </p>
        </Show>

        <Show when={!weather.loading && !weather.error && weather()}>
          <div class="flex items-center gap-3">
            {icon()({ size: 40, class: "text-accent shrink-0" })}
            <div class="flex-1 min-w-0">
              <p class="text-2xl font-semibold text-txt tabular-nums">
                {Math.round(weather()!.temperature)}°{unit() === "f" ? "F" : "C"}
              </p>
              <p class="text-xs text-muted truncate">{weather()!.label}</p>
            </div>
          </div>
          <p class="text-xs text-muted mt-2">
            {t("widgets.wind")}: {Math.round(weather()!.windspeed)} {unit() === "f" ? "mph" : "km/h"}
          </p>
        </Show>
      </Card>
    </Show>
  );
}
