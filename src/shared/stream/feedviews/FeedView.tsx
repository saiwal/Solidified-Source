// src/shared/stream/feedviews/FeedView.tsx
import { For } from "solid-js";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "../types";
import PostCard from "../components/PostCard";
import { openPost } from "@/shared/views/modal-host";
import { useI18n } from "@utsukta/spa-core/i18n";

export function FeedPlaceholder() {
  return (
    <div class="max-w-3xl mx-auto">
    <div class="animate-pulse bg-surface border border-rim rounded-2xl p-5 mb-4 shadow-sm">
      <div class="flex items-start gap-3">
        <div class="w-11 h-11 rounded-full bg-accent-muted shrink-0 ring-1 ring-rim" />
        <div class="flex flex-col gap-1.5 pt-1">
          <div class="h-3.5 bg-accent-muted rounded w-32" />
          <div class="h-3 bg-accent-muted rounded w-24" />
        </div>
      </div>
      <div class="mt-4 space-y-2">
        <div class="h-3 bg-accent-muted rounded w-full" />
        <div class="h-3 bg-accent-muted rounded w-5/6" />
        <div class="h-3 bg-accent-muted rounded w-4/6" />
      </div>
      <div class="mt-4 pt-3 border-t border-rim flex items-center gap-5">
        <div class="h-3 bg-accent-muted rounded w-8" />
        <div class="h-3 bg-accent-muted rounded w-8" />
        <div class="h-3 bg-accent-muted rounded w-8" />
      </div>
    </div>
    </div>
  );
}
// src/shared/stream/feedviews/FeedView.tsx

export default function FeedView(props: { posts: ThreadNode[]; handlers: StreamHandlers }) {
  const { t } = useI18n();
  return (
    <div class="max-w-3xl mx-auto">
      <For
        each={props.posts}
        fallback={<p class="text-center py-16 text-muted text-sm">{t("network.all_caught_up")}</p>}
      >
        {(post) => (
          <PostCard
            post={post}
            handlers={props.handlers}
            onViewContext={() => openPost(post.uuid)}
          />
        )}
      </For>
    </div>
  );
}
