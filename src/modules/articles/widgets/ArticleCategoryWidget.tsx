import CategoryWidget from "@/shared/stream/components/CategoryWidget";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useSearchParams } from "@solidjs/router";

export default function ArticleCategoryWidget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSlug = () => String(searchParams.cat ?? "");

  return (
    <CategoryWidget
      channelNick={usePageNick()()}
      type="articles"
      activeSlug={activeSlug()}
      onCategoryClick={(slug) =>
        setSearchParams({ cat: activeSlug() === slug ? undefined : slug, tag: undefined })
      }
    />
  );
}
