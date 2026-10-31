// Shared body of the two configurable HQ stream cards — SavedSearchPostsWidget
// and FilterPostsWidget. Both reduce to a set of /network URL params
// (the same shape a saved search stores), so this card takes those params,
// runs them through parseNetworkParams like NetworkView does, and lists the
// newest matches. A row opens the post modal; the header links to /network
// with the same params for the full stream.

import { For, Show, type JSX } from "solid-js";
import { A } from "@solidjs/router";
import { MdOutlineOpen_in_new, MdOutlineRefresh, MdOutlineInbox } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import formatPostDate from "@utsukta/spa-core/lib/date";
import { fetchNetworkStream, parseNetworkParams } from "@/modules/network/api";
import { openPost } from "@/shared/views/modal-host";
import { Card } from "@ui/Card";
import { IconButton, iconButtonClass } from "@ui/Button";
import { Avatar } from "@ui/Avatar";
import { EmptyState } from "@ui/EmptyState";
import { ErrorState } from "@ui/ErrorState";
import { Skeleton } from "@ui/Skeleton";

export type CardConfig = { count?: number; unseen?: boolean };
export const COUNTS = [5, 10] as const;

// The stream filter toggles from StreamFiltersWidget, as /network params.
// "" = no toggle (all posts), useful together with a group or forum scope.
export const PRESETS = [
  { key: "",      labelKey: "widgets.cfg_preset_all" },
  { key: "star",  labelKey: "network.starred" },
  { key: "pf",    labelKey: "network.following" },
  { key: "conv",  labelKey: "network.conversations" },
  { key: "dm",    labelKey: "network.direct_messages" },
  { key: "event", labelKey: "network.events" },
  { key: "poll",  labelKey: "network.polls" },
  { key: "rss",   labelKey: "network.rss_feeds" },
] as const;
export type PresetKey = (typeof PRESETS)[number]["key"];

// Post.body is already-rendered HTML; DOMParser never runs scripts.
function snippet(html: string): string {
  return (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").trim().slice(0, 120);
}

export function FilteredPostsList(props: {
  title: string;
  /** /network URL params; null = not configured yet (shows `empty`). */
  params: Record<string, string> | null;
  count?: number;
  empty?: JSX.Element;
}) {
  const { t, locale } = useI18n();
  const [posts, { refetch }] = createQueryResource(
    "hq-filtered",
    () => props.params,
    (p) => fetchNetworkStream(parseNetworkParams(p)).then((r) => r.items),
  );
  const shown = () => (posts.latest ?? []).slice(0, props.count ?? 5);

  return (
    <Card raised class="flex flex-col overflow-hidden" style={{ "max-height": "480px" }}>
      <div class="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between gap-2 shrink-0">
        <span class="text-xs font-medium uppercase tracking-wider text-muted truncate">{props.title}</span>
        <Show when={props.params}>
          {(p) => (
            <div class="flex items-center gap-1 shrink-0">
              <IconButton label={t("hq.retry")} size="sm" onClick={() => void refetch()} disabled={posts.loading}>
                <MdOutlineRefresh class="w-3.5 h-3.5" classList={{ "animate-spin": posts.loading }} />
              </IconButton>
              <A
                href={`/network?${new URLSearchParams(p())}`}
                class={iconButtonClass("default", "sm")}
                aria-label={t("widgets.open_in_network")}
                title={t("widgets.open_in_network")}
              >
                <MdOutlineOpen_in_new class="w-3.5 h-3.5" />
              </A>
            </div>
          )}
        </Show>
      </div>

      <Show when={props.params} fallback={<EmptyState size="sm" class="px-4 pb-4">{props.empty}</EmptyState>}>
        <Show when={!posts.error} fallback={<ErrorState message={t("widgets.load_error")} retry={() => void refetch()} />}>
          <Show when={posts.latest} fallback={<div class="px-3.5 pb-3.5 space-y-3"><Skeleton class="h-10" /><Skeleton class="h-10" /><Skeleton class="h-10" /></div>}>
            <Show
              when={shown().length > 0}
              fallback={<EmptyState size="sm" class="px-4 pb-4" icon={<MdOutlineInbox class="w-7 h-7" />}>{t("widgets.no_matching_posts")}</EmptyState>}
            >
              <ul class="overflow-y-auto divide-y divide-rim border-t border-rim">
                <For each={shown()}>
                  {(post) => (
                    <li>
                      <button
                        onClick={() => openPost(post.uuid)}
                        class="w-full px-3.5 py-2.5 flex items-start gap-2.5 text-left hover:bg-elevated transition-colors group"
                      >
                        <Avatar src={post.authorAvatar} name={post.authorName} size={6} />
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-1.5 text-xs text-muted">
                            <span class="truncate font-medium text-txt">{post.authorName}</span>
                            <Show when={post.flags.includes("unseen")}>
                              <span class="w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-label={t("widgets.unread")} />
                            </Show>
                            <span class="ml-auto shrink-0">{formatPostDate(post.created, locale())}</span>
                          </div>
                          <p class="text-sm text-txt line-clamp-2 group-hover:text-accent-txt transition-colors">
                            {post.title || snippet(post.body) || t("widgets.untitled")}
                          </p>
                        </div>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </Show>
      </Show>
    </Card>
  );
}
