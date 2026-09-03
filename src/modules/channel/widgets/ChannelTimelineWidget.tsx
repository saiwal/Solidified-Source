// src/modules/channel/widgets/ChannelTimelineWidget.tsx
import { Show } from "solid-js";
import { posts, loading, loadingMore, streamHandlers } from "../store";
import TimelineView, { TimelinePlaceholder } from "@/shared/stream/feedviews/TimelineView";
import ChannelFeedShell from "./ChannelFeedShell";

function TimelineBody() {
  return (
    <Show when={!loading()} fallback={<TimelinePlaceholder />}>
      <TimelineView posts={posts()} handlers={streamHandlers} />
      <Show when={loadingMore()}>
        <div class="mt-8">
          <TimelinePlaceholder count={2} />
        </div>
      </Show>
    </Show>
  );
}

export default function ChannelTimelineWidget() {
  return <ChannelFeedShell body={TimelineBody} />;
}
