// Settings form for EventCardWidget instances: pick one of the channel's
// upcoming events (default feed window).

import { createSignal, For } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchEvents } from "../api";
import { Button } from "@ui/Button";
import { Select } from "@ui/Field";

export default function EventCardConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const [uri, setUri] = createSignal(String(props.config.uri ?? ""));

  const [events] = createQueryResource("calendar-events", () => nick() || null, (n) => fetchEvents(n));

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_event")}
        <Select size="sm" class="mt-1 w-full" value={uri()} onChange={(e) => setUri(e.currentTarget.value)}>
          <option value="">—</option>
          <For each={events() ?? []}>
            {(ev) => (
              <option value={ev.uri}>
                {ev.title || t("widgets.cfg_event")} — {ev.start.slice(0, 10)}
              </option>
            )}
          </For>
        </Select>
      </label>
      <Button size="sm" class="self-end" onClick={() => props.onSave({ uri: uri() })} disabled={!uri()}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
