import ArchiveGridWidget from "@/shared/stream/components/ArchiveGridWidget";
import { dayRange } from "@/shared/stream/components/ArchiveWidget";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useSearchParams } from "@solidjs/router";

export default function ArticleArchiveGridWidget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeDbegin = () => String(searchParams.dbegin ?? "");
  const activeDend   = () => String(searchParams.dend   ?? "");

  const onDayClick = (year: number, month: number, day: number) => {
    const [dbegin, dend] = dayRange(year, month, day);
    const isActive = activeDbegin() === dbegin && activeDend() === dend;
    if (isActive) setSearchParams({ dbegin: undefined, dend: undefined });
    else setSearchParams({ dbegin, dend, tag: undefined, cat: undefined });
  };

  return (
    <ArchiveGridWidget
      channelNick={usePageNick()()}
      type="articles"
      activeDbegin={activeDbegin()}
      activeDend={activeDend()}
      onDayClick={onDayClick}
    />
  );
}
