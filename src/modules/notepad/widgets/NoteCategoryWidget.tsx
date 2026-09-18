import { Show } from "solid-js";
import CategoryWidget from "@/shared/stream/components/CategoryWidget";
import CategoryCloudWidget from "@/shared/stream/components/CategoryCloudWidget";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useSearchParams } from "@solidjs/router";

// Notes are owner-only, so no channelNick — the API falls back to
// local_channel(). Categories on a note are its notebooks.
export default function NoteCategoryWidget(props: WidgetProps) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSlug = () => String(searchParams.cat ?? "");

  const shared = () => ({
    type: "notes" as const,
    title: t("widgets.note_categories"),
    activeSlug: activeSlug(),
    onCategoryClick: (slug: string) =>
      setSearchParams({ cat: activeSlug() === slug ? undefined : slug, tag: undefined }),
    rainbow: props.config?.rainbow === true,
  });

  return (
    <Show when={props.config?.style === "cloud"} fallback={<CategoryWidget {...shared()} />}>
      <CategoryCloudWidget {...shared()} />
    </Show>
  );
}
