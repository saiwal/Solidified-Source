// src/shared/stream/feedviews/NewspaperView.tsx
import { For, Show, createMemo } from "solid-js";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { countAllComments } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "../types";
import { openPost } from "@/shared/views/modal-host";
import EventCard from "../components/EventCard";
import { parseEventData } from "@utsukta/spa-core/lib/activity.mapper";
import { excerptOf, firstImageSrc } from "./postExcerpt";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import formatPostDate from "@utsukta/spa-core/lib/date";
import { MdFillPush_pin, MdOutlineFavorite_border } from "solid-icons/md";
import { BiRegularRss } from "solid-icons/bi";
import { openFeedModal } from "@utsukta/spa-core/store/feed-modal";

function eventOf(post: ThreadNode) {
  return post.eventData ?? (post.body.includes("[event-summary]") ? parseEventData(post.body) : undefined);
}

function headlineOf(post: Pick<Post, "title" | "body" | "bodyNsfw" | "eventData">): string {
  if (post.title) return post.title;
  const text = excerptOf(post, 90);
  return text || "Untitled dispatch";
}

function replyCountOf(post: ThreadNode): number {
  return post.children.length > 0 ? countAllComments(post.children) : (post.commentCount ?? 0);
}

// ── byline / stats footer, shared by every headline size ────────────────────
function Byline(props: { post: ThreadNode; onOpen: () => void; handlers: StreamHandlers }) {
  const { t, locale } = useI18n();
  const auth = useAuth();
  const canInteract = () => auth()?.isLoggedIn === true;
  return (
    <div class="flex items-end justify-between gap-3 text-[0.6875rem] text-muted mt-2 font-sans">
      <div class="leading-tight min-w-0">
        <p class="uppercase tracking-wide truncate">By <span class="font-semibold">{props.post.authorName}</span></p>
        <p title={new Date(props.post.created + "Z").toLocaleString(locale())}>
          {formatPostDate(props.post.created, locale())}
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        <Show when={replyCountOf(props.post) > 0}>
          <span>{replyCountOf(props.post)} {t(replyCountOf(props.post) === 1 ? "post.comments_singular" : "post.comments_plural")}</span>
        </Show>
        <Show when={canInteract()}>
          <button
            onClick={() => props.handlers.onLike(props.post.mid)}
            class="flex items-center gap-1 transition-colors"
            classList={{ "text-accent": props.post.viewerLiked, "hover:text-accent": !props.post.viewerLiked }}
          >
            <MdOutlineFavorite_border class="w-3 h-3" />
            <Show when={props.post.likeCount > 0}>{props.post.likeCount}</Show>
          </button>
        </Show>
      </div>
    </div>
  );
}

function PinRibbon(props: { post: ThreadNode }) {
  const { t } = useI18n();
  return (
    <Show when={props.post.pinned}>
      <span
        class="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-fg leading-none z-10"
        title={t("post.pinned_indicator")}
      >
        <MdFillPush_pin size={11} />
      </span>
    </Show>
  );
}

// ── lead story — the big headline at the top of the paper ───────────────────
function LeadStory(props: { post: ThreadNode; onOpen: () => void; handlers: StreamHandlers }) {
  const image = () => firstImageSrc(props.post.body);
  const excerpt = () => excerptOf(props.post, 320);
  // Image-only posts (no title, no body text) have nothing to put in a text
  // column — forcing the two-column layout then leaves it empty and the
  // grid looks broken on wide screens. Fall back to a plain stacked layout.
  const hasText = () => !!(props.post.title || excerpt());

  return (
    <article
      onClick={props.onOpen}
      class="relative cursor-pointer group"
      classList={{ "grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-6": hasText() }}
    >
      <PinRibbon post={props.post} />
      <Show when={image()}>
        {(src) => (
          <div
            class="overflow-hidden rounded-sm border border-rim"
            classList={{ "order-1 md:order-2": hasText() }}
          >
            <img
              src={src()}
              alt=""
              class="w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              classList={{ "h-56 md:h-full": hasText(), "h-72 sm:h-96": !hasText() }}
            />
          </div>
        )}
      </Show>
      <div classList={{ "order-2 md:order-1 min-w-0": hasText(), "mt-4": !hasText() && !!image() }}>
        <Show when={props.post.title}>
          <h2 class="font-serif font-black text-3xl md:text-4xl leading-[1.05] text-txt group-hover:underline decoration-2 underline-offset-2">
            {props.post.title}
          </h2>
        </Show>
        <Show when={excerpt()}>
          <p
            class="font-serif text-[0.9375rem] leading-relaxed text-txt/85
                   first-letter:float-left first-letter:font-black first-letter:text-5xl
                   first-letter:leading-[0.8] first-letter:pr-2 first-letter:pt-1"
            classList={{ "mt-3": !!props.post.title }}
          >
            {excerpt()}
          </p>
        </Show>
        <Byline post={props.post} onOpen={props.onOpen} handlers={props.handlers} />
      </div>
    </article>
  );
}

// ── secondary headlines — the smaller stories under the lead ────────────────
function SecondaryStory(props: { post: ThreadNode; onOpen: () => void; handlers: StreamHandlers }) {
  const image = () => firstImageSrc(props.post.body);
  const excerpt = () => excerptOf(props.post, props.post.title ? 120 : 140);
  return (
    <article onClick={props.onOpen} class="relative flex gap-3 cursor-pointer group">
      <PinRibbon post={props.post} />
      <Show
        when={image()}
        fallback={
          <div class="w-16 h-16 shrink-0 rounded-sm bg-accent-muted flex items-center justify-center font-serif font-black text-xl text-accent">
            {headlineOf(props.post)[0]?.toUpperCase() ?? "?"}
          </div>
        }
      >
        {(src) => <img src={src()} alt="" class="w-16 h-16 shrink-0 rounded-sm object-cover border border-rim" />}
      </Show>
      <div class="min-w-0">
        <Show when={props.post.title}>
          <h3 class="font-serif font-bold text-base leading-snug text-txt group-hover:underline decoration-2 underline-offset-2 line-clamp-2">
            {props.post.title}
          </h3>
        </Show>
        <Show when={excerpt()}>
          <p
            class="text-xs text-muted leading-relaxed line-clamp-2 font-sans"
            classList={{ "mt-1": !!props.post.title }}
          >
            {excerpt()}
          </p>
        </Show>
        <Byline post={props.post} onOpen={props.onOpen} handlers={props.handlers} />
      </div>
    </article>
  );
}

// ── wire copy — dense, image-free, dateline-style text blocks ───────────────
function WireItem(props: { post: ThreadNode; onOpen: () => void; handlers: StreamHandlers }) {
  const { locale } = useI18n();
  return (
    <article onClick={props.onOpen} class="relative break-inside-avoid mb-5 cursor-pointer group">
      <PinRibbon post={props.post} />
      <p class="font-mono text-[0.625rem] tracking-widest uppercase text-subtle">
        {props.post.authorName} — {new Date(props.post.created + "Z").toLocaleDateString(locale(), { month: "short", day: "numeric" })}
      </p>
      <h4 class="font-serif font-bold text-[0.9375rem] leading-snug text-txt group-hover:underline decoration-2 underline-offset-2 mt-0.5">
        {headlineOf(props.post)}
      </h4>
      <p class="text-[0.8125rem] text-muted leading-relaxed line-clamp-3 mt-1 font-sans">
        {excerptOf(props.post, 160)}
      </p>
      <Byline post={props.post} onOpen={props.onOpen} handlers={props.handlers} />
      <div class="mt-3 border-b border-rim" />
    </article>
  );
}

const SECTION_ACCENTS = [
  "border-amber-500", "border-sky-500", "border-rose-500",
  "border-emerald-500", "border-violet-500", "border-orange-500",
];

// Channel posts don't carry their own category terms in the stream response
// (categories are only exposed in aggregate via /spa/stream-widgets/categories)
// — so the widget fetches "latest posts per category" itself and hands the
// result down here; this view just renders whatever it's given.
export interface CategoryGroup { name: string; posts: Post[] }

export function WireItemPlaceholder() {
  return (
    <div class="break-inside-avoid mb-5 space-y-1.5 animate-pulse">
      <div class="h-2 bg-accent-muted rounded w-1/3" />
      <div class="h-3.5 bg-accent-muted rounded w-full" />
      <div class="h-3 bg-accent-muted rounded w-full" />
      <div class="h-3 bg-accent-muted rounded w-4/5" />
    </div>
  );
}

export function NewspaperPlaceholder() {
  return (
    <div class="max-w-6xl mx-auto animate-pulse">
      <header class="mb-8 text-center">
        <div class="h-10 sm:h-14 bg-accent-muted rounded w-2/3 mx-auto" />
        <div class="mt-3 border-t-4 border-double border-txt/20" />
        <div class="flex items-center justify-between mt-1.5">
          <div class="h-2.5 bg-accent-muted rounded w-24" />
          <div class="h-2.5 bg-accent-muted rounded w-20" />
        </div>
      </header>

      <div class="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-6 pb-8 border-b-2 border-txt/10">
        <div>
          <div class="h-8 bg-accent-muted rounded w-5/6 mb-2" />
          <div class="h-8 bg-accent-muted rounded w-3/4 mb-4" />
          <div class="space-y-2">
            <div class="h-3 bg-accent-muted rounded w-full" />
            <div class="h-3 bg-accent-muted rounded w-full" />
            <div class="h-3 bg-accent-muted rounded w-5/6" />
          </div>
        </div>
        <div class="h-56 md:h-full bg-accent-muted rounded-sm" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 py-6 border-b-2 border-txt/10">
        <For each={Array(4).fill(0)}>
          {() => (
            <div class="flex gap-3">
              <div class="w-16 h-16 shrink-0 rounded-sm bg-accent-muted" />
              <div class="flex-1 space-y-1.5">
                <div class="h-3.5 bg-accent-muted rounded w-full" />
                <div class="h-3.5 bg-accent-muted rounded w-4/5" />
                <div class="h-2.5 bg-accent-muted rounded w-1/2" />
              </div>
            </div>
          )}
        </For>
      </div>

      <div class="columns-1 sm:columns-2 gap-x-8 pt-6">
        <For each={Array(4).fill(0)}>{() => <WireItemPlaceholder />}</For>
      </div>
    </div>
  );
}

export default function NewspaperView(props: {
  posts: ThreadNode[];
  handlers: StreamHandlers;
  categoryGroups?: CategoryGroup[];
}) {
  const { t, locale } = useI18n();
  const nick = usePageNick();
  const open = (post: Pick<Post, "uuid">) => openPost(post.uuid);

  // Events get their own dedicated column below — keep them out of the
  // lead/secondary/wire-copy article flow so they aren't shown twice.
  const articlePosts = createMemo(() => props.posts.filter((post) => !eventOf(post)));

  // Pinned posts lead the paper — stable sort keeps posts otherwise in their
  // existing (most-recent-first) order.
  const sorted = createMemo(() =>
    [...articlePosts()].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)),
  );
  const lead = () => sorted()[0];
  const secondary = () => sorted().slice(1, 5);
  const wireCopy = () => sorted().slice(5);
  const masthead = () => sorted()[0]?.authorName ?? nick();

  const events = createMemo(() =>
    props.posts
      .map((post) => ({ post, event: eventOf(post) }))
      .filter((e): e is { post: ThreadNode; event: NonNullable<ReturnType<typeof eventOf>> } => !!e.event)
      .sort((a, b) => a.event.start.localeCompare(b.event.start)),
  );

  const categoryGroups = () => props.categoryGroups ?? [];

  const today = () =>
    new Date().toLocaleDateString(locale(), { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div class="max-w-6xl mx-auto">
      <Show when={lead()} fallback={<p class="text-center py-16 text-muted text-sm">{t("network.all_caught_up")}</p>}>
        {/* Masthead */}
        <header class="mb-8 text-center">
          <h1 class="font-serif font-black tracking-tight text-txt text-[clamp(2rem,6vw,3.5rem)] leading-none">
            {masthead()}
          </h1>
          <div class="mt-3 border-t-4 border-double border-txt" />
          <div class="flex items-center justify-between text-[0.6875rem] uppercase tracking-widest text-muted mt-1.5 font-sans">
            <span>{today()}</span>
            <div class="flex items-center gap-2">
              <span>Vol. I · No. {sorted().length}</span>
              <button
                onClick={() => openFeedModal(nick())}
                title={t("channel.rss_feed")}
                aria-label={t("channel.rss_feed")}
                class="p-1 rounded-full border border-rim text-muted hover:text-accent hover:border-accent transition-colors normal-case tracking-normal"
              >
                <BiRegularRss size={12} />
              </button>
            </div>
          </div>
        </header>

        {/* Lead story */}
        <div class="pb-8 border-b-2 border-txt/80">
          <LeadStory post={lead()} onOpen={() => open(lead())} handlers={props.handlers} />
        </div>

        {/* Secondary headlines — together with the lead, these are the pinned/featured stories */}
        <Show when={secondary().length > 0}>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 py-6 border-b-2 border-txt/80">
            <For each={secondary()}>
              {(post) => <SecondaryStory post={post} onOpen={() => open(post)} handlers={props.handlers} />}
            </For>
          </div>
        </Show>

        {/* Sections — latest articles per category */}
        <Show when={categoryGroups().length > 0}>
          <section class="my-8 pb-6 border-b-4 border-double border-txt">
            <h2 class="font-serif text-lg font-black uppercase tracking-wide text-txt mb-4">Sections</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <For each={categoryGroups()}>
                {(group, i) => (
                  <div class={`border-t-4 pt-3 ${SECTION_ACCENTS[i() % SECTION_ACCENTS.length]}`}>
                    <h3 class="font-serif font-bold text-sm uppercase tracking-wide text-txt mb-2">{group.name}</h3>
                    <ul class="space-y-2.5">
                      <For each={group.posts}>
                        {(post) => (
                          <li onClick={() => open(post)} class="cursor-pointer group">
                            <p class="text-sm font-semibold text-txt leading-snug line-clamp-2 group-hover:underline decoration-2 underline-offset-2">
                              {headlineOf(post)}
                            </p>
                            <p class="text-[0.6875rem] text-muted mt-0.5">{formatPostDate(post.created, locale())}</p>
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                )}
              </For>
            </div>
          </section>
        </Show>

        <div
          class="grid grid-cols-1 gap-x-10 gap-y-8"
          classList={{ "lg:grid-cols-[minmax(0,1fr)_280px]": events().length > 0 }}
        >
          <div class="min-w-0">
            {/* Wire copy */}
            <Show when={wireCopy().length > 0}>
              <div class="columns-1 sm:columns-2 gap-x-8">
                <For each={wireCopy()}>
                  {(post) => <WireItem post={post} onOpen={() => open(post)} handlers={props.handlers} />}
                </For>
              </div>
            </Show>
          </div>

          {/* Events sidebar */}
          <Show when={events().length > 0}>
            <aside class="lg:border-l lg:border-rim lg:pl-8">
              <h2 class="font-serif text-sm font-bold uppercase tracking-wide text-txt mb-3 pb-2 border-b-2 border-txt/80">
                {t("network.events")}
              </h2>
              <div class="space-y-5">
                <For each={events()}>
                  {(e) => (
                    <div class="text-sm border-b border-rim pb-4 last:border-0">
                      <p class="font-serif font-semibold text-txt line-clamp-2">{e.event.summary}</p>
                      <EventCard post={e.post} event={e.event} />
                    </div>
                  )}
                </For>
              </div>
            </aside>
          </Show>
        </div>
      </Show>

    </div>
  );
}
