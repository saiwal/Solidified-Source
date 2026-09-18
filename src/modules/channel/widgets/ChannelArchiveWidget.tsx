import { Show } from "solid-js";
import ArchiveWidget, { dayRange, monthRange } from "@/shared/stream/components/ArchiveWidget";
import ArchiveGridWidget from "@/shared/stream/components/ArchiveGridWidget";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useSearchParams } from "@solidjs/router";

export default function ChannelArchiveWidget(props: WidgetProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeDbegin = () => String(searchParams.dbegin ?? "");
  const activeDend   = () => String(searchParams.dend   ?? "");

  // Toggling the active range off clears it; anything else replaces the
  // tag/category filter with the date range.
  const applyRange = ([dbegin, dend]: [string, string]) => {
    if (activeDbegin() === dbegin && activeDend() === dend) {
      setSearchParams({ dbegin: undefined, dend: undefined });
    } else {
      setSearchParams({ dbegin, dend, tag: undefined, cat: undefined });
    }
  };

  const shared = () => ({
    channelNick: usePageNick()(),
    type: "posts" as const,
    activeDbegin: activeDbegin(),
    activeDend: activeDend(),
    onMonthClick: (y: number, m: number) => applyRange(monthRange(y, m)),
    onDayClick: (y: number, m: number, d: number) => applyRange(dayRange(y, m, d)),
  });

  return (
    <Show when={props.config?.style === "calendar"} fallback={<ArchiveWidget {...shared()} />}>
      <ArchiveGridWidget {...shared()} />
    </Show>
  );
}
