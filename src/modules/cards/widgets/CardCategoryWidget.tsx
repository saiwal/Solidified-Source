import { Show } from "solid-js";
import CategoryWidget from "@/shared/stream/components/CategoryWidget";
import CategoryCloudWidget from "@/shared/stream/components/CategoryCloudWidget";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useSearchParams } from "@solidjs/router";

export default function CardCategoryWidget(props: WidgetProps) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = () => String(searchParams.cat ?? "");

  const shared = () => ({
    channelNick: usePageNick()(),
    type: "cards" as const,
    title: t("widgets.card_categories"),
    activeSlug: activeCategory(),
    onCategoryClick: (slug: string) =>
      setSearchParams({ cat: activeCategory() === slug ? undefined : slug, tag: undefined }),
    rainbow: props.config?.rainbow === true,
  });

  return (
    <Show when={props.config?.style === "cloud"} fallback={<CategoryWidget {...shared()} />}>
      <CategoryCloudWidget {...shared()} />
    </Show>
  );
}
