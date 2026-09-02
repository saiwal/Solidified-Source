// src/shared/stream/feedviews/StreamList.tsx
import { Switch, Match } from "solid-js";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers, ViewMode } from "../types";
import FeedView from "./FeedView";
import MasonryView from "./MasonryView";
import ListView from "./ListView";
import TimelineView from "./TimelineView";


export default function StreamList(props: {
  posts: ThreadNode[];
  viewMode: ViewMode;
  handlers: StreamHandlers;
  // Masonry-only: trailing pagination-skeleton count, woven into the same
  // column split as posts. See MasonryView.
  appendingCount?: number;
}) {
  return (
    <Switch>
      <Match when={props.viewMode === "feed"}>
        <FeedView posts={props.posts} handlers={props.handlers} />
      </Match>
      <Match when={props.viewMode === "masonry"}>
        <MasonryView
          posts={props.posts}
          handlers={props.handlers}
          appendingCount={props.appendingCount}
        />
      </Match>
      <Match when={props.viewMode === "list"}>
        <ListView posts={props.posts} handlers={props.handlers} />
      </Match>
      <Match when={props.viewMode === "timeline"}>
        <TimelineView posts={props.posts} handlers={props.handlers} />
      </Match>
    </Switch>
  );
}
