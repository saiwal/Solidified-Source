// RSS/Atom feed widget (config: { url, count }). Feeds are fetched and parsed
// server-side via GET /spa/rss-feed — browsers can't fetch cross-origin feeds.

import { apiError } from "@utsukta/spa-core/lib/fetch";
import { For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";

interface FeedItem {
  title: string;
  link: string;
  published: string | null;
}

interface Feed {
  title: string;
  link: string | null;
  items: FeedItem[];
}

async function fetchFeed(params: { url: string; count: number }): Promise<Feed> {
  const u = new URL("/spa/rss-feed", window.location.origin);
  u.searchParams.set("url", params.url);
  u.searchParams.set("limit", String(params.count));
  const res = await fetch(u.toString());
  if (!res.ok) throw await apiError(res);
  const json = await res.json();
  return (json.data ?? json) as Feed;
}

function itemDate(published: string | null): string {
  if (!published) return "";
  const d = new Date(published);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export default function RssWidget(props: WidgetProps) {
  const { t } = useI18n();
  const url = () => String(props.config?.url ?? "");
  const count = () => Math.max(1, Math.min(10, Number(props.config?.count ?? 5)));

  const [feed] = createQueryResource(
    "rss-feed",
    () => (url() ? { url: url(), count: count() } : null),
    fetchFeed,
  );

  return (
    <Show
      when={url()}
      fallback={
        <Show when={editingWidgets()}>
          <div class="bg-surface border border-rim rounded-xl px-4 py-3">
            <p class="text-xs text-muted">{t("widgets.not_configured")}</p>
          </div>
        </Show>
      }
    >
      <div class="bg-surface border border-rim rounded-xl overflow-hidden">
        <div class="px-4 py-3">
          <h3 class="text-sm font-semibold text-txt truncate">
            <Show when={feed()?.link} fallback={feed()?.title || t("widgets.rss_feed")}>
              <a
                href={feed()!.link!}
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-accent transition-colors"
              >
                {feed()?.title || t("widgets.rss_feed")}
              </a>
            </Show>
          </h3>
        </div>

        <Show when={feed.loading}>
          <ul class="divide-y divide-rim animate-pulse">
            <For each={[75, 55, 85]}>
              {(w) => (
                <li class="px-4 py-2.5">
                  <div class="h-2.5 bg-elevated rounded" style={{ width: `${w}%` }} />
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Show when={feed.error}>
          <p class="px-4 py-3 text-xs text-muted">{t("widgets.load_error")}</p>
        </Show>

        <Show when={!feed.loading && !feed.error}>
          <Show
            when={(feed()?.items.length ?? 0) > 0}
            fallback={<p class="px-4 py-3 text-xs text-muted">{t("widgets.rss_empty")}</p>}
          >
            <ul class="divide-y divide-rim max-h-[26rem] overflow-y-auto">
              <For each={feed()!.items}>
                {(item) => (
                  <li>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="block px-4 py-2.5 hover:bg-elevated transition-colors"
                    >
                      <span class="block text-sm text-txt line-clamp-2">{item.title}</span>
                      <Show when={itemDate(item.published)}>
                        <span class="block text-xs text-muted mt-0.5">
                          {itemDate(item.published)}
                        </span>
                      </Show>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
