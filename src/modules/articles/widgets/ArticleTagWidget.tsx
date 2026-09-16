import TagWidget from "@/shared/stream/components/TagWidget";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useSearchParams } from "@solidjs/router";

export default function ArticleTagWidget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = () => String(searchParams.tag ?? "");

  return (
    <TagWidget
      channelNick={usePageNick()()}
      type="articles"
      activeTag={activeTag()}
      onTagClick={(tag) =>
        setSearchParams({ tag: activeTag() === tag ? undefined : tag, cat: undefined })
      }
    />
  );
}
