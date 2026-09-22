// src/shared/stream/feedviews/ScrapbookView.tsx
import { For, Show, createSignal, createMemo } from "solid-js";
import { splitIntoColumns, useColumnCount } from "@utsukta/spa-core/lib/masonry";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { countAllComments } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "../types";
import { openPost } from "@/shared/views/modal-host";
import { excerptOf, firstImageSrc } from "./postExcerpt";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import formatPostDate from "@utsukta/spa-core/lib/date";
import { MdFillPush_pin, MdOutlineFavorite_border } from "solid-icons/md";

const ROTATIONS = ["-rotate-3", "rotate-2", "-rotate-1", "rotate-3", "-rotate-2", "rotate-1"];
const NOTE_COLORS = [
  "bg-amber-100 dark:bg-amber-200",
  "bg-sky-100 dark:bg-sky-200",
  "bg-rose-100 dark:bg-rose-200",
  "bg-lime-100 dark:bg-lime-200",
];

// Deterministic per-post pick (not Math.random()): masonry rebalances columns as
// new posts load, remounting existing cards, so a random pick made in the render
// callback would reroll every time a post moves — this stays stable per post.uuid.
function pickFor<T>(seed: string, options: T[]): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(hash) % options.length];
}

function replyCountOf(post: ThreadNode): number {
  return post.children.length > 0 ? countAllComments(post.children) : (post.commentCount ?? 0);
}

// Small ink-stamp footer shared by both card styles — always dark-on-light,
// since it sits on physical "paper" that doesn't follow the app theme.
function Stamp(props: { post: ThreadNode; handlers: StreamHandlers }) {
  const p = props.post;
  const auth = useAuth();
  const canInteract = () => auth()?.isLoggedIn === true;
  const { locale } = useI18n();
  return (
    <div class="flex items-center gap-2 mt-2 text-[0.6875rem] text-neutral-500" onClick={(e) => e.stopPropagation()}>
      <span class="font-semibold text-neutral-700 truncate">{p.authorName}</span>
      <span class="shrink-0">· {formatPostDate(p.created, locale())}</span>
      <span class="ml-auto flex items-center gap-2 shrink-0">
        <Show when={canInteract()}>
          <button
            onClick={() => props.handlers.onLike(p.mid)}
            class="flex items-center gap-0.5 transition-colors"
            classList={{ "text-rose-500": p.viewerLiked, "hover:text-rose-500": !p.viewerLiked }}
          >
            <MdOutlineFavorite_border class="w-3 h-3" />
            <Show when={p.likeCount > 0}>{p.likeCount}</Show>
          </button>
        </Show>
        <Show when={replyCountOf(p) > 0}>
          <span>💬 {replyCountOf(p)}</span>
        </Show>
      </span>
    </div>
  );
}

function PhotoCard(props: { post: ThreadNode; src: string; rotate: string; handlers: StreamHandlers; onOpen: () => void }) {
  return (
    <div class={`${props.rotate} hover:rotate-0 hover:scale-[1.02] transition-transform duration-200
                  mb-5 bg-white p-3 pb-3 shadow-[0_4px_10px_rgba(0,0,0,0.25)] cursor-pointer relative`}
      onClick={props.onOpen}
    >
      {/* pushpin */}
      <span class="absolute -top-2.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_2px_3px_rgba(0,0,0,0.4)] ring-2 ring-red-700/40 z-10" />
      <Show when={props.post.pinned}>
        <span class="absolute top-2 right-2 z-10 text-white bg-black/60 rounded-full p-1" title="Pinned">
          <MdFillPush_pin size={11} />
        </span>
      </Show>
      <img src={props.src} alt="" class="w-full aspect-square object-cover" />
      <Show when={props.post.title || excerptOf(props.post, 80)}>
        <p class="mt-2 text-sm font-serif text-neutral-800 line-clamp-2">
          {props.post.title || excerptOf(props.post, 80)}
        </p>
      </Show>
      <Stamp post={props.post} handlers={props.handlers} />
    </div>
  );
}

function StickyNote(props: { post: ThreadNode; rotate: string; color: string; handlers: StreamHandlers; onOpen: () => void }) {
  return (
    <div
      class={`${props.rotate} ${props.color} hover:rotate-0 hover:scale-[1.02] transition-transform duration-200
              mb-5 p-4 shadow-[0_4px_10px_rgba(0,0,0,0.2)] cursor-pointer relative`}
      onClick={props.onOpen}
    >
      {/* tape */}
      <span class="absolute -top-2 left-1/2 -translate-x-1/2 w-14 h-4 bg-neutral-100/60 dark:bg-neutral-100/50 rotate-2 shadow-sm" />
      <Show when={props.post.pinned}>
        <span class="absolute top-2 right-2 text-neutral-700" title="Pinned">
          <MdFillPush_pin size={13} />
        </span>
      </Show>
      <p class="font-serif text-[0.9375rem] leading-snug text-neutral-800 line-clamp-6">
        {props.post.title || excerptOf(props.post, 220)}
      </p>
      <Stamp post={props.post} handlers={props.handlers} />
    </div>
  );
}

const PLACEHOLDER_HEIGHTS = ["h-32", "h-44", "h-40", "h-28", "h-52", "h-36"];

export function ScrapbookCardPlaceholder(props: { index: number }) {
  return (
    <div
      class={`${ROTATIONS[props.index % ROTATIONS.length]} mb-5
              bg-surface border border-rim p-3 shadow-sm animate-pulse`}
    >
      <div class={`w-full ${PLACEHOLDER_HEIGHTS[props.index % PLACEHOLDER_HEIGHTS.length]} bg-accent-muted rounded-sm`} />
      <div class="h-3 bg-accent-muted rounded w-4/5 mt-2" />
      <div class="flex items-center gap-2 mt-2">
        <div class="h-2.5 bg-accent-muted rounded w-16" />
        <div class="h-2.5 bg-accent-muted rounded w-10 ml-auto" />
      </div>
    </div>
  );
}

export function ScrapbookPlaceholder(props: { count?: number }) {
  const [gridEl, setGridEl] = createSignal<HTMLDivElement>();
  const colCount = useColumnCount(gridEl, 16, 4);
  const columns = createMemo(() => splitIntoColumns(Array(props.count ?? 8).fill(0), colCount()));
  return (
    <div class="max-w-6xl mx-auto">
      <div class="flex gap-5 items-start" ref={setGridEl}>
        <For each={columns()}>
          {(col) => (
            <div class="flex-1 flex flex-col min-w-0">
              <For each={col}>{(_, i) => <ScrapbookCardPlaceholder index={i()} />}</For>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

export default function ScrapbookView(props: { posts: ThreadNode[]; handlers: StreamHandlers }) {
  const { t } = useI18n();
  const [gridEl, setGridEl] = createSignal<HTMLDivElement>();
  const colCount = useColumnCount(gridEl, 16, 4);
  const columns = createMemo(() => splitIntoColumns(props.posts, colCount()));

  return (
    <div class="max-w-6xl mx-auto">
      <Show
        when={props.posts.length > 0}
        fallback={<p class="text-center py-16 text-muted text-sm">{t("network.all_caught_up")}</p>}
      >
        <div class="flex gap-5 items-start" ref={setGridEl}>
          <For each={columns()}>
            {(col) => (
              <div class="flex-1 flex flex-col min-w-0">
                <For each={col}>
                  {(post) => {
                    const src = firstImageSrc(post.body);
                    const rotate = pickFor(post.uuid, ROTATIONS);
                    const onOpen = () => openPost(post.uuid);
                    return src ? (
                      <PhotoCard post={post} src={src} rotate={rotate} handlers={props.handlers} onOpen={onOpen} />
                    ) : (
                      <StickyNote post={post} rotate={rotate} color={pickFor(post.uuid + ":c", NOTE_COLORS)} handlers={props.handlers} onOpen={onOpen} />
                    );
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>

    </div>
  );
}
