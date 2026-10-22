// Settings form for WeatherWidget instances: place name + temperature unit.

import { createSignal } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Input, Select } from "@ui/Field";

export default function WeatherConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const [location, setLocation] = createSignal(String(props.config.location ?? ""));
  const [unit, setUnit] = createSignal(props.config.unit === "f" ? "f" : "c");

  const valid = () => location().trim().length > 0;

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_location")}
        <Input
          size="sm"
          class="mt-1 w-full"
          type="text"
          value={location()}
          maxLength={100}
          placeholder="Berlin, Germany"
          onInput={(e) => setLocation(e.currentTarget.value)}
        />
      </label>
      <label class="text-xs text-muted">
        {t("widgets.cfg_unit")}
        <Select size="sm" class="mt-1 w-full" value={unit()} onChange={(e) => setUnit(e.currentTarget.value)}>
          <option value="c">{t("widgets.unit_celsius")}</option>
          <option value="f">{t("widgets.unit_fahrenheit")}</option>
        </Select>
      </label>
      <Button
        size="sm"
        class="self-end"
        onClick={() => props.onSave({ location: location().trim(), unit: unit() })}
        disabled={!valid()}
      >
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
