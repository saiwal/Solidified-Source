// ArticleSeriesWidget.tsx
// API: GET /spa/stream-widgets/series?channel_nick=<nick>&type=articles
//
// Unlike the category/tag widgets (which filter the current list in place),
// clicking a series navigates to its dedicated series page — a series is an
// ordered sequence, not a facet of the current list.

import { For, Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { WidgetShell } from "@ui/WidgetShell";
import { useAsyncQuery } from "@utsukta/spa-core/lib/query";
import AsyncBoundary from "@/shared/views/AsyncBoundary";

interface SeriesItem {
  name: string;
  count: number;
}

async function fetchSeries(nick: string): Promise<SeriesItem[]> {
  const url = new URL("/spa/stream-widgets/series", window.location.origin);
  url.searchParams.set("channel_nick", nick);
  url.searchParams.set("type", "articles");
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const json = await res.json();
  return json.data?.series ?? [];
}

export default function ArticleSeriesWidget() {
  const { t } = useI18n();
  const nick = usePageNick();

  const q = useAsyncQuery(() => ({ queryKey: ["stream-series", nick()], queryFn: ({ queryKey: [, n] }) => fetchSeries(n as string) }));
  const data = () => q.data;

  return (
    <WidgetShell title={t("widgets.article_series")}>

      <AsyncBoundary>
        <Show
          when={data().length > 0}
          fallback={<p class="px-(--ws-px) py-3 text-xs text-muted">{t("articles.series_no_series")}</p>}
        >
          <ul class="p-1.5 space-y-0.5 max-h-[26rem] overflow-y-auto">
            <For each={data()}>
              {(series) => (
                <li>
                  <a
                    href={`/articles/${nick()}/series/${encodeURIComponent(series.name)}`}
                    class="w-full px-2.5 py-2 rounded-xl flex items-center gap-2 text-left hover:bg-elevated/40 transition-colors group"
                  >
                    <span class="flex-1 text-sm truncate text-txt group-hover:text-accent-txt transition-colors">
                      {series.name}
                    </span>
                    <span class="text-xs text-muted shrink-0 tabular-nums">{series.count}</span>
                  </a>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </AsyncBoundary>
    </WidgetShell>
  );
}
