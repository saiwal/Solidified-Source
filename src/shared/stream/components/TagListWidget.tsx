// src/shared/stream/components/TagListWidget.tsx
//
// Alternate tag layout: row list with counts and mini bars (matching the
// CategoryWidget list style), instead of the size-scaled pill cloud in
// TagWidget. Same API and props.

import {
  type Component,
  createEffect,
  createSignal,
  For,
  on,
  Show,
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { rainbowStyle } from "./rainbow";
import { fetchTags, type TagItem, type TagWidgetProps } from "./TagWidget";

function ListSkeleton() {
  const widths = [55, 75, 40, 65, 50];
  return (
    <ul class="divide-y divide-rim animate-pulse">
      <For each={widths}>
        {(w) => (
          <li class="px-4 py-2.5 flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-elevated shrink-0" />
            <div class="h-2.5 bg-elevated rounded" style={{ width: `${w}%` }} />
            <div class="ml-auto h-2.5 bg-elevated rounded w-5 shrink-0" />
            <div class="w-12 h-1 rounded-full bg-elevated shrink-0" />
          </li>
        )}
      </For>
    </ul>
  );
}

const TagListWidget: Component<TagWidgetProps> = (props) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = createSignal(false);
  const max = () => props.maxVisible ?? 20;

  const [remote] = createQueryResource(
    "stream-tags",
    () =>
      props.data
        ? null
        : { channelNick: props.channelNick, type: props.type },
    (p) => (p ? fetchTags(p) : Promise.resolve([])),
  );

  createEffect(on(() => remote.error, (err) => { if (err) toast.error(err.message ?? t("widgets.load_error")); }));

  const tags = (): TagItem[] => props.data ?? remote() ?? [];
  const maxCount = () => Math.max(...tags().map((t) => t.count), 1);
  const visibleTags = () => (expanded() ? tags() : tags().slice(0, max()));
  const hiddenCount = () => tags().length - max();

  return (
    <div class="bg-surface border border-rim rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-rim">
        <h3 class="text-sm font-semibold text-txt">{props.title ?? t("widgets.tags")}</h3>
      </div>

      <Show when={!props.data && remote.loading}>
        <ListSkeleton />
      </Show>

      <Show when={!remote.loading}>
        <Show
          when={tags().length > 0}
          fallback={
            <p class="px-4 py-3 text-xs text-muted">{t("widgets.no_tags")}</p>
          }
        >
          <ul class="divide-y divide-rim max-h-80 overflow-y-auto">
            <For each={visibleTags()}>
              {(tag) => {
                const pct = () => Math.round((tag.count / maxCount()) * 100);
                const isActive = () => props.activeTag === tag.name;

                return (
                  <li>
                    <button
                      onClick={() => props.onTagClick?.(tag.name)}
                      class="w-full px-4 py-2.5 flex items-center gap-2 text-left
                             hover:bg-elevated transition-colors group"
                      classList={{ "bg-accent-muted": isActive() }}
                    >
                      <span
                        class="text-xs shrink-0 transition-colors"
                        classList={{
                          "text-accent": isActive(),
                          "text-muted": !isActive(),
                        }}
                      >
                        #
                      </span>

                      <span
                        class="flex-1 text-sm truncate transition-colors"
                        style={rainbowStyle(tag.name, props.rainbow)}
                        classList={{
                          "text-accent font-medium": isActive(),
                          "rainbow-text": !isActive() && !!props.rainbow,
                          "text-txt group-hover:text-accent": !isActive() && !props.rainbow,
                        }}
                      >
                        {tag.name}
                      </span>

                      <span class="text-xs text-muted shrink-0">{tag.count}</span>

                      <div class="w-12 h-1 rounded-full bg-elevated shrink-0 overflow-hidden">
                        <div
                          class="h-full bg-accent rounded-full transition-all duration-300"
                          style={{ width: `${pct()}%` }}
                        />
                      </div>
                    </button>
                  </li>
                );
              }}
            </For>
          </ul>

          <Show when={tags().length > max()}>
            <button
              onClick={() => setExpanded((v) => !v)}
              class="w-full px-4 py-2 text-xs text-muted hover:text-txt
                     border-t border-rim text-center transition-colors"
            >
              {expanded()
                ? t("ui.show_less")
                : t("widgets.show_more_tags", { count: hiddenCount() })}
            </button>
          </Show>
        </Show>
      </Show>
    </div>
  );
};

export default TagListWidget;
