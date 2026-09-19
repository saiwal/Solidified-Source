// src/shared/stream/feedviews/MasonryView.tsx
import {
  For,
  Show,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  lazy,
} from "solid-js";
import { splitIntoColumns, useColumnCount as useMasonryColumnCount } from "@utsukta/spa-core/lib/masonry";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { countAllComments, isRootPost } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "../types";
const PostDetailModal = lazy(() => import("@/shared/views/PostDetailModal"));
import formatPostDate from "@utsukta/spa-core/lib/date";
import { useI18n } from "@utsukta/spa-core/i18n";
import DOMPurify from "dompurify";
import EventCard from "@/shared/stream/components/EventCard";
import { parseEventData } from "@utsukta/spa-core/lib/activity.mapper";
import { markItemSeen } from "@utsukta/spa-core/lib/markSeen";
import { MdFillPush_pin, MdOutlineExpand_less, MdOutlineExpand_more, MdOutlineFavorite_border, MdOutlineRefresh, MdOutlineReply, MdOutlineSchedule, MdOutlineTimer } from "solid-icons/md";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { isDirectMessage as isDM, DmBadge, DmRecipients } from "@/shared/stream/components/DmMeta";
function useColumnCount(el: () => HTMLElement | undefined): () => number {
  return useMasonryColumnCount(el, 16, 3);
}

const COLLAPSED_MAX_PX = 200;

function MasonryCard(props: {
  post: ThreadNode;
  handlers: StreamHandlers;
  onOpenModal: () => void;
}) {
  const p = props.post;
  const auth = useAuth();
  const canInteract = () => auth()?.isLoggedIn === true;
  const replyCount = () =>
    p.children.length > 0
      ? countAllComments(p.children)
      : (p.commentCount ?? 0);
  const [expanded, setExpanded] = createSignal(false);
  let cardRef!: HTMLDivElement;
  let bodyRef!: HTMLDivElement;
  const [overflows, setOverflows] = createSignal(false);
  const { locale, t } = useI18n();
  const eventData = () =>
    p.eventData ??
    (p.body.includes("[event-summary]") ? parseEventData(p.body) : undefined);

  const checkOverflow = () => {
    const el = bodyRef;
    if (!el) return;
    const prev = el.style.maxHeight;
    el.style.maxHeight = "none";
    const natural = el.scrollHeight;
    el.style.maxHeight = prev;
    setOverflows(natural > COLLAPSED_MAX_PX);
  };

  onMount(() => {
    checkOverflow();
    const imgs = bodyRef?.querySelectorAll("img");
    imgs?.forEach((img) => {
      if (!img.complete)
        img.addEventListener("load", checkOverflow, { once: true });
    });

    if (p.uuid && p.flags.includes("unseen")) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            observer.disconnect();
            markItemSeen(p.uuid);
          }
        },
        { threshold: 0.5 },
      );
      observer.observe(cardRef);
      onCleanup(() => observer.disconnect());
    }
  });
  const isExpired = () => props.post.flags.includes("expired");
  // Expiry set and still in the future — the post will self-destruct.
  const isExpiring = () =>
    !isExpired() &&
    !!props.post.expires &&
    new Date(props.post.expires + "Z").getTime() > Date.now();
  const expiresTitle = () =>
    `${t("post.expires")}: ${new Date(props.post.expires! + "Z").toLocaleString(locale())}`;
  // Delayed publish — created holds the future publish time until the cron fires.
  const isScheduled = () => props.post.flags.includes("scheduled");
  const scheduledTitle = () =>
    `${t("post.scheduled_title")}: ${new Date(props.post.created + "Z").toLocaleString(locale())}`;
  const isDirectMessage = () => isDM(props.post);
  const isPinned = () => props.post.pinned ?? false;
  // A non-root item can only reach the top-level posts array in a flat
  // (nouveau/unthreaded) listing — real comments are nested as .children elsewhere.
  const isFlatReply = () => !isRootPost(p);

  return (
    <>
      <div
        ref={cardRef}
        onClick={() => props.onOpenModal()}
        class={
          "relative mb-3 bg-surface border border-rim rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer" 
        }
      >
        <div class="absolute top-2.5 right-2.5 z-10 flex items-center gap-1">
          <Show when={isPinned()}>
            <span
              class="flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-fg leading-none"
              title={t("post.pinned_indicator")}
            >
              <MdFillPush_pin size={11} />
            </span>
          </Show>
          <Show when={isFlatReply()}>
            <span
              class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-accent-muted/40 text-muted leading-none"
              title={t("post.reply_indicator")}
            >
              <MdOutlineReply size={11} />
              <span>{t("post.reply_badge")}</span>
            </span>
          </Show>
          <Show when={p.flags.includes("unseen")}>
            <span class="px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-accent text-accent-fg leading-none">
              New
            </span>
          </Show>
        </div>{" "}
        {/* Author */}
        <div class="flex items-center gap-2 mb-3">
          <Show
            when={p.authorAvatar}
            fallback={
              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-accent-txt flex items-center justify-center text-accent-fg text-xs font-bold shrink-0">
                {p.authorName?.[0]?.toUpperCase() ?? "?"}
              </div>
            }
          >
            <img
              src={p.authorAvatar}
              alt={p.authorName}
              class="w-7 h-7 rounded-full object-cover shrink-0"
            />
          </Show>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <p class="text-xs font-semibold text-txt truncate">
                {p.authorName}
              </p>
              <Show when={p.via}>
                <div class="flex items-center gap-1 shrink-0">
                  <MdOutlineRefresh class="w-2.5 h-2.5 text-muted shrink-0" />
                  <span class="text-xs text-muted">via</span>
                  <a
                    href={p.via!.url}
                    class="text-xs text-muted hover:underline font-medium truncate"
                  >
                    {p.via!.name}
                  </a>
                </div>
              </Show>
            </div>
            <p
              class="text-xs text-muted"
              title={new Date(p.created + "Z").toLocaleString(locale())}
            >
              {formatPostDate(p.created, locale())}
            </p>
            <DmRecipients
              recipients={isDirectMessage() ? p.recipients : undefined}
              class="text-[0.6875rem] text-muted truncate"
            />
          </div>
          <div class="ml-auto flex items-center gap-2 shrink-0">
            <Show when={isExpired()}>
              <span
                class="px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-muted/30 text-muted leading-none"
                title={t("post.expired_title")}
              >
                {t("post.expired_badge")}
              </span>
            </Show>
            <Show when={isExpiring()}>
              <span
                class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 leading-none"
                title={expiresTitle()}
              >
                <MdOutlineTimer size={11} />
                <span>{formatPostDate(props.post.expires!, locale())}</span>
              </span>
            </Show>
            <Show when={isScheduled()}>
              <span
                class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 leading-none"
                title={scheduledTitle()}
              >
                <MdOutlineSchedule size={11} />
                <span>
                  {t("post.scheduled_badge")} ·{" "}
                  {formatPostDate(props.post.created, locale())}
                </span>
              </span>
            </Show>
            <Show when={isDirectMessage()}>
              <DmBadge size="md" />
            </Show>
          </div>
        </div>
        <Show when={p.title}>
          <p
            class="text-sm font-semibold text-txt mb-2 leading-snug"
            innerHTML={DOMPurify.sanitize(p.title!)}
          />
        </Show>
        {/* Event card */}
        <Show when={eventData()}>
          {(ev) => <EventCard post={p} event={ev()} />}
        </Show>
        {/* Body with height cap — hidden for pure event posts */}
        <Show when={!eventData()}>
          <div class="relative">
            <div
              class="overflow-hidden transition-[max-height] duration-300 ease-in-out"
              style={{
                "max-height": expanded() ? "2000px" : `${COLLAPSED_MAX_PX}px`,
              }}
            >
              <div
                ref={bodyRef}
                class="post-body text-sm text-muted leading-relaxed wrap-anywhere
                     [&>p]:my-0.5 [&_img:not(.share-avatar)]:w-full [&_img:not(.share-avatar)]:rounded-lg [&_img:not(.share-avatar)]:mt-2 [&_img:not(.share-avatar)]:mb-1
                     [&>blockquote]:border-l-2 [&>blockquote]:border-accent [&>blockquote]:pl-2 [&>blockquote]:text-accent"
                innerHTML={p.body}
              />
            </div>
            <Show when={overflows() && !expanded()}>
              <div
                class="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-surface to-transparent flex items-end justify-center pb-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
              >
                <button
                  class="flex items-center gap-1 text-xs text-accent hover:text-accent-txt
                             bg-overlay/90 px-2 py-0.5 rounded-full border border-accent/50 transition-colors"
                >
                  <MdOutlineExpand_more class="w-3 h-3" />
                  {t("ui.show_more")}
                </button>
              </div>
            </Show>
          </div>

          <Show when={overflows() && expanded()}>
            <button
              class="flex items-center justify-center gap-1 text-xs text-accent hover:text-accent-txt mt-1 w-full transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
            >
              <MdOutlineExpand_less class="w-3 h-3" />
              {t("ui.show_less")}
            </button>
          </Show>
        </Show>
        {/* end !eventData */}
        {/* Actions */}
        <div
          class="flex items-center gap-3 mt-3 pt-3 border-t border-rim"
          onClick={(e) => e.stopPropagation()}
        >
          <Show when={canInteract()}>
            <button
              onClick={() => props.handlers.onLike(p.mid)}
              aria-label={t("post.like")}
              aria-pressed={p.viewerLiked}
              class="flex items-center gap-1 text-xs transition-colors"
              classList={{
                "text-accent": p.viewerLiked,
                "text-muted hover:text-accent": !p.viewerLiked,
              }}
            >
              <MdOutlineFavorite_border class="w-3.5 h-3.5" />
              {p.likeCount || ""}
            </button>
          </Show>

          <Show when={!p.flags?.includes("private") && canInteract()}>
            <button
              onClick={() => props.handlers.onRepeat(p.mid)}
              aria-label={t("post.repeat")}
              aria-pressed={p.viewerRepeated}
              class="flex items-center gap-1 text-xs transition-colors"
              classList={{
                "text-accent": p.viewerRepeated,
                "text-muted hover:text-accent": !p.viewerRepeated,
              }}
            >
              <MdOutlineRefresh class="w-3.5 h-3.5" />
              {p.repeatCount || ""}
            </button>
          </Show>

          <Show when={replyCount() > 0}>
            <span class="ml-auto text-xs text-muted">
              {replyCount()}{" "}
              {replyCount() === 1 ? t("ui.reply") : t("ui.replies")}
            </span>
          </Show>
        </div>
      </div>
    </>
  );
}

const SKELETON_HEIGHTS = [
  "h-24",
  "h-36",
  "h-20",
  "h-32",
  "h-28",
  "h-16",
  "h-40",
  "h-24",
  "h-20",
  "h-32",
  "h-28",
  "h-36",
];

function SkeletonMasonryCard(props: { index: number }) {
  return (
    <div class="mb-3 bg-surface border border-rim rounded-xl p-4 shadow-sm animate-pulse">
      <div class="flex items-center gap-2 mb-3">
        <div class="w-7 h-7 rounded-full bg-accent-muted shrink-0" />
        <div class="flex flex-col gap-1.5 min-w-0">
          <div class="h-2.5 bg-accent-muted rounded w-24" />
          <div class="h-2 bg-accent-muted rounded w-16" />
        </div>
      </div>
      <div
        class={`${SKELETON_HEIGHTS[props.index % SKELETON_HEIGHTS.length]} bg-accent-muted rounded-lg`}
      />
      <div class="flex items-center gap-3 mt-3 pt-3 border-t border-rim">
        <div class="h-2.5 bg-accent-muted rounded w-6" />
        <div class="h-2.5 bg-accent-muted rounded w-6" />
      </div>
    </div>
  );
}

type MasonryItem =
  | { kind: "post"; post: ThreadNode }
  | { kind: "skeleton"; index: number };

export default function MasonryView(props: {
  posts: ThreadNode[];
  handlers: StreamHandlers;
  // Number of trailing pagination-skeleton cards to weave into the same
  // column split as the real posts, so they continue the existing columns
  // instead of appearing as a second, disjointed grid below.
  appendingCount?: number;
}) {
  const [modalUuid, setModalUuid] = createSignal<string | null>(null);
  const [gridEl, setGridEl] = createSignal<HTMLDivElement>();
  const colCount = useColumnCount(gridEl);
  const items = createMemo<MasonryItem[]>(() => [
    ...props.posts.map((post): MasonryItem => ({ kind: "post", post })),
    ...Array.from(
      { length: props.appendingCount ?? 0 },
      (_, index): MasonryItem => ({ kind: "skeleton", index }),
    ),
  ]);
  const columns = createMemo(() => splitIntoColumns(items(), colCount()));

  return (
    <>
      <Show
        when={items().length > 0}
        fallback={
          <p class="text-center py-16 text-muted text-sm">Nothing here yet.</p>
        }
      >
        <div class="flex gap-3 items-start" ref={setGridEl}>
          <For each={columns()}>
            {(col) => (
              <div class="flex-1 flex flex-col min-w-0">
                <For each={col}>
                  {(item) => (
                    <Show
                      when={item.kind === "post" ? item.post : null}
                      fallback={
                        <SkeletonMasonryCard
                          index={item.kind === "skeleton" ? item.index : 0}
                        />
                      }
                    >
                      {(post) => (
                        <MasonryCard
                          post={post()}
                          handlers={props.handlers}
                          onOpenModal={() => setModalUuid(post().uuid)}
                        />
                      )}
                    </Show>
                  )}
                </For>
              </div>
            )}
          </For>
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
    </>
  );
}

export function MasonryPlaceholder(props: { count?: number }) {
  const [gridEl, setGridEl] = createSignal<HTMLDivElement>();
  const colCount = useColumnCount(gridEl);
  const placeholders = createMemo(() =>
    Array(props.count ?? 12)
      .fill(0)
      .map((_, i) => ({ i })),
  );
  const columns = createMemo(() =>
    splitIntoColumns(placeholders(), colCount()),
  );

  return (
    <div class="flex gap-3 items-start" ref={setGridEl}>
      <For each={columns()}>
        {(col) => (
          <div class="flex-1 flex flex-col">
            <For each={col}>
              {({ i }) => <SkeletonMasonryCard index={i} />}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}
