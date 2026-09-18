import { Show } from "solid-js";
import CategoryWidget from "@/shared/stream/components/CategoryWidget";
import CategoryCloudWidget from "@/shared/stream/components/CategoryCloudWidget";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { activeCategory, setCardFilter } from "../store";

export default function CardCategoryWidget(props: WidgetProps) {
  const { t } = useI18n();

  const shared = () => ({
    channelNick: usePageNick()(),
    type: "cards" as const,
    title: t("widgets.card_categories"),
    activeSlug: activeCategory(),
    onCategoryClick: (slug: string) => setCardFilter("cat", slug),
    rainbow: props.config?.rainbow === true,
  });

  return (
    <Show when={props.config?.style === "cloud"} fallback={<CategoryWidget {...shared()} />}>
      <CategoryCloudWidget {...shared()} />
    </Show>
  );
}
