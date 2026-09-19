// src/shared/stream/feedviews/ListView.tsx
import { For, Show, createSignal, lazy, onMount, onCleanup } from "solid-js";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { countAllComments, flattenThread, isRootPost } from "@utsukta/spa-core/lib/thread";
import { useThreadMode } from "@utsukta/spa-core/store/thread-mode";
import { REACTION_VERBS } from "@/shared/stream/store/actions-store";
import { useCommentOrder } from "@utsukta/spa-core/store/comment-order";
import type { StreamHandlers } from "../types";
import formatPostDate from "@utsukta/spa-core/lib/date";
import { useI18n } from "@utsukta/spa-core/i18n";
import DOMPurify from "dompurify";
import { handleNsfwToggleClick } from "@utsukta/spa-core/lib/nsfw";
import { markItemSeen } from "@utsukta/spa-core/lib/markSeen";
import CommentComposer from "@/shared/editor/composers/CommentComposer";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useListBehavior } from "@utsukta/spa-core/store/list-behavior";
import { MdFillKeyboard_arrow_down, MdFillPush_pin, MdOutlineChat_bubble_outline, MdOutlineExpand_more, MdOutlineOpen_in_new, MdOutlineRefresh, MdOutlineReply, MdOutlineSchedule, MdOutlineTimer } from "solid-icons/md";
import { isDirectMessage as isDM, DmBadge, DmRecipients } from "@/shared/stream/components/DmMeta";
import { parseEventData } from "@utsukta/spa-core/lib/activity.mapper";

const PostDetailModal = lazy(() => import("@/shared/views/PostDetailModal"));

// ── helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  const raw = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const el = document.createElement("textarea");
  el.innerHTML = raw;
  return el.value;
}

// Event posts embed [event-summary]/[event-description]/… bbcode tags
// straight in the body — stripHtml(p.body) would leak those tags as literal
// text into the row preview, so event rows preview the description instead.
function rowPreview(p: ThreadNode): string {
  if (p.bodyNsfw) return "Hidden content — open to view";
  const ev = p.eventData ?? (p.body.includes("[event-summary]") ? parseEventData(p.body) : undefined);
  if (ev) return ev.description ? stripHtml(ev.description).slice(0, 160) : "";
  return stripHtml(p.body).slice(0, 160);
}

function getParticipants(thread: ThreadNode) {
  return [
    ...new Set(
      flattenThread(thread)
        .map((n) => n.authorName)
        .filter(Boolean),
    ),
  ];
}

// ── vote gutter (shared by both row modes) ────────────────────────────────────

function VoteGutter(props: { post: ThreadNode; handlers: StreamHandlers }) {
  const p = props.post;
  const auth = useAuth();
  const canInteract = () => auth()?.isLoggedIn === true;
  const score = () => (p.likeCount ?? 0) - (p.dislikeCount ?? 0);

  return (
    <div
      class="flex flex-col items-center justify-center gap-0.5 w-10 shrink-0
             bg-surface/60 border-r border-rim px-1 py-2 self-stretch"
      onClick={(e) => e.stopPropagation()}
    >
      <Show when={canInteract()}>
        <button
          onClick={() => props.handlers.onLike(p.mid)}
          class="flex items-center justify-center w-6 h-5 rounded transition-colors"
          classList={{
            "text-accent": p.viewerLiked,
            "text-subtle hover:text-accent": !p.viewerLiked,
          }}
        >
          <svg
            class="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill={p.viewerLiked ? "currentColor" : "none"}
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      </Show>

      <span
        class="text-[0.6875rem] font-bold tabular-nums leading-none"
        classList={{
          "text-accent": score() > 0,
          "text-muted": score() === 0,
          "text-subtle": score() < 0,
        }}
      >
        {score()}
      </span>

      <Show when={canInteract()}>
        <button
          onClick={() => props.handlers.onDislike(p.mid)}
          class="flex items-center justify-center w-6 h-5 rounded transition-colors"
          classList={{
            "text-accent": p.viewerDisliked,
            "text-subtle hover:text-subtle/60": !p.viewerDisliked,
          }}
        >
          <MdOutlineExpand_more class="w-3.5 h-3.5" />
        </button>
      </Show>
    </div>
  );
}

// ── details row (shared by both row modes) ───────────────────────────────────

function RowDetails(props: {
  post: ThreadNode;
  replyCount: number;
  replyLabel: string;
  onReplies: () => void;
  repliesActive?: boolean;
  handlers: StreamHandlers;
}) {
  const p = props.post;
  const { t } = useI18n();
  const auth = useAuth();
  const canInteract = () => auth()?.isLoggedIn === true;

  return (
    <div
      class="flex items-center gap-0.5 px-2 pb-1.5 flex-wrap"
      onClick={(e) => e.stopPropagation()}
    >
      <Show when={!p.flags?.includes("private") && canInteract()}>
        <button
          onClick={() => props.handlers.onRepeat(p.mid)}
          class="flex items-center gap-1 text-[0.6875rem] px-2 py-1 rounded-md transition-colors"
          classList={{
            "text-accent bg-accent-muted": p.viewerRepeated,
            "text-muted hover:text-txt hover:bg-elevated": !p.viewerRepeated,
          }}
        >
          <MdOutlineRefresh class="w-3 h-3" />
          <Show when={p.repeatCount > 0}>
            <span>{p.repeatCount}</span>
          </Show>
          <span class="hidden sm:inline">{t("post.repeat")}</span>
        </button>
      </Show>

      <button
        onClick={() => props.onReplies()}
        class="flex items-center gap-1 text-[0.6875rem] px-2 py-1 rounded-md transition-colors"
        classList={{
          "text-accent bg-accent-muted": props.repliesActive,
          "text-muted hover:text-txt hover:bg-elevated": !props.repliesActive,
        }}
      >
        <MdOutlineChat_bubble_outline class="w-3 h-3" />
        <Show when={props.replyCount > 0}>
          <span>{props.replyCount}</span>
        </Show>
        <span class="hidden sm:inline">{props.replyLabel}</span>
      </button>

      <Show when={p.via}>
        <a
          href={p.via!.url}
          class="flex items-center gap-1 text-[0.6875rem] px-2 py-1 rounded-md
                 text-muted hover:text-txt hover:bg-elevated transition-colors min-w-0"
        >
          <MdOutlineRefresh class="w-3 h-3 shrink-0" />
          <span>via</span>
          <span class="font-medium truncate max-w-[120px]">{p.via!.name}</span>
        </a>
      </Show>

      <Show when={p.permalink}>
        <a
          href={p.permalink}
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1 text-[0.6875rem] px-2 py-1 rounded-md
                 text-muted hover:text-txt hover:bg-elevated transition-colors"
        >
          <MdOutlineOpen_in_new class="w-3 h-3" />
          <span class="hidden sm:inline">{t("post.original")}</span>
        </a>
      </Show>
    </div>
  );
}

// ── list mode row (opens post modal) ─────────────────────────────────────────

function ListRow(props: {
  post: ThreadNode;
  handlers: StreamHandlers;
  index: number;
  onOpenModal: () => void;
}) {
  const p = props.post;
  const preview = () => rowPreview(p);
  const replyCount = () =>
    p.children.length > 0
      ? countAllComments(p.children)
      : (p.commentCount ?? 0);
  const { locale, t } = useI18n();
  let rowRef!: HTMLDivElement;

  onMount(() => {
    if (!p.uuid || !p.flags.includes("unseen")) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          markItemSeen(p.uuid);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(rowRef);
    onCleanup(() => observer.disconnect());
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
    <div
      ref={rowRef}
      class={
        "group flex items-stretch border-b border-rim last:border-0 hover:bg-overlay transition-colors" 
			}
    >
      <VoteGutter post={p} handlers={props.handlers} />

      <div class="flex-1 min-w-0 flex flex-col">
        <div
          onClick={() => props.onOpenModal()}
          class="flex-1 min-w-0 px-3 pt-2.5 pb-1.5 cursor-pointer space-y-0.5"
        >
          <div class="flex items-center gap-1.5 min-w-0">
            <Show when={p.flags.includes("unseen")}>
              <span class="shrink-0 inline-flex px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-accent text-accent-fg leading-none">
                New
              </span>
            </Show>
            <Show
              when={p.title}
              fallback={
                <p class="text-sm font-semibold text-txt leading-snug line-clamp-1 min-w-0">
                  {preview()}
                </p>
              }
            >
              <p
                class="text-sm font-semibold text-txt leading-snug line-clamp-1 min-w-0"
                innerHTML={DOMPurify.sanitize(p.title!)}
                onClick={handleNsfwToggleClick}
              />
            </Show>
            <div class="ml-auto flex items-center gap-2 shrink-0">
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

          <Show when={p.title && preview()}>
            <p class="text-xs text-muted leading-relaxed line-clamp-2">
              {preview()}
            </p>
          </Show>

          <div class="flex items-center gap-1.5 pt-0.5">
            <Show
              when={p.authorAvatar}
              fallback={
                <div class="w-4 h-4 rounded-full bg-accent-muted text-accent flex items-center justify-center text-[0.5625rem] font-bold shrink-0 uppercase">
                  {p.authorName?.[0] ?? "?"}
                </div>
              }
            >
              <img
                src={p.authorAvatar}
                alt={p.authorName}
                class="w-4 h-4 rounded-full object-cover shrink-0"
              />
            </Show>
            <span class="text-[0.6875rem] text-muted font-medium truncate">
              {p.authorName}
            </span>
            <span class="text-[0.6875rem] text-muted/50">·</span>
            <span
              class="text-[0.6875rem] text-muted whitespace-nowrap"
              title={new Date(p.created + "Z").toLocaleString(locale())}
            >
              {formatPostDate(p.created, locale())}
            </span>
          </div>

          <DmRecipients
            recipients={isDirectMessage() ? p.recipients : undefined}
            class="text-[0.6875rem] text-muted truncate"
          />
        </div>

        <RowDetails
          post={p}
          replyCount={replyCount()}
          replyLabel={
            replyCount() === 1
              ? t("post.comments_singular")
              : t("post.comments_plural")
          }
          onReplies={() => props.onOpenModal()}
          handlers={props.handlers}
        />
      </div>
    </div>
  );
}

// ── inbox mode internals (inline thread expansion) ────────────────────────────

function MessageRow(props: {
  msg: ThreadNode;
  depth: number;
  handlers: StreamHandlers;
  locale: string;
}) {
  const { t } = useI18n();
  const auth = useAuth();
  const canInteract = () => auth()?.isLoggedIn === true;
  return (
    <div
      class="flex gap-2.5 px-3 py-2.5"
      style={{ "padding-left": `${12 + props.depth * 20}px` }}
    >
      <Show
        when={props.msg.authorAvatar}
        fallback={
          <div class="w-6 h-6 rounded-full bg-accent-muted text-accent flex items-center justify-center text-[0.625rem] font-bold shrink-0 mt-0.5 uppercase">
            {props.msg.authorName?.[0] ?? "?"}
          </div>
        }
      >
        <img
          src={props.msg.authorAvatar}
          alt={props.msg.authorName}
          class="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5"
        />
      </Show>
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-1.5 mb-0.5">
          <span class="text-[0.6875rem] font-semibold text-txt">
            {props.msg.authorName}
          </span>
          <span
            class="text-[0.625rem] text-muted"
            title={new Date(props.msg.created + "Z").toLocaleString(
              props.locale,
            )}
          >
            {formatPostDate(props.msg.created, props.locale)}
          </span>
        </div>
        <div
          class="text-sm text-txt/80 leading-relaxed [&>p]:my-0.5 [&_img]:max-w-xs [&_img]:rounded"
          innerHTML={props.msg.body}
          onClick={handleNsfwToggleClick}
        />
        <Show when={canInteract()}>
          <button
            onClick={() => props.handlers.onLike(props.msg.mid)}
            class="mt-1 flex items-center gap-1 text-[0.625rem] transition-colors"
            classList={{
              "text-accent": props.msg.viewerLiked,
              "text-subtle hover:text-accent": !props.msg.viewerLiked,
            }}
          >
            <svg
              class="w-3 h-3"
              fill={props.msg.viewerLiked ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M18 15l-6-6-6 6"
              />
            </svg>
            <Show when={props.msg.likeCount > 0}>{props.msg.likeCount}</Show>
            <span>{t("post.like")}</span>
          </button>
        </Show>
      </div>
    </div>
  );
}

function ThreadedNodes(props: {
  nodes: ThreadNode[];
  depth: number;
  handlers: StreamHandlers;
  locale: string;
}) {
  return (
    <For each={props.nodes}>
      {(node) => (
        <>
          <MessageRow
            msg={node}
            depth={props.depth}
            handlers={props.handlers}
            locale={props.locale}
          />
          <Show when={node.children.length > 0}>
            <ThreadedNodes
              nodes={node.children}
              depth={props.depth + 1}
              handlers={props.handlers}
              locale={props.locale}
            />
          </Show>
        </>
      )}
    </For>
  );
}

function InlineThread(props: {
  thread: ThreadNode;
  handlers: StreamHandlers;
  profileUid: number;
}) {
  const threadMode = useThreadMode();
  const flat = () => flattenThread(props.thread);
  const { locale } = useI18n();
  const auth = useAuth();

  return (
    <div
      class="border-t border-rim bg-base"
      onClick={(e) => e.stopPropagation()}
    >
      <div class="max-h-[60vh] overflow-y-auto divide-y divide-rim">
        <Show
          when={threadMode()}
          fallback={
            <For each={flat()}>
              {(msg, i) => (
                <MessageRow
                  msg={msg as ThreadNode}
                  depth={i() === 0 ? 0 : 1}
                  handlers={props.handlers}
                  locale={locale()}
                />
              )}
            </For>
          }
        >
          <MessageRow
            msg={props.thread}
            depth={0}
            handlers={props.handlers}
            locale={locale()}
          />
          <ThreadedNodes
            nodes={props.thread.children}
            depth={1}
            handlers={props.handlers}
            locale={locale()}
          />
        </Show>
      </div>

      <Show when={auth()?.isLoggedIn && props.thread.iid && props.thread.canComment !== false}>
        <div class="px-3 py-2.5 border-t border-rim bg-surface/40">
          <CommentComposer
            parentUuid={props.thread.uuid}
            profileUid={props.profileUid}
            onSubmitted={(body) =>
              props.handlers.onComment(
                props.thread.mid,
                body,
                props.thread.authorName,
                props.thread.authorAvatar,
              )
            }
          />
        </div>
      </Show>
    </div>
  );
}

// Persists expanded state across remounts caused by thread reference updates.
const expandedByMid = new Set<string>();

// ── inbox mode row (expands inline thread) ────────────────────────────────────

function InboxRow(props: {
  thread: ThreadNode;
  handlers: StreamHandlers;
  profileUid: number;
}) {
  const p = props.thread;
  const [expanded, setExpanded] = createSignal(expandedByMid.has(p.mid));
  const [commentsLoaded, setCommentsLoaded] = createSignal(
    p.children.length > 0,
  );
  const [commentsLoading, setCommentsLoading] = createSignal(false);
  const commentsOffset = () => p.commentsOffset ?? 0;
  const [loadingMoreComments, setLoadingMoreComments] = createSignal(false);
  const commentOrder = useCommentOrder();
  const { locale, t } = useI18n();
  let rowRef!: HTMLDivElement;

  onMount(() => {
    if (!p.uuid || !p.flags.includes("unseen")) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          markItemSeen(p.uuid);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(rowRef);
    onCleanup(() => observer.disconnect());
  });

  // Same rationale as PostCard's totalComments(): trust the server aggregate
  // while more comment pages remain unfetched, or the badge undercounts as
  // soon as the first page loads.
  const replyCount = () =>
    !p.hasMoreComments && p.children.length > 0
      ? flattenThread(p).filter((n) => !REACTION_VERBS.has(n.verb ?? ""))
          .length - 1
      : (p.commentCount ?? 0);
  const participants = () => getParticipants(p);

  async function toggleExpand() {
    const next = !expanded();
    if (next) expandedByMid.add(p.mid);
    else expandedByMid.delete(p.mid);
    setExpanded(next);

    if (next && !commentsLoaded() && (p.commentCount ?? 0) > 0) {
      setCommentsLoading(true);
      try {
        await props.handlers.onLoadComments(p.mid, p.uuid);
        setCommentsLoaded(true);
      } finally {
        setCommentsLoading(false);
      }
    }
  }

  async function loadMoreComments() {
    if (!props.handlers.onLoadMoreComments || loadingMoreComments()) return;
    setLoadingMoreComments(true);
    try {
      // Inline thread view only exposes top-level "load more" — no per-branch
      // buttons here, so this is always a roots/flat-page continuation.
      await props.handlers.onLoadMoreComments(p.uuid, p.mid, true, commentsOffset(), commentOrder());
    } finally {
      setLoadingMoreComments(false);
    }
  }

  const preview = () => rowPreview(p);
  const isUnread = () => !p.viewerLiked && replyCount() === 0;
  const isUnseen = () => p.flags.includes("unseen");
  const isPinned = () => p.pinned ?? false;
  // A non-root item can only reach the top-level posts array in a flat
  // (nouveau/unthreaded) listing — real comments are nested as .children elsewhere.
  const isFlatReply = () => !isRootPost(p);
  const isDirectMessage = () => isDM(p);

  return (
    <div
      ref={rowRef}
      class="group border-b border-rim last:border-0 flex items-stretch hover:bg-overlay transition-colors"
      classList={{
        "bg-accent-muted/10": expanded(),
        "border-l-2 border-l-violet-500/60 bg-violet-500/[0.04]": isDirectMessage(),
        "border-l-2 border-l-accent/50": !isDirectMessage() && isFlatReply(),
      }}
    >
      <VoteGutter post={p} handlers={props.handlers} />

      <div class="flex-1 min-w-0 flex flex-col">
        <div
          onClick={toggleExpand}
          class="flex-1 min-w-0 px-3 pt-2.5 pb-1.5 cursor-pointer space-y-0.5 select-none"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && toggleExpand()}
        >
          <div class="flex items-center gap-1.5">
            <Show when={isUnseen()}>
              <span class="px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-accent text-accent-fg leading-none shrink-0">
                New
              </span>
            </Show>
            <Show
              when={p.title}
              fallback={
                <p class="text-sm font-semibold text-txt leading-snug line-clamp-1">
                  {preview()}
                </p>
              }
            >
              <p
                class="text-sm font-semibold leading-snug line-clamp-1"
                classList={{
                  "text-accent": isUnread(),
                  "text-txt": !isUnread(),
                }}
                onClick={handleNsfwToggleClick}
                innerHTML={DOMPurify.sanitize(p.title!)}
              />
            </Show>
            <Show when={isPinned()}>
              <span
                class="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-fg leading-none shrink-0"
                title={t("post.pinned_indicator")}
              >
                <MdFillPush_pin size={11} />
              </span>
            </Show>
            <Show when={isDirectMessage()}>
              <span class="ml-auto shrink-0">
                <DmBadge size="md" />
              </span>
            </Show>
            <Show when={isFlatReply()}>
              <span
                class="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-accent-muted/40 text-muted leading-none shrink-0"
                title={t("post.reply_indicator")}
              >
                <MdOutlineReply size={11} />
                <span>{t("post.reply_badge")}</span>
              </span>
            </Show>
          </div>

          <Show when={p.title && preview()}>
            <p class="text-xs text-muted leading-relaxed line-clamp-2">
              {preview()}
            </p>
          </Show>

          <div class="flex items-center gap-1.5 pt-0.5 flex-wrap">
            <div class="flex -space-x-1 shrink-0">
              <For each={participants().slice(0, 3)}>
                {(name) => {
                  const node = flattenThread(p).find(
                    (n) => n.authorName === name,
                  );
                  return (
                    <Show
                      when={node?.authorAvatar}
                      fallback={
                        <div class="w-4 h-4 rounded-full ring-1 ring-base bg-accent-muted text-accent flex items-center justify-center text-[0.5625rem] font-bold uppercase shrink-0">
                          {name?.[0]}
                        </div>
                      }
                    >
                      <img
                        src={node!.authorAvatar}
                        alt={name}
                        class="w-4 h-4 rounded-full object-cover ring-1 ring-base shrink-0"
                      />
                    </Show>
                  );
                }}
              </For>
            </div>

            <span class="text-[0.6875rem] text-muted font-medium truncate max-w-[160px]">
              {participants().slice(0, 2).join(", ")}
            </span>
            <Show when={participants().length > 2}>
              <span class="text-[0.6875rem] text-muted">
                +{participants().length - 2}
              </span>
            </Show>

            <span class="text-[0.6875rem] text-muted/50">·</span>

            <span
              class="text-[0.6875rem] text-muted whitespace-nowrap"
              title={new Date(p.created + "Z").toLocaleString(locale())}
            >
              {formatPostDate(p.created, locale())}
            </span>

            <MdOutlineExpand_more class="w-3 h-3 text-muted/50 ml-auto transition-transform duration-200" classList={{ "rotate-180": expanded() }} />
          </div>

          <DmRecipients
            recipients={isDirectMessage() ? p.recipients : undefined}
            class="text-[0.6875rem] text-muted truncate"
          />
        </div>

        <RowDetails
          post={p}
          replyCount={replyCount()}
          replyLabel={replyCount() === 1 ? t("ui.reply") : t("ui.replies")}
          onReplies={toggleExpand}
          repliesActive={expanded()}
          handlers={props.handlers}
        />

        <Show when={expanded() && commentsLoading()}>
          <div class="px-3 py-2 text-xs text-muted animate-pulse border-t border-rim">
            {t("post.loading_comments")}
          </div>
        </Show>
        <Show when={expanded() && !commentsLoading()}>
          <InlineThread
            thread={p}
            handlers={props.handlers}
            profileUid={props.profileUid}
          />
          <Show when={p.hasMoreComments && props.handlers.onLoadMoreComments}>
            <button
              type="button"
              onClick={loadMoreComments}
              disabled={loadingMoreComments()}
              class="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium
                     text-muted hover:bg-overlay hover:text-txt transition-colors
                     border-t border-rim disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Show when={!loadingMoreComments()} fallback={<MdOutlineRefresh size={13} class="animate-spin" />}>
                <MdFillKeyboard_arrow_down size={13} />
              </Show>
              {loadingMoreComments() ? t("post.loading") : t("post.load_more_comments")}
            </button>
          </Show>
        </Show>
      </div>
    </div>
  );
}

// ── placeholder row ───────────────────────────────────────────────────────────

function ListRowPlaceholder() {
  return (
    <div class="flex items-stretch border-b border-rim last:border-0 animate-pulse">
      <div class="flex flex-col items-center justify-center gap-1 w-10 shrink-0 bg-surface/60 border-r border-rim px-1 py-3">
        <div class="w-3 h-3 bg-accent-muted rounded" />
        <div class="w-4 h-2 bg-accent-muted rounded" />
        <div class="w-3 h-3 bg-accent-muted rounded" />
      </div>

      <div class="flex-1 flex flex-col px-3 pt-2.5 pb-1.5 gap-1.5">
        <div class="h-3 bg-accent-muted rounded w-2/3" />
        <div class="h-2.5 bg-accent-muted rounded w-full" />
        <div class="h-2.5 bg-accent-muted rounded w-4/5" />
        <div class="flex items-center gap-1.5 mt-0.5">
          <div class="w-4 h-4 rounded-full bg-accent-muted shrink-0" />
          <div class="h-2 bg-accent-muted rounded w-20" />
          <div class="h-2 bg-accent-muted rounded w-10" />
        </div>
        <div class="flex items-center gap-2 mt-0.5">
          <div class="h-5 bg-accent-muted rounded w-14" />
          <div class="h-5 bg-accent-muted rounded w-20" />
        </div>
      </div>
    </div>
  );
}

// ── main export ───────────────────────────────────────────────────────────────

export default function ListView(props: {
  posts: ThreadNode[];
  handlers: StreamHandlers;
}) {
  const [modalUuid, setModalUuid] = createSignal<string | null>(null);
  const { t } = useI18n();
  const auth = useAuth();
  const listBehavior = useListBehavior();
  const profileUid = () => auth()?.uid ?? 0;

  return (
    <>
      <div class="bg-surface rounded-xl border border-rim shadow-sm overflow-hidden max-w-5xl mx-auto">
        <For
          each={props.posts}
          fallback={
            <div class="flex flex-col items-center justify-center py-16 gap-2 text-muted">
              <svg
                class="w-8 h-8 opacity-30"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p class="text-sm">{t("network.all_caught_up")}</p>
            </div>
          }
        >
          {(post, i) =>
            listBehavior() === "inbox" ? (
              <InboxRow
                thread={post}
                handlers={props.handlers}
                profileUid={profileUid()}
              />
            ) : (
              <ListRow
                post={post}
                handlers={props.handlers}
                index={i()}
                onOpenModal={() => setModalUuid(post.uuid)}
              />
            )
          }
        </For>
      </div>
      <Show when={listBehavior() === "list" && modalUuid()}>
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

export function ListPlaceholder(props: { count?: number }) {
  return (
    <div class="bg-surface rounded-xl border border-rim shadow-sm overflow-hidden max-w-5xl mx-auto">
      <For each={Array(props.count ?? 8).fill(0)}>
        {() => <ListRowPlaceholder />}
      </For>
    </div>
  );
}
