// src/shared/stream/components/CategoryWidget.tsx
//
// API: GET /spa/stream-widgets/categories?channel_nick=<nick>&type=<articles|posts>
// Response: { data: { categories: { name: string; slug: string; count: number }[] } }

import { apiError } from "@utsukta/spa-core/lib/fetch";
import { type Component, createEffect, on, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { rainbowStyle } from "./rainbow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CategoryItem {
  name: string;
  slug: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchCategories(params: {
  channelNick?: string;
  type?: "articles" | "cards" | "posts" | "notes";
}): Promise<CategoryItem[]> {
  const url = new URL("/spa/stream-widgets/categories", window.location.origin);
  if (params.channelNick) url.searchParams.set("channel_nick", params.channelNick);
  if (params.type) url.searchParams.set("type", params.type);
  const res = await fetch(url.toString());
  if (!res.ok) throw await apiError(res);
  const json = await res.json();
  const data = json.data ?? json;
  return data.categories ?? [];
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CategorySkeleton() {
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CategoryWidgetProps {
  channelNick?: string;
  type?: "articles" | "cards" | "posts" | "notes";
  /** Called when the user clicks a category row */
  onCategoryClick?: (slug: string) => void;
  /** Slug of the currently active/filtered category */
  activeSlug?: string;
  /** Pre-fetched data — skips the internal fetch when provided */
  data?: CategoryItem[];
  /** Card heading. Defaults to the generic "Categories". */
  title?: string;
  /** Colour each category name by a hue derived from the name. */
  rainbow?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CategoryWidget: Component<CategoryWidgetProps> = (props) => {
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
  const total = () => categories().reduce((s, c) => s + c.count, 0);

  return (
    <div class="bg-surface border border-rim rounded-xl overflow-hidden">
      {/* Header */}
      <div class="px-4 py-3 border-b border-rim">
        <h3 class="text-sm font-semibold text-txt">{props.title ?? t("widgets.categories")}</h3>
      </div>

      {/* Loading */}
      <Show when={!props.data && remote.loading}>
        <CategorySkeleton />
      </Show>

      {/* Content */}
      <Show when={!remote.loading}>
        <Show
          when={categories().length > 0}
          fallback={
            <p class="px-4 py-3 text-xs text-muted">
              {t("widgets.no_categories")}
            </p>
          }
        >
          <ul class="divide-y divide-rim max-h-80 overflow-y-auto">
            <For each={categories()}>
              {(cat) => {
                const pct = () =>
                  total() > 0 ? Math.round((cat.count / total()) * 100) : 0;
                const isActive = () => props.activeSlug === cat.slug;

                return (
                  <li>
                    <button
                      onClick={() => props.onCategoryClick?.(cat.slug)}
                      class="w-full px-4 py-2.5 flex items-center gap-2 text-left
                             hover:bg-elevated transition-colors group"
                      classList={{ "bg-accent-muted": isActive() }}
                    >
                      {/* Colour dot */}
                      <span
                        class="w-2 h-2 rounded-full shrink-0 bg-accent transition-opacity"
                        classList={{
                          "opacity-100": isActive(),
                          "opacity-50": !isActive(),
                        }}
                      />

                      {/* Label */}
                      <span
                        class="flex-1 text-sm truncate transition-colors"
                        style={rainbowStyle(cat.name, props.rainbow)}
                        classList={{
                          "text-accent font-medium": isActive(),
                          "rainbow-text": !isActive() && !!props.rainbow,
                          "text-txt group-hover:text-accent": !isActive() && !props.rainbow,
                        }}
                      >
                        {cat.name}
                      </span>

                      {/* Count */}
                      <span class="text-xs text-muted shrink-0">{cat.count}</span>

                      {/* Mini bar */}
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
        </Show>
      </Show>
    </div>
  );
};

export default CategoryWidget;
