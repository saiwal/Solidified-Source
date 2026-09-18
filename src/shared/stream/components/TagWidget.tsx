// src/shared/stream/components/TagWidget.tsx
//
// API: GET /spa/stream-widgets/tags?channel_nick=<nick>&type=<articles|posts>
// Response: { data: { tags: { name: string; count: number }[] } }

import { apiError } from "@utsukta/spa-core/lib/fetch";
import {
  type Component,
  createEffect,
  on,
  createSignal,
  For,
  Show,
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { rainbowStyle } from "./rainbow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TagItem {
  name: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchTags(params: {
  channelNick?: string;
  type?: "articles" | "cards" | "posts" | "notes";
}): Promise<TagItem[]> {
  const url = new URL("/spa/stream-widgets/tags", window.location.origin);
  if (params.channelNick) url.searchParams.set("channel_nick", params.channelNick);
  if (params.type) url.searchParams.set("type", params.type);
  const res = await fetch(url.toString());
  if (!res.ok) throw await apiError(res);
  const json = await res.json();
  const data = json.data ?? json;
  return data.tags ?? [];
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function TagSkeleton() {
  const widths = [60, 80, 45, 70, 55, 90, 50, 65];
  return (
    <div class="px-4 py-3 flex flex-wrap gap-1.5 animate-pulse">
      <For each={widths}>
        {(w) => (
          <div
            class="h-6 bg-elevated rounded-full"
            style={{ width: `${w}px` }}
          />
        )}
      </For>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TagWidgetProps {
  channelNick?: string;
  type?: "articles" | "cards" | "posts" | "notes";
  /** Called when the user clicks a tag */
  onTagClick?: (tag: string) => void;
  /** Name of the currently active/filtered tag */
  activeTag?: string;
  /** Pre-fetched data — skips the internal fetch when provided */
  data?: TagItem[];
  /** Max tags before the "show more" collapse. Default: 20 */
  maxVisible?: number;
  /** Card heading. Defaults to the generic "Tags". */
  title?: string;
  /** Colour each tag name by a hue derived from the name. */
  rainbow?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TagWidget: Component<TagWidgetProps> = (props) => {
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
      {/* Header */}
      <div class="px-4 py-3 border-b border-rim">
        <h3 class="text-sm font-semibold text-txt">{props.title ?? t("widgets.tags")}</h3>
      </div>

      {/* Loading */}
      <Show when={!props.data && remote.loading}>
        <TagSkeleton />
      </Show>

      {/* Content */}
      <Show when={!remote.loading}>
        <Show
          when={tags().length > 0}
          fallback={
            <p class="px-4 py-3 text-xs text-muted">{t("widgets.no_tags")}</p>
          }
        >
          <div class="px-4 py-3 flex flex-wrap gap-1.5">
            <For each={visibleTags()}>
              {(tag) => {
                const isActive = () => props.activeTag === tag.name;
                // Scale font between 11 px (min) and 17 px (max) by relative weight
                const weight = tag.count / maxCount();
                const size = Math.round(11 + weight * 6);
                return (
                  <button
                    onClick={() => props.onTagClick?.(tag.name)}
                    style={{ "font-size": `${size}px`, ...rainbowStyle(tag.name, props.rainbow) }}
                    class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full
                           transition-colors leading-tight"
                    classList={{
                      "bg-accent text-accent-fg": isActive(),
                      "rainbow-pill": !isActive() && !!props.rainbow,
                      "bg-accent-muted text-accent hover:bg-accent hover:text-base": !isActive() && !props.rainbow,
                    }}
                    title={`${tag.count} post${tag.count !== 1 ? "s" : ""}`}
                  >
                    <span>#</span>
                    <span>{tag.name}</span>
                  </button>
                );
              }}
            </For>
          </div>

          {/* Expand / collapse */}
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

export default TagWidget;
