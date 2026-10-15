// src/modules/wiki/widgets/WikiListWidget.tsx
import { createEffect, createMemo, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { MdFillLock } from "solid-icons/md";
import { wikis, wikisLoading, wikisError, loadWikis } from "../store";

export default function WikiListWidget() {
  const { t } = useI18n();
  const nick = usePageNick();

  createEffect(() => {
    const n = nick();
    if (n) loadWikis(n);
  });

  // Once resolved, a permission error means this viewer can't see any
  // wikis on this channel at all — hide the widget rather than show empty.
  const hidden = createMemo(() => !wikisLoading() && wikisError() === "permission");

  return (
    <Show when={!hidden()}>
      <div class="bg-surface border border-rim rounded-2xl shadow-sm overflow-hidden">

        {/* Header */}
        <div class="px-4 pt-3.5 pb-3 flex items-center gap-2">
          <svg class="w-4 h-4 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
              d="M5 5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
              d="M15 3v5h5M9 9h6M9 13h6M9 17h3" />
          </svg>
          <h3 class="text-sm font-semibold text-txt flex-1">{t("widgets.wiki_list")}</h3>
          <Show when={!wikisLoading() && wikis().length > 0}>
            <span class="text-xs text-muted tabular-nums">{wikis().length}</span>
          </Show>
        </div>

        {/* Skeleton */}
        <Show when={wikisLoading()}>
          <div class="px-4 py-3 space-y-2 animate-pulse">
            <For each={[1, 2, 3]}>{() => <div class="h-3 bg-elevated rounded w-4/5" />}</For>
          </div>
        </Show>

        {/* Empty */}
        <Show when={!wikisLoading() && wikis().length === 0}>
          <p class="px-4 py-6 text-xs text-muted text-center">{t("wiki.no_wikis")}</p>
        </Show>

        {/* List */}
        <Show when={!wikisLoading() && wikis().length > 0}>
          <div class="divide-y divide-rim max-h-[26rem] overflow-y-auto">
            <For each={wikis()}>
              {(wiki) => (
                <A
                  href={`/wiki/${nick()}/${wiki.url_name}`}
                  class="flex items-center gap-2 px-4 py-2.5 hover:bg-elevated transition-colors group"
                >
                  <span class="flex-1 text-xs text-txt truncate group-hover:text-accent transition-colors">
                    {wiki.name}
                  </span>
                  <Show when={wiki.is_private}>
                    <MdFillLock size={12} class="text-muted shrink-0" />
                  </Show>
                </A>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
