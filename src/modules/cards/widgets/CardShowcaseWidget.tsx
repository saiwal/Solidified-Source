// Card showcase (config: { uuid }): renders one card as the real flip
// component rather than a text teaser — the point of a card is its two
// faces, so a showcase that flattened it would lose what it is. multiInstance.

import { Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchCard } from "../api";
import CardFace from "../components/CardFace";

function EditHint(props: { text: string }) {
  return (
    <Show when={editingWidgets()}>
      <div class="bg-surface border border-rim rounded-xl px-4 py-3">
        <p class="text-xs text-muted">{props.text}</p>
      </div>
    </Show>
  );
}

export default function CardShowcaseWidget(props: WidgetProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const uuid = () => String(props.config?.uuid ?? "");

  const [card] = createQueryResource(
    "card-showcase",
    () => (nick() && uuid() ? { nick: nick(), uuid: uuid() } : null),
    async (p) => (await fetchCard(p.nick, p.uuid)).card,
  );

  return (
    <Show when={uuid()} fallback={<EditHint text={t("widgets.not_configured")} />}>
      <Show when={card.loading}>
        <div class="h-64 w-full bg-surface border border-rim rounded-2xl animate-pulse" />
      </Show>

      <Show when={!card.loading}>
        <Show when={card()} fallback={<EditHint text={t("widgets.item_unavailable")} />}>
          {(c) => <CardFace card={c()} nick={nick()} />}
        </Show>
      </Show>
    </Show>
  );
}
