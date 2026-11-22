// Settings form for CardShowcaseWidget instances: pick one of the channel's
// cards.

import { createSignal, For, Loading } from "solid-js";
import { useAsyncQuery } from "@utsukta/spa-core/lib/query";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchCards } from "../api";
import { Button } from "@ui/Button";
import { Select } from "@ui/Field";

export default function CardShowcaseConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const [uuid, setUuid] = createSignal(String(props.config.uuid ?? ""));

  const q = useAsyncQuery(() => ({
    queryKey: ["cards-list", nick()],
    queryFn: async ({ queryKey: [, n] }) => (await fetchCards(n as string)).cards,
    enabled: !!nick(),
  }));

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_card")}
        <Select size="sm" class="mt-1 w-full" value={uuid()} onChange={(e) => setUuid(e.currentTarget.value)}>
          <option value="">—</option>
          <Loading>
            <For each={q.data}>
              {(a) => <option value={a.uuid}>{a.title || a.created.slice(0, 10)}</option>}
            </For>
          </Loading>
        </Select>
      </label>
      <Button size="sm" class="self-end" onClick={() => props.onSave({ uuid: uuid() })} disabled={!uuid()}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
