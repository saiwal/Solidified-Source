// src/modules/articles/views/SeriesIndexView.tsx
// The header widget (title + Articles | Series switcher) sits above this, so
// the view is just the list.
import { Show, For } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { SkeletonRows } from "@/shared/views/ui";
import { fetchSeriesList } from "../api";

export default function SeriesIndexView() {
  const params = useParams<{ nick: string }>();
  const pageNick = usePageNick();
  const nick = () => params.nick || pageNick();
  const { t } = useI18n();

  const [data] = createQueryResource(
    "series-list",
    () => nick(),
    (n) => fetchSeriesList(n),
  );

  return (
    <div class="max-w-5xl mx-auto">
      <div class="max-w-3xl -mx-3">
        <Show when={!data.loading} fallback={<SkeletonRows count={4} />}>
          <Show
            when={(data() ?? []).length > 0}
            fallback={<p class="text-sm text-muted py-16 text-center">{t("articles.series_no_series")}</p>}
          >
            <div class="space-y-0.5">
              <For each={data()}>
                {(series) => (
                  <A
                    href={`/articles/${nick()}/series/${encodeURIComponent(series.name)}`}
                    class="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5
                           hover:bg-elevated/40 transition-colors focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span class="text-sm font-medium text-txt group-hover:text-accent-txt transition-colors truncate">{series.name}</span>
                    <span class="text-xs text-muted shrink-0 tabular-nums">{t("articles.series_articles_count", { count: series.count })}</span>
                  </A>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
