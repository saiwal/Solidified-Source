// Settings form for HqMessagesWidget: which tab the card opens on.

import { createSignal, For } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { TABS, type Tab } from "./MessageTabs";
import { Button } from "@ui/Button";
import { Select } from "@ui/Field";

export default function HqMessagesConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const [tab, setTab] = createSignal(String(props.config.tab ?? ""));

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_default_tab")}
        <Select size="sm" class="mt-1 w-full" value={tab()} onChange={(e) => setTab(e.currentTarget.value)}>
          <For each={TABS}>
            {(tb) => <option value={tb.id}>{t(tb.key as "hq.msg_tab_all")}</option>}
          </For>
        </Select>
      </label>
      <Button size="sm" class="self-end" onClick={() => props.onSave({ tab: tab() as Tab })}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
