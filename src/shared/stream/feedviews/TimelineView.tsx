// src/shared/stream/feedviews/TimelineView.tsx
import { For, Show, createMemo, createSignal } from "solid-js";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { countAllComments } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "../types";
import PostDetailModal from "@/shared/views/PostDetailModal";
import { excerptOf, firstImageSrc } from "./postExcerpt";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import formatPostDate from "@utsukta/spa-core/lib/date";
import { MdFillPush_pin } from "solid-icons/md";

type Entry =
  | { kind: "day"; key: string; label: string }
  | { kind: "post"; post: ThreadNode };

function buildEntries(posts: ThreadNode[], locale: string): Entry[] {
  const out: Entry[] = [];
  let lastKey = "";
  for (const post of posts) {
    const date = new Date(post.created + "Z");
    const key = date.toDateString();
    if (key !== lastKey) {
      out.push({
        kind: "day",
        key,
        label: date.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" }),
      });
      lastKey = key;
    }
    out.push({ kind: "post", post });
  }
  return out;
}

function replyCountOf(post: ThreadNode): number {
  return post.children.length > 0 ? countAllComments(post.children) : (post.commentCount ?? 0);
}

function TimelineCard(props: { post: ThreadNode; handlers: StreamHandlers; onOpen: () => void }) {
  const p = props.post;
  const image = () => firstImageSrc(p.body);
  const auth = useAuth();
  const canInteract = () => auth()?.isLoggedIn === true;
  const { t, locale } = useI18n();

  return (
    <div
      onClick={props.onOpen}
      class="relative bg-surface border border-rim rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-lg
             hover:-translate-y-0.5 transition-all cursor-pointer"
    >
      <Show when={p.pinned}>
        <span
          class="absolute -top-2.5 -right-2.5 flex items-center justify-center w-7 h-7 rounded-full bg-accent text-accent-fg shadow-sm"
          title={t("post.pinned_indicator")}
        >
          <MdFillPush_pin size={14} />
        </span>
      </Show>

      <Show when={image()}>
        {(src) => <img src={src()} alt="" class="w-full h-48 sm:h-56 object-cover rounded-xl" />}
      </Show>

      <Show when={p.title}>
        <p class="text-base font-semibold text-txt leading-snug line-clamp-2" classList={{ "mt-3": !!image() }}>
          {p.title}
        </p>
      </Show>

      <p class="text-sm text-muted leading-relaxed line-clamp-4 mt-2">{excerptOf(p, 280)}</p>

      <div class="flex items-end justify-between gap-3 mt-4 pt-3 border-t border-rim">
        <div class="flex items-center gap-2.5 min-w-0" onClick={(e) => e.stopPropagation()}>
          <Show
            when={p.authorAvatar}
            fallback={
              <div class="w-8 h-8 rounded-full bg-accent-muted text-accent flex items-center justify-center text-xs font-bold shrink-0 uppercase">
                {p.authorName?.[0] ?? "?"}
              </div>
            }
          >
            <img src={p.authorAvatar} alt={p.authorName} class="w-8 h-8 rounded-full object-cover shrink-0" />
          </Show>
          <div class="min-w-0 leading-tight">
            <p class="text-sm font-semibold text-txt truncate">{p.authorName}</p>
            <p
              class="text-[0.6875rem] text-muted"
              title={new Date(p.created + "Z").toLocaleString(locale())}
            >
              {formatPostDate(p.created, locale())}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Show when={canInteract()}>
            <button
              onClick={() => props.handlers.onLike(p.mid)}
              class="flex items-center gap-1.5 text-sm transition-colors"
              classList={{ "text-accent": p.viewerLiked, "text-muted hover:text-accent": !p.viewerLiked }}
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill={p.viewerLiked ? "currentColor" : "none"} stroke="currentColor" stroke-width="2">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {p.likeCount || ""}
            </button>
          </Show>
          <Show when={replyCountOf(p) > 0}>
            <span class="text-sm text-muted">
              {replyCountOf(p)} {replyCountOf(p) === 1 ? t("ui.reply") : t("ui.replies")}
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
}

function TimelineCardPlaceholder() {
  return (
    <div class="bg-surface border border-rim rounded-2xl p-5 sm:p-6 shadow-sm animate-pulse">
      <div class="h-4 bg-accent-muted rounded w-3/4" />
      <div class="space-y-2 mt-2">
        <div class="h-3 bg-accent-muted rounded w-full" />
        <div class="h-3 bg-accent-muted rounded w-5/6" />
      </div>
      <div class="flex items-end justify-between gap-3 mt-4 pt-3 border-t border-rim">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-accent-muted shrink-0" />
          <div class="space-y-1">
            <div class="h-3 bg-accent-muted rounded w-24" />
            <div class="h-2.5 bg-accent-muted rounded w-16" />
          </div>
        </div>
        <div class="h-3 bg-accent-muted rounded w-16 shrink-0" />
      </div>
    </div>
  );
}

export function TimelinePlaceholder(props: { count?: number }) {
  return (
    <div class="max-w-3xl mx-auto">
      <div class="relative">
        <div
          class="absolute left-4 sm:left-6 top-1 bottom-1 w-1 -translate-x-1/2 rounded-full bg-rim"
          aria-hidden="true"
        />
        <div class="space-y-8">
          <div class="relative flex items-center gap-3 pl-0">
            <span class="relative z-10 ml-1 sm:ml-3 h-6 w-44 rounded-full bg-accent-muted animate-pulse" />
          </div>
          <For each={Array(props.count ?? 4).fill(0)}>
            {() => (
              <div class="relative">
                <div class="absolute left-4 sm:left-6 top-7 w-3 h-3 -translate-x-1/2 rounded-full bg-accent-muted ring-4 ring-base z-10" />
                <div class="ml-9 sm:ml-14">
                  <TimelineCardPlaceholder />
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

export default function TimelineView(props: { posts: ThreadNode[]; handlers: StreamHandlers }) {
  const { t, locale } = useI18n();
  const [modalUuid, setModalUuid] = createSignal<string | null>(null);
  const entries = createMemo(() => buildEntries(props.posts, locale()));

  return (
    <div class="max-w-3xl mx-auto">
      <Show when={entries().length > 0} fallback={<p class="text-center py-16 text-muted text-sm">{t("network.all_caught_up")}</p>}>
        <div class="relative">
          {/* the continuous rail — a single line behind every day marker and card */}
          <div
            class="absolute left-4 sm:left-6 top-1 bottom-1 w-1 -translate-x-1/2 rounded-full bg-rim"
            aria-hidden="true"
          />
          <div class="space-y-8">
            <For each={entries()}>
              {(entry) =>
                entry.kind === "day" ? (
                  <div class="relative flex items-center gap-3 pl-0">
                    <span class="relative z-10 ml-1 sm:ml-3 px-3 py-1 rounded-full bg-accent text-accent-fg text-xs font-bold tracking-wide shadow-sm">
                      {entry.label}
                    </span>
                  </div>
                ) : (
                  <div class="relative">
                    <div class="absolute left-4 sm:left-6 top-7 w-3 h-3 -translate-x-1/2 rounded-full bg-accent ring-4 ring-base z-10" />
                    <div class="ml-9 sm:ml-14">
                      <TimelineCard post={entry.post} handlers={props.handlers} onOpen={() => setModalUuid(entry.post.uuid)} />
                    </div>
                  </div>
                )
              }
            </For>
          </div>
        </div>
      </Show>

      <Show when={modalUuid()}>
        {(uuid) => (
          <PostDetailModal
            uuid={uuid()}
            onClose={() => setModalUuid(null)}
            handlers={props.handlers}
          />
        )}
      </Show>
    </div>
  );
}
