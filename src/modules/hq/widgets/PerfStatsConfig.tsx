// Settings form for PerfStatsWidget: how the sparklines are drawn.

import { createSignal, For } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Select } from "@ui/Field";

export const PLOT_STYLES = ["area", "line", "step", "bars", "dots"] as const;
export type PlotStyle = (typeof PLOT_STYLES)[number];

export default function PerfStatsConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const [style, setStyle] = createSignal(String(props.config.style ?? "area"));

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_plot_style")}
        <Select size="sm" class="mt-1 w-full" value={style()} onChange={(e) => setStyle(e.currentTarget.value)}>
          <For each={PLOT_STYLES}>
            {(s) => <option value={s}>{t(`widgets.plot_${s}` as "widgets.plot_area")}</option>}
          </For>
        </Select>
      </label>
      <Button size="sm" class="self-end" onClick={() => props.onSave({ style: style() })}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
