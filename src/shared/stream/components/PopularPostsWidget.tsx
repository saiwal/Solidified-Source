// src/shared/stream/components/PopularPostsWidget.tsx
//
// API: GET /spa/stream-widgets/popular?channel_nick=<nick>&type=<articles|posts>&limit=5
// Response:
// {
//   data: {
//     popular: {
//       uuid: string; title: string; body: string;
//       authorName: string; authorAvatar: string;
//       created: string; commentCount: number;
//     }[]
//   }
// }

import { apiError } from "@utsukta/spa-core/lib/fetch";
import {
  type Component,
  createEffect,
  on,
  createSignal,
  lazy,
  For,
  Show,
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import formatPostDate from "@utsukta/spa-core/lib/date";
import DOMPurify from "dompurify";
import type { StreamHandlers } from "../types";
import { bbcodeDisplay } from "@utsukta/spa-core/lib/renderBody";
const PostDetailModal = lazy(() => import("@/shared/views/PostDetailModal"));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PopularPost {
  uuid: string;
  title: string;
  body: string;
  authorName: string;
  authorAvatar: string;
  created: string;
  commentCount: number;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchPopular(params: {
  channelNick?: string;
  type?: "articles" | "cards" | "posts";
  limit: number;
}): Promise<PopularPost[]> {
  const url = new URL("/spa/stream-widgets/popular", window.location.origin);
  if (params.channelNick) url.searchParams.set("channel_nick", params.channelNick);
  if (params.type) url.searchParams.set("type", params.type);
  url.searchParams.set("limit", String(params.limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw await apiError(res);
  const json = await res.json();
  const data = json.data ?? json;
  return data.popular ?? [];
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function PopularSkeleton(props: { count: number }) {
  return (
    <ul class="divide-y divide-rim animate-pulse">
      <For each={Array(props.count).fill(0)}>
        {(_, i) => (
          <li class="px-4 py-3 flex items-start gap-3">
            <div class="w-5 h-5 rounded-full bg-elevated shrink-0 mt-0.5" />
            <div class="flex-1 space-y-2">
              <div
                class="h-2.5 bg-elevated rounded"
                style={{ width: i() % 2 === 0 ? "80%" : "65%" }}
              />
              <div class="h-2 bg-elevated rounded w-40%" />
              <div class="flex items-center gap-2">
                <div class="w-4 h-4 rounded-full bg-elevated shrink-0" />
                <div class="h-2 bg-elevated rounded w-20" />
                <div class="h-2 bg-elevated rounded w-12 ml-auto" />
              </div>
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Row — owns its own modal signal so each row is self-contained
// ---------------------------------------------------------------------------

function PopularPostRow(props: {
  post: PopularPost;
  rank: number;
  handlers?: StreamHandlers;
  locale: string;
}) {
  const [showModal, setShowModal] = createSignal(false);
  const p = props.post;

  const snippet = () => {
    const div = document.createElement("div");
    div.innerHTML = DOMPurify.sanitize(bbcodeDisplay(p.body));
    return (div.textContent ?? "").trim().slice(0, 90);
  };

  return (
    <>
      <li>
        <button
          onClick={() => setShowModal(true)}
          class="w-full px-4 py-3 flex items-start gap-3 text-left
                 hover:bg-elevated transition-colors group"
        >
          {/* Rank badge */}
          <span
            class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center
                   text-[0.625rem] font-bold mt-0.5 transition-colors"
            classList={{
              "bg-accent text-accent-fg": props.rank === 1,
              "bg-elevated text-muted": props.rank !== 1,
            }}
          >
            {props.rank}
          </span>

          <div class="flex-1 min-w-0 space-y-1.5">
            {/* Title / snippet */}
            <p class="text-sm font-medium text-txt leading-snug line-clamp-2
                      group-hover:text-accent transition-colors">
              {p.title || snippet() || "Untitled"}
            </p>

            {/* Author + date */}
            <div class="flex items-center gap-1.5">
              <Show
                when={p.authorAvatar}
                fallback={
                  <div class="w-4 h-4 rounded-full bg-accent-muted shrink-0
                              flex items-center justify-center text-[0.5rem] text-accent font-bold">
                    {p.authorName?.[0]?.toUpperCase() ?? "?"}
                  </div>
                }
              >
                <img
                  src={p.authorAvatar}
                  class="w-4 h-4 rounded-full object-cover shrink-0"
                  alt={p.authorName}
                />
              </Show>
              <span class="text-xs text-muted truncate">{p.authorName}</span>
              <span class="text-xs text-subtle shrink-0">·</span>
              <span
                class="text-xs text-muted shrink-0"
                title={new Date(p.created + "Z").toLocaleString(props.locale)}
              >
                {formatPostDate(p.created, props.locale)}
              </span>
            </div>

            {/* Comment count */}
            <div class="flex items-center gap-1">
              <svg
                class="w-3 h-3 text-muted shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <span class="text-xs text-muted">
                {p.commentCount}{" "}
                {p.commentCount === 1 ? "comment" : "comments"}
              </span>
            </div>
          </div>
        </button>
      </li>

      <Show when={showModal()}>
        <PostDetailModal
          uuid={p.uuid}
          onClose={() => setShowModal(false)}
          handlers={props.handlers}
        />
      </Show>
    </>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PopularPostsWidgetProps {
  channelNick?: string;
  type?: "articles" | "cards" | "posts";
  handlers?: StreamHandlers;
  /** Pre-fetched data — skips the internal fetch when provided */
  data?: PopularPost[];
  /** How many posts to show. Default: 5 */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PopularPostsWidget: Component<PopularPostsWidgetProps> = (props) => {
  const { t, locale } = useI18n();
  const limit = () => props.limit ?? 5;

  const [remote] = createQueryResource(
    "stream-popular",
    () =>
      props.data
        ? null
        : {
            channelNick: props.channelNick,
            type: props.type,
            limit: limit(),
          },
    (p) => (p ? fetchPopular(p) : Promise.resolve([])),
  );

  createEffect(on(() => remote.error, (err) => { if (err) toast.error(err.message ?? t("widgets.load_error")); }));

  const posts = (): PopularPost[] =>
    (props.data ?? remote() ?? []).slice(0, limit());

  return (
    <div class="bg-surface border border-rim rounded-xl overflow-hidden">
      {/* Header */}
      <div class="px-4 py-3 border-b border-rim">
        <h2 class="text-sm font-semibold text-txt">
          {t("widgets.popular_posts")}
        </h2>
      </div>

      {/* Loading */}
      <Show when={!props.data && remote.loading}>
        <PopularSkeleton count={limit()} />
      </Show>

      {/* Content */}
      <Show when={!remote.loading}>
        <Show
          when={posts().length > 0}
          fallback={
            <p class="px-4 py-3 text-xs text-muted">
              {t("widgets.no_popular")}
            </p>
          }
        >
          <ul class="divide-y divide-rim">
            <For each={posts()}>
              {(post, idx) => (
                <PopularPostRow
                  post={post}
                  rank={idx() + 1}
                  handlers={props.handlers}
                  locale={locale()}
                />
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
};

export default PopularPostsWidget;
