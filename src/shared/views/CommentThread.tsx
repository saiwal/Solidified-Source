import { For, Show } from "solid-js";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { isDeletedStub, isConfirmedDeleted } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "../stream/types";
import PostCard from "../stream/components/PostCard";
import { useI18n } from "@utsukta/spa-core/i18n";

export default function CommentThread(props: {
  comments: ThreadNode[];
  show: boolean;
  handlers: StreamHandlers;
  threaded?: boolean;
  highlightUuid?: string;
  postAuthorAddress?: string;
  expandAll?: boolean;
  rootUuid?: string;
  // Nesting level of these comments (1 = direct replies to the root).
  depth?: number;
  // Drop the indent: the parent comment is folded into a stub (see PostCard).
  flush?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div
      style={{
        display: "grid",
        "grid-template-rows": props.show ? "1fr" : "0fr",
        transition: "grid-template-rows 300ms ease",
      }}
    >
      <div style={{ overflow: "hidden" }}>
        <div class="mt-2 space-y-1.5" classList={{ "ml-1": !props.flush }}>
          <For each={props.comments}>
            {(comment) => (
              <Show
                when={!isDeletedStub(comment)}
                fallback={
                  <div>
                    <div class="border-l-2 border-dashed border-rim/40 pl-2 md:pl-3 py-2">
                      <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full bg-elevated shrink-0" />
                        <span class="text-xs text-muted italic">
                          {isConfirmedDeleted(comment) ? t("post.deleted_comment") : t("post.parent_not_loaded")}
                        </span>
                      </div>
                    </div>
                    <Show when={comment.children.length > 0}>
                      <CommentThread
                        comments={comment.children}
                        show={props.show}
                        handlers={props.handlers}
                        highlightUuid={props.highlightUuid}
                        postAuthorAddress={props.postAuthorAddress}
                        expandAll={props.expandAll}
                        rootUuid={props.rootUuid}
                        depth={(props.depth ?? 1) + 1}
                      />
                    </Show>
                  </div>
                }
              >
                <PostCard
                  post={comment}
                  handlers={props.handlers}
                  compact
                  highlighted={!!props.highlightUuid && comment.uuid === props.highlightUuid}
                  highlightUuid={props.highlightUuid}
                  postAuthorAddress={props.postAuthorAddress}
                  expandAll={props.expandAll}
                  rootUuid={props.rootUuid}
                  depth={props.depth ?? 1}
                />
              </Show>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
