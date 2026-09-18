import { Show } from "solid-js";
import TagWidget from "@/shared/stream/components/TagWidget";
import TagListWidget from "@/shared/stream/components/TagListWidget";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { activeTag, setCardFilter } from "../store";

export default function CardTagWidget(props: WidgetProps) {
  const { t } = useI18n();

  const shared = () => ({
    channelNick: usePageNick()(),
    type: "cards" as const,
    title: t("widgets.card_tags"),
    activeTag: activeTag(),
    onTagClick: (tag: string) => setCardFilter("tag", tag),
    rainbow: props.config?.rainbow === true,
  });

  return (
    <Show when={props.config?.style === "list"} fallback={<TagWidget {...shared()} />}>
      <TagListWidget {...shared()} />
    </Show>
  );
}
