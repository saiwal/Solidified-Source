// Card showcase (config: { uuid }): renders one card through the real CardFace
// rather than a text teaser, so it keeps the template-specific layout it has on
// the board. multiInstance.

import { Errored, Loading, Show } from "solid-js";
import { useAsyncQuery } from "@utsukta/spa-core/lib/query";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchCard } from "../api";
import CardFace from "../components/CardFace";
import { Card } from "@ui/Card";

function EditHint(props: { text: string }) {
  return (
    <Show when={editingWidgets()}>
      <Card class="px-4 py-3">
        <p class="text-xs text-muted">{props.text}</p>
      </Card>
    </Show>
  );
}

export default function CardShowcaseWidget(props: WidgetProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const uuid = () => String(props.config?.uuid ?? "");

  const q = useAsyncQuery(() => ({
    queryKey: ["card-showcase", { nick: nick(), uuid: uuid() }],
    queryFn: async ({ queryKey: [, k] }) => { const { nick, uuid } = k as { nick: string; uuid: string }; return (await fetchCard(nick, uuid)).card; },
    enabled: !!nick() && !!uuid(),
  }));

  return (
    <Show when={uuid()} fallback={<EditHint text={t("widgets.not_configured")} />}>
      <Errored fallback={<EditHint text={t("widgets.item_unavailable")} />}>
      <Loading fallback={<div class="h-40 w-full bg-surface border border-rim rounded-2xl animate-pulse" />}>
        <Show when={q.data} fallback={<EditHint text={t("widgets.item_unavailable")} />}>
          {(c) => <CardFace card={c()} nick={nick()} />}
        </Show>
      </Loading>
      </Errored>
    </Show>
  );
}
