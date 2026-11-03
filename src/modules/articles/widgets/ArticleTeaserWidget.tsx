// Article teaser card (config: { uuid }): title, short excerpt, and a
// read-more link for one article. multiInstance.

import { Show } from "solid-js";
import { A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchArticle } from "../api";
import { articlePath } from "@/shared/lib/shareLinks";
import { bbcodeExcerpt } from "@utsukta/spa-core/lib/bbcode";
import { Card } from "@ui/Card";
import { WidgetShell } from "@ui/WidgetShell";


function EditHint(props: { text: string }) {
  return (
    <Show when={editingWidgets()}>
      <Card class="px-(--ws-px) py-3">
        <p class="text-xs text-muted">{props.text}</p>
      </Card>
    </Show>
  );
}

export default function ArticleTeaserWidget(props: WidgetProps) {
  const { t, locale } = useI18n();
  const nick = usePageNick();
  const uuid = () => String(props.config?.uuid ?? "");

  const [article] = createQueryResource(
    "article-teaser",
    () => (nick() && uuid() ? { nick: nick(), uuid: uuid() } : null),
    async (p) => (await fetchArticle(p.nick, p.uuid)).article,
  );

  return (
    <Show when={uuid()} fallback={<EditHint text={t("widgets.not_configured")} />}>
      <Show when={article.loading}>
        <WidgetShell><div class="p-4 space-y-2 animate-pulse">
          <div class="h-3 bg-elevated rounded w-2/3" />
          <div class="h-3 bg-elevated rounded w-full" />
          <div class="h-3 bg-elevated rounded w-1/2" />
        </div></WidgetShell>
      </Show>

      <Show when={!article.loading}>
        <Show when={article()} fallback={<EditHint text={t("widgets.item_unavailable")} />}>
          {(a) => (
            <WidgetShell>
              <div class="px-(--ws-px) py-3">
                <h4 class="text-sm font-semibold text-txt">{a().title}</h4>
                <p class="text-[0.625rem] text-muted mt-0.5">
                  {new Date(a().created).toLocaleDateString(locale())}
                </p>
                <p class="text-sm text-txt mt-2">{bbcodeExcerpt(a().summary || a().body, 200)}</p>
              </div>
              <A
                href={articlePath(nick(), a())}
                class="block px-(--ws-px) py-2 border-t border-rim text-center text-xs font-medium
                       text-accent-txt hover:bg-elevated transition-colors"
              >
                {t("widgets.read_article")}
              </A>
            </WidgetShell>
          )}
        </Show>
      </Show>
    </Show>
  );
}
