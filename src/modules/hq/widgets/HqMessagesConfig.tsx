// Settings form for HqMessagesWidget: which tab the card opens on.

import { createSignal, For } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { TABS, type Tab } from "./MessageTabs";

export default function HqMessagesConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const [tab, setTab] = createSignal(String(props.config.tab ?? ""));

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_default_tab")}
        <select
          value={tab()}
          onChange={(e) => setTab(e.currentTarget.value)}
          class="mt-1 w-full bg-elevated border border-rim rounded-lg px-2 py-1.5 text-xs text-txt"
        >
          <For each={TABS}>
            {(tb) => <option value={tb.id}>{t(tb.key as "hq.msg_tab_all")}</option>}
          </For>
        </select>
      </label>
      <button
        onClick={() => props.onSave({ tab: tab() as Tab })}
        class="self-end px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium
               hover:brightness-110 transition-all"
      >
        {t("widgets.cfg_save")}
      </button>
    </div>
  );
}
