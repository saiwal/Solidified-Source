// src/shared/stream/types.ts
import type { CommentOrder } from "@utsukta/spa-core/store/comment-order";
import type { EditPayload } from "@utsukta/spa-core/lib/item-api";

export type { EditPayload };

export interface StreamHandlers {
  onLike: (mid: string) => void;
  onDislike: (mid: string) => void;
  onRepeat: (mid: string) => void;
  onComment: (
    parentMid: string,
    body: string,
    authorName: string,
    authorAvatar: string,
  ) => void;
  onLoadComments: (mid: string, uuid: string) => Promise<void>;
  // Pages in the next batch of comments for an already-loaded node — either
  // more top-level comments (isRoot) or, in threaded mode, more replies
  // within one comment's own branch. rootUuid is always the thread root (the
  // API's URL target); attachMid is the node — post root or a specific
  // comment — to attach the fetched children to. Optional: consumers that
  // fetch the whole thread upfront (some detail views) don't need it.
  onLoadMoreComments?: (
    rootUuid: string, attachMid: string, isRoot: boolean, offset: number, order: CommentOrder,
  ) => Promise<void>;
  onStar?: (mid: string) => void;
  onPin?: (mid: string) => void;
  onDelete?: (mid: string) => Promise<void>;
  // Posts send the composer's full field set; the inline comment editor sends
  // just { body, title } and the rest is left as stored (see EditPayload).
  onEdit?: (mid: string, payload: EditPayload) => Promise<void>;
  onRefresh?: (mid: string, uuid: string) => Promise<void>;
  // Approve/reject a comment or wall post stuck in moderation
  // (post.flags includes "pending_moderation") — see src/modules/moderate/api.ts.
  onApprove?: (iid: number) => Promise<void>;
  onReject?: (iid: number) => Promise<void>;
}

export type ViewMode = "feed" | "masonry" | "list" | "timeline";
