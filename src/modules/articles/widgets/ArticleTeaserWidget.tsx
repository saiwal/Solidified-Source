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

function excerpt(bbcodeText: string, max = 200): string {
  const text = bbcodeText.replace(/\[[^\]]{0,60}\]/g, "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function EditHint(props: { text: string }) {
  return (
    <Show when={editingWidgets()}>
      <div class="bg-surface border border-rim rounded-xl px-4 py-3">
        <p class="text-xs text-muted">{props.text}</p>
      </div>
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
        <div class="bg-surface border border-rim rounded-xl p-4 space-y-2 animate-pulse">
          <div class="h-3 bg-elevated rounded w-2/3" />
          <div class="h-3 bg-elevated rounded w-full" />
          <div class="h-3 bg-elevated rounded w-1/2" />
        </div>
      </Show>

      <Show when={!article.loading}>
        <Show when={article()} fallback={<EditHint text={t("widgets.item_unavailable")} />}>
          {(a) => (
            <div class="bg-surface border border-rim rounded-xl overflow-hidden">
              <div class="px-4 py-3">
                <h4 class="text-sm font-semibold text-txt">{a().title}</h4>
                <p class="text-[0.625rem] text-muted mt-0.5">
                  {new Date(a().created).toLocaleDateString(locale())}
                </p>
                <p class="text-sm text-txt mt-2">{excerpt(a().summary || a().body)}</p>
              </div>
              <A
                href={articlePath(nick(), a())}
                class="block px-4 py-2 border-t border-rim text-center text-xs font-medium
                       text-accent hover:bg-elevated transition-colors"
              >
                {t("widgets.read_article")}
              </A>
            </div>
          )}
        </Show>
      </Show>
    </Show>
  );
}
