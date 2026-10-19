// src/shared/stream/feedviews/NewspaperView.tsx
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { countAllComments, isRootPost } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "../types";
import { openPost } from "@/shared/views/modal-host";
import EventCard from "../components/EventCard";
import { parseEventData } from "@utsukta/spa-core/lib/activity.mapper";
import { excerptOf, firstImageSrc } from "./postExcerpt";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { UnseenBadge } from "../components/UnseenBadge";
import { useI18n } from "@utsukta/spa-core/i18n";
import formatPostDate from "@utsukta/spa-core/lib/date";
import { MdFillCheck, MdFillPush_pin, MdOutlineContent_copy, MdOutlineFavorite_border } from "solid-icons/md";
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
  return post.children.length > 0 ? Math.max(countAllComments(post.children), post.commentCount ?? 0) : (post.commentCount ?? 0);
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
  return (<>
    <UnseenBadge post={props.post} class="absolute top-2 left-2 z-10" />
    <Show when={props.post.pinned}>
      <span
        class="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-fg leading-none z-10"
        title={t("post.pinned_indicator")}
      >
        <MdFillPush_pin size={11} />
      </span>
    </Show>
  </>);
}

// ── lead story — the big headline at the top of the paper ───────────────────
// Flat (unthreaded) reply: on the same accent rail the other views use.
const REPLY_RAIL = "border-l-2 border-accent/40 pl-3";

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
      classList={{ "grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-6": hasText(), [REPLY_RAIL]: !isRootPost(props.post) }}
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
    <article onClick={props.onOpen} class="relative flex gap-3 cursor-pointer group" classList={{ [REPLY_RAIL]: !isRootPost(props.post) }}>
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
    <article onClick={props.onOpen} class="relative break-inside-avoid mb-5 cursor-pointer group" classList={{ [REPLY_RAIL]: !isRootPost(props.post) }}>
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
// Masthead "Vol. N · No. W": volume = channel age in years (1-based),
// number = ISO week of the year. No founding date = number only.
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

function roman(n: number): string {
  const map: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

export function issueLine(founded: string | null | undefined, now = new Date()): string {
  const no = `No. ${isoWeek(now)}`;
  const f = founded ? new Date(founded.replace(" ", "T") + "Z") : null;
  if (!f || isNaN(f.getTime())) return no;
  let years = now.getFullYear() - f.getFullYear();
  if (now.getMonth() < f.getMonth() || (now.getMonth() === f.getMonth() && now.getDate() < f.getDate())) years--;
  return `Vol. ${roman(Math.max(0, years) + 1)} · ${no}`;
}

export interface CategoryGroup { name: string; slug: string; posts: Post[] }

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

// Skybox: pinned teasers gliding left in a seamless loop. Once the row
// overflows, a second (inert) copy trails the first, and when the first has
// fully scrolled out the position drops back by exactly its width — the copy
// is then where the original was, so the wrap is invisible. Still a normal
// scroller underneath: swipe/wheel works, and the loop picks up from there.
// Pauses on hover/touch/focus; off entirely under prefers-reduced-motion.
const SKYBOX_SPEED_PX_S = 30;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Skybox(props: { posts: Post[] }) {
  const [looping, setLooping] = createSignal(false);
  let scroller!: HTMLDivElement;
  let track!: HTMLDivElement;

  onMount(() => {
    if (reducedMotion()) return;
    const ro = new ResizeObserver(() => setLooping(track.offsetWidth > scroller.clientWidth));
    ro.observe(scroller);
    ro.observe(track);

    let paused = false;
    const pause = () => { paused = true; };
    const resume = () => { paused = false; };
    scroller.addEventListener("pointerenter", pause);
    scroller.addEventListener("pointerleave", resume);
    scroller.addEventListener("touchstart", pause, { passive: true });
    scroller.addEventListener("touchend", resume);
    scroller.addEventListener("focusin", pause);
    scroller.addEventListener("focusout", resume);

    // scrollLeft rounds to whole pixels in some engines, so the position
    // lives in a float; a gap between the two means the user scrolled.
    let pos = 0;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      if (!paused && looping()) {
        if (Math.abs(scroller.scrollLeft - pos) > 2) pos = scroller.scrollLeft;
        pos += SKYBOX_SPEED_PX_S * dt;
        if (pos >= track.offsetWidth) pos -= track.offsetWidth;
        scroller.scrollLeft = pos;
      }
      raf = requestAnimationFrame(tick);
    });

    onCleanup(() => { cancelAnimationFrame(raf); ro.disconnect(); });
  });

  const items = () => (
    <For each={props.posts}>
      {(post) => (
        <div class="shrink-0 w-64 sm:w-72 px-3 border-r border-txt/20">
          <SkyboxTeaser post={post} />
        </div>
      )}
    </For>
  );

  return (
    <div
      ref={scroller}
      class="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-3 mb-3 border-b border-txt/30 text-left"
    >
      <div ref={track} class="flex shrink-0">{items()}</div>
      <Show when={looping()}>
        <div class="flex shrink-0" aria-hidden="true" inert>{items()}</div>
      </Show>
    </div>
  );
}


// One skybox teaser: thumbnail, bold kicker, a line or two of copy.
function SkyboxTeaser(props: { post: Post }) {
  const image = () => firstImageSrc(props.post.body);
  const excerpt = () => excerptOf(props.post, 110);
  return (
    <button
      type="button"
      onClick={() => openPost(props.post.uuid)}
      class="group flex items-start gap-2.5 min-w-0 text-left"
    >
      <Show when={image()}>
        {(src) => <img src={src()} alt="" class="w-12 h-12 shrink-0 rounded-sm object-cover border border-rim" />}
      </Show>
      <p class="min-w-0 font-serif text-xs leading-snug text-txt line-clamp-3">
        <Show when={props.post.title}>
          <span class="font-sans font-bold uppercase tracking-wide group-hover:text-accent transition-colors">
            {props.post.title}
          </span>
          <span class="text-muted"> | </span>
        </Show>
        <span class="group-hover:underline decoration-1 underline-offset-2">{excerpt() || props.post.authorName}</span>
      </p>
    </button>
  );
}

// Rendered by the widget above the feed toolbar (ChannelFeedShell `header`),
// not inside NewspaperView, so the sort bar sits under it and it stays up
// while posts load or when the feed is empty.
export function Masthead(props: {
  /** Channel name; falls back to the page nick until the profile loads. */
  title?: string;
  /** Channel avatar, shown beside the title like a paper's emblem. */
  emblem?: string;
  /** Channel creation datetime (UTC, "Y-m-d H:i:s") — sets the Vol. */
  founded?: string | null;
  /** Channel address (nick@host), copyable from the top-right ear. */
  address?: string;
  /** Profile description, set under the title as the paper's tagline. */
  tagline?: string;
  /** Pinned posts, teased in a strip above the nameplate (a paper's skybox). */
  pinned?: Post[];
}) {
  const { t, locale } = useI18n();
  const nick = usePageNick();
  const masthead = () => props.title || nick();
  const today = () =>
    new Date().toLocaleDateString(locale(), { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const [copied, setCopied] = createSignal(false);
  const copyAddress = (addr: string) =>
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  return (
    <header class="mb-4 text-center">
      <Show when={props.pinned?.length}>
        <Skybox posts={props.pinned!} />
      </Show>
      <Show when={props.address}>
        {(addr) => (
          <div class="flex justify-end mb-2">
            <button
              type="button"
              onClick={() => void copyAddress(addr())}
              title={t("ui.copy_address")}
              aria-label={t("ui.copy_address")}
              class="inline-flex items-center gap-1 max-w-full min-w-0 font-mono text-[0.6875rem] text-muted hover:text-accent transition-colors"
            >
              <span class="truncate">{addr()}</span>
              <Show when={copied()} fallback={<MdOutlineContent_copy size={12} class="shrink-0" />}>
                <MdFillCheck size={12} class="shrink-0 text-accent" />
              </Show>
            </button>
          </div>
        )}
      </Show>
      <div class="flex items-center justify-center gap-3 sm:gap-5 min-w-0">
        <Show when={props.emblem}>
          {(src) => (
            <A href={`/profile/${nick()}`} title={masthead()} class="shrink-0 rounded-full hover:opacity-80 transition-opacity">
              <img
                src={src()}
                alt={masthead()}
                class="size-[clamp(2.75rem,9vw,4.5rem)] rounded-full object-cover border-2 border-txt p-0.5"
              />
            </A>
          )}
        </Show>
        <h1 class="font-serif font-black tracking-tight text-txt text-[clamp(2rem,6vw,3.5rem)] leading-none min-w-0 break-words">
          {masthead()}
        </h1>
      </div>
      <Show when={props.tagline}>
        <p class="mt-2 font-serif italic text-sm sm:text-[1rem] text-txt/85 max-w-2xl mx-auto">{props.tagline}</p>
      </Show>
      <div class="mt-3 border-t-4 border-double border-txt" />
      <div class="flex items-center justify-between text-[0.6875rem] uppercase tracking-widest text-muted mt-1.5 font-sans">
        <span>{today()}</span>
        <div class="flex items-center gap-2">
          <span
            title={props.founded
              ? t("channel.channel_created_on", {
                  date: new Date(props.founded.replace(" ", "T") + "Z").toLocaleDateString(locale(), { dateStyle: "long" }),
                })
              : undefined}
          >
            {issueLine(props.founded)}
          </span>
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
  );
}

export function NewspaperPlaceholder() {
  return (
    <div class="max-w-6xl mx-auto animate-pulse">
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
  const open = (post: Pick<Post, "uuid">) => openPost(post.uuid);

  // Events get their own dedicated column below — keep them out of the
  // lead/secondary/wire-copy article flow so they aren't shown twice.
  const articlePosts = createMemo(() => props.posts.filter((post) => !eventOf(post)));

  // Pinned posts are teased in the masthead's skybox, so the paper itself
  // runs everything else, most recent first.
  const sorted = createMemo(() => articlePosts().filter((post) => !post.pinned));
  const lead = () => sorted()[0];
  const secondary = () => sorted().slice(1, 5);
  const wireCopy = () => sorted().slice(5);

  const events = createMemo(() =>
    props.posts
      .map((post) => ({ post, event: eventOf(post) }))
      .filter((e): e is { post: ThreadNode; event: NonNullable<ReturnType<typeof eventOf>> } => !!e.event)
      .sort((a, b) => a.event.start.localeCompare(b.event.start)),
  );

  const categoryGroups = () => props.categoryGroups ?? [];
  const [, setSearchParams] = useSearchParams();

  return (
    <div class="max-w-6xl mx-auto">
      <Show when={lead()} fallback={<p class="text-center py-16 text-muted text-sm">{t("network.all_caught_up")}</p>}>
        {/* Lead story */}
        <div class="pb-8 border-b-2 border-txt/80">
          <LeadStory post={lead()} onOpen={() => open(lead())} handlers={props.handlers} />
        </div>

        {/* Secondary headlines */}
        <Show when={secondary().length > 0}>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 py-6 border-b-2 border-txt/80">
            <For each={secondary()}>
              {(post) => <SecondaryStory post={post} onOpen={() => open(post)} handlers={props.handlers} />}
            </For>
          </div>
        </Show>

        {/* Sections — latest articles per category */}
        <Show when={categoryGroups().length > 0}>
          <section class="mt-8 pb-6 border-b-4 border-double border-txt">
            <h2 class="font-serif text-lg font-black uppercase tracking-wide text-txt mb-4">Sections</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <For each={categoryGroups()}>
                {(group, i) => (
                  <div class={`border-t-4 pt-3 ${SECTION_ACCENTS[i() % SECTION_ACCENTS.length]}`}>
                    <h3 class="font-serif font-bold text-sm uppercase tracking-wide text-txt mb-2">
                      {/* Same filter as the category widget: ?cat=, tag cleared */}
                      <a
                        href={`?cat=${encodeURIComponent(group.slug)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setSearchParams({ cat: group.slug, tag: undefined });
                        }}
                        class="hover:underline decoration-2 underline-offset-2"
                      >
                        {group.name}
                      </a>
                    </h3>
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
          class="grid grid-cols-1 gap-x-10 gap-y-8 pt-8"
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
