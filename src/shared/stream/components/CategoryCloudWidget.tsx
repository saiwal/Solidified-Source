// src/shared/stream/components/CategoryCloudWidget.tsx
//
// Alternate category layout: a tag-cloud of pills with font size scaled by
// post count, instead of the row list in CategoryWidget. Same API and props.

import { type Component, createEffect, createSignal, For, on, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { rainbowStyle } from "./rainbow";
import {
  fetchCategories,
  type CategoryItem,
  type CategoryWidgetProps,
} from "./CategoryWidget";
import { Button } from "@ui/Button";
import { Chip } from "@ui/Chip";
import { Skeleton } from "@ui/Skeleton";
import { Card, CardHeader } from "@ui/Card";

function CloudSkeleton() {
  const widths = [52, 70, 44, 80, 58, 64];
  return (
    <div class="px-4 py-3 flex flex-wrap gap-1.5">
      <For each={widths}>
        {(w) => <Skeleton rounded="full" class="h-6" style={{ width: `${w}px` }} />}
      </For>
    </div>
  );
}

const CategoryCloudWidget: Component<CategoryWidgetProps> = (props) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = createSignal(false);
  const max = () => props.maxVisible ?? 20;

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
  const visible = () => (expanded() ? categories() : categories().slice(0, max()));

  return (
    <Card class="overflow-hidden">
      <CardHeader>
        <h3 class="text-sm font-semibold text-txt">{props.title ?? t("widgets.categories")}</h3>
      </CardHeader>

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
            <For each={visible()}>
              {(cat) => {
                const isActive = () => props.activeSlug === cat.slug;
                // Scale font between 11 px (min) and 17 px (max) by relative weight
                const weight = cat.count / maxCount();
                const size = Math.round(11 + weight * 6);
                return (
                  <Chip
                    size="sm"
                    tone="accent"
                    rainbow={!!props.rainbow}
                    selected={isActive()}
                    style={{ "font-size": `${size}px`, ...rainbowStyle(cat.name, props.rainbow) }}
                    class={`leading-tight ${props.rainbow ? "" : "hover:bg-accent hover:text-accent-fg"}`}
                    onClick={() => props.onCategoryClick?.(cat.slug)}
                    title={`${cat.count} post${cat.count !== 1 ? "s" : ""}`}
                  >
                    {cat.name}
                  </Chip>
                );
              }}
            </For>
          </div>

          <Show when={categories().length > max()}>
            <Button variant="ghost" size="sm" class="w-full" onClick={() => setExpanded((v) => !v)}>
              {expanded() ? t("ui.show_less") : t("widgets.show_more_categories")}
            </Button>
          </Show>
        </Show>
      </Show>
    </Card>
  );
};

export default CategoryCloudWidget;
