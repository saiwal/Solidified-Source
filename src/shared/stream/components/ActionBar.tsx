// src/shared/stream/components/ActionBar.tsx
import { Show } from "solid-js";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "../types";
import { MdOutlineFavorite_border, MdOutlineRefresh } from "solid-icons/md";
import { Button } from "@ui/Button";

export default function ActionBar(props: {
  post: ThreadNode;
  handlers: StreamHandlers;
}) {
  return (
    <div class="flex items-center gap-1 mt-3">
      <Button
        variant="ghost"
        size="sm"
        pressed={props.post.viewerLiked}
        onClick={() => props.handlers.onLike(props.post.mid)}
      >
        <MdOutlineFavorite_border class="w-3.5 h-3.5" />
        <Show when={props.post.likeCount > 0}><span>{props.post.likeCount}</span></Show>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        pressed={props.post.viewerDisliked}
        onClick={() => props.handlers.onDislike(props.post.mid)}
      >
        <svg class="w-3.5 h-3.5" fill={props.post.viewerDisliked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
        </svg>
        <Show when={props.post.dislikeCount > 0}><span>{props.post.dislikeCount}</span></Show>
      </Button>

      <Show when={!props.post.flags?.includes("private")}>
        <Button
          variant="ghost"
          size="sm"
          pressed={props.post.viewerRepeated}
          onClick={() => props.handlers.onRepeat(props.post.mid)}
        >
          <MdOutlineRefresh class="w-3.5 h-3.5" />
          <Show when={props.post.repeatCount > 0}><span>{props.post.repeatCount}</span></Show>
        </Button>
      </Show>
    </div>
  );
}
