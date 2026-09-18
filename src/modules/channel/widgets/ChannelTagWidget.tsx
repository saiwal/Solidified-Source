import { Show } from "solid-js";
import TagWidget from "@/shared/stream/components/TagWidget";
import TagListWidget from "@/shared/stream/components/TagListWidget";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useSearchParams } from "@solidjs/router";

export default function ChannelTagWidget(props: WidgetProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = () => String(searchParams.tag ?? "");

  const onTagClick = (tag: string) => {
    setSearchParams({ tag: activeTag() === tag ? undefined : tag, cat: undefined });
  };

  const shared = () => ({
    channelNick: usePageNick()(),
    type: "posts" as const,
    activeTag: activeTag(),
    onTagClick,
    rainbow: props.config?.rainbow === true,
  });

  return (
    <Show when={props.config?.style === "list"} fallback={<TagWidget {...shared()} />}>
      <TagListWidget {...shared()} />
    </Show>
  );
}
