import { Show } from "solid-js";
import TagWidget from "@/shared/stream/components/TagWidget";
import TagListWidget from "@/shared/stream/components/TagListWidget";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useSearchParams } from "@solidjs/router";

export default function ArticleTagWidget(props: WidgetProps) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = () => String(searchParams.tag ?? "");

  const shared = () => ({
    channelNick: usePageNick()(),
    type: "articles" as const,
    title: t("widgets.article_tags"),
    activeTag: activeTag(),
    onTagClick: (tag: string) =>
      setSearchParams({ tag: activeTag() === tag ? undefined : tag, cat: undefined }),
    rainbow: props.config?.rainbow === true,
  });

  return (
    <Show when={props.config?.style === "list"} fallback={<TagWidget {...shared()} />}>
      <TagListWidget {...shared()} />
    </Show>
  );
}
