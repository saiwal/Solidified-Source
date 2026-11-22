// src/modules/articles/views/SeriesIndexView.tsx
// The header widget (title + Articles | Series switcher) sits above this, so
// the view is just the list.
import { Show, For } from "solid-js";
import { useParams } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { SkeletonRows } from "@/shared/views/ui";
import { fetchSeriesList } from "../api";
import { EmptyState } from "@ui/EmptyState";
import { cardClass } from "@ui/Card";
import { useAsyncQuery } from "@utsukta/spa-core/lib/query";
import AsyncBoundary from "@/shared/views/AsyncBoundary";

export default function SeriesIndexView() {
  const params = useParams<{ nick: string }>();
  const pageNick = usePageNick();
  const nick = () => params.nick || pageNick();
  const { t } = useI18n();

  const q = useAsyncQuery(() => ({ queryKey: ["series-list", nick()], queryFn: ({ queryKey: [, n] }) => fetchSeriesList(n as string) }));
  const data = () => q.data;

  return (
      <div class={"max-w-3xl mx-auto " +cardClass()}>
        <AsyncBoundary fallback={<SkeletonRows count={4} />}>
          <Show
            when={data().length > 0}
            fallback={<EmptyState>{t("articles.series_no_series")}</EmptyState>}
          >
            <div class="space-y-0.5">
              <For each={data()}>
                {(series) => (
                  <a
                    href={`/articles/${nick()}/series/${encodeURIComponent(series.name)}`}
                    class="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5
                           hover:bg-elevated/40 transition-colors focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span class="text-sm font-medium text-txt group-hover:text-accent-txt transition-colors truncate">{series.name}</span>
                    <span class="text-xs text-muted shrink-0 tabular-nums">{t("articles.series_articles_count", { count: series.count })}</span>
                  </a>
                )}
              </For>
            </div>
          </Show>
        </AsyncBoundary>
      </div>
  );
}
