import { Show } from "solid-js";
import CategoryWidget from "@/shared/stream/components/CategoryWidget";
import CategoryCloudWidget from "@/shared/stream/components/CategoryCloudWidget";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useSearchParams } from "@solidjs/router";

export default function ChannelCategoryWidget(props: WidgetProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSlug = () => String(searchParams.cat ?? "");

  const onCategoryClick = (slug: string) => {
    setSearchParams({ cat: activeSlug() === slug ? undefined : slug, tag: undefined });
  };

  const shared = () => ({
    channelNick: usePageNick()(),
    type: "posts" as const,
    activeSlug: activeSlug(),
    onCategoryClick,
    rainbow: props.config?.rainbow === true,
  });

  return (
    <Show when={props.config?.style === "cloud"} fallback={<CategoryWidget {...shared()} />}>
      <CategoryCloudWidget {...shared()} />
    </Show>
  );
}
