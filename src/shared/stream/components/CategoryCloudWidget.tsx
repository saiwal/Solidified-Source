// src/shared/stream/components/CategoryCloudWidget.tsx
//
// Alternate category layout: a tag-cloud of pills with font size scaled by
// post count, instead of the row list in CategoryWidget. Same API and props.

import { type Component, createEffect, For, on, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { rainbowStyle } from "./rainbow";
import {
  fetchCategories,
  type CategoryItem,
  type CategoryWidgetProps,
} from "./CategoryWidget";

function CloudSkeleton() {
  const widths = [52, 70, 44, 80, 58, 64];
  return (
    <div class="px-4 py-3 flex flex-wrap gap-1.5 animate-pulse">
      <For each={widths}>
        {(w) => <div class="h-6 bg-elevated rounded-full" style={{ width: `${w}px` }} />}
      </For>
    </div>
  );
}

const CategoryCloudWidget: Component<CategoryWidgetProps> = (props) => {
  const { t } = useI18n();

  const [remote] = createQueryResource(
    "stream-categories",
    () =>
      props.data
        ? null
        : { channelNick: props.channelNick, type: props.type },
    (p) => (p ? fetchCategories(p) : Promise.resolve([])),
  );

  createEffect(on(() => remote.error, (err) => { if (err) toast.error(err.message ?? t("widgets.load_error")); }));

  const categories = (): CategoryItem[] => props.data ?? remote() ?? [];
  const maxCount = () => Math.max(...categories().map((c) => c.count), 1);

  return (
    <div class="bg-surface border border-rim rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-rim">
        <h3 class="text-sm font-semibold text-txt">{props.title ?? t("widgets.categories")}</h3>
      </div>

      <Show when={!props.data && remote.loading}>
        <CloudSkeleton />
      </Show>

      <Show when={!remote.loading}>
        <Show
          when={categories().length > 0}
          fallback={
            <p class="px-4 py-3 text-xs text-muted">{t("widgets.no_categories")}</p>
          }
        >
          <div class="px-4 py-3 flex flex-wrap gap-1.5">
            <For each={categories()}>
              {(cat) => {
                const isActive = () => props.activeSlug === cat.slug;
                // Scale font between 11 px (min) and 17 px (max) by relative weight
                const weight = cat.count / maxCount();
                const size = Math.round(11 + weight * 6);
                return (
                  <button
                    onClick={() => props.onCategoryClick?.(cat.slug)}
                    style={{ "font-size": `${size}px`, ...rainbowStyle(cat.name, props.rainbow) }}
                    class="inline-flex items-center px-2 py-0.5 rounded-full
                           transition-colors leading-tight"
                    classList={{
                      "bg-accent text-accent-fg": isActive(),
                      "rainbow-pill": !isActive() && !!props.rainbow,
                      "bg-accent-muted text-accent hover:bg-accent hover:text-base": !isActive() && !props.rainbow,
                    }}
                    title={`${cat.count} post${cat.count !== 1 ? "s" : ""}`}
                  >
                    {cat.name}
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default CategoryCloudWidget;
