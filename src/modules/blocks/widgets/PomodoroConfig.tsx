// Settings form for PomodoroWidget instances: focus and break durations.

import { createSignal, For } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Select } from "@ui/Field";

const WORK_OPTIONS = [15, 25, 45, 60];
const BREAK_OPTIONS = [5, 10, 15];

export default function PomodoroConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const [work, setWork] = createSignal(Number(props.config.work ?? 25));
  const [brk, setBrk] = createSignal(Number(props.config.break ?? 5));

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_work_min")}
        <Select
          size="sm"
          class="mt-1 w-full"
          value={String(work())}
          onChange={(e) => setWork(Number(e.currentTarget.value))}
        >
          <For each={WORK_OPTIONS}>{(n) => <option value={String(n)}>{n}</option>}</For>
        </Select>
      </label>
      <label class="text-xs text-muted">
        {t("widgets.cfg_break_min")}
        <Select
          size="sm"
          class="mt-1 w-full"
          value={String(brk())}
          onChange={(e) => setBrk(Number(e.currentTarget.value))}
        >
          <For each={BREAK_OPTIONS}>{(n) => <option value={String(n)}>{n}</option>}</For>
        </Select>
      </label>
      <Button size="sm" class="self-end" onClick={() => props.onSave({ work: work(), break: brk() })}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
