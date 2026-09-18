import { Show } from "solid-js";
import TagWidget from "@/shared/stream/components/TagWidget";
import TagListWidget from "@/shared/stream/components/TagListWidget";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useSearchParams } from "@solidjs/router";

export default function NoteTagWidget(props: WidgetProps) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = () => String(searchParams.tag ?? "");

  const shared = () => ({
    type: "notes" as const,
    title: t("widgets.note_tags"),
    activeTag: activeTag(),
    onTagClick: (tag: string) =>
      setSearchParams({
        tag: activeTag() === tag ? undefined : tag,
        dbegin: undefined,
        dend: undefined,
      }),
    rainbow: props.config?.rainbow === true,
  });

  return (
    <Show when={props.config?.style === "list"} fallback={<TagWidget {...shared()} />}>
      <TagListWidget {...shared()} />
    </Show>
  );
}
