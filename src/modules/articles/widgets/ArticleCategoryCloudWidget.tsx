import CategoryCloudWidget from "@/shared/stream/components/CategoryCloudWidget";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useSearchParams } from "@solidjs/router";

export default function ArticleCategoryCloudWidget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSlug = () => String(searchParams.cat ?? "");

  return (
    <CategoryCloudWidget
      channelNick={usePageNick()()}
      type="articles"
      activeSlug={activeSlug()}
      onCategoryClick={(slug) =>
        setSearchParams({ cat: activeSlug() === slug ? undefined : slug, tag: undefined })
      }
    />
  );
}
