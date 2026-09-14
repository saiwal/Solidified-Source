import { persistedSignal, oneOf } from "../lib/persisted";

export type CommentOrder = "oldest_first" | "newest_first";

const [order, setOrder] = persistedSignal<CommentOrder>(
  "hz-comment-order",
  "oldest_first",
  oneOf<CommentOrder>("oldest_first", "newest_first"),
);

export function useCommentOrder() { return order; }

export const setCommentOrder = setOrder;
