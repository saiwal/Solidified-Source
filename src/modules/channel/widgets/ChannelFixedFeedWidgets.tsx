// src/modules/channel/widgets/ChannelFixedFeedWidgets.tsx
// Picker-only widgets that pin one of the switchable layouts, for users who
// want a single view without the switcher chrome. Same shape as
// ChannelTimelineWidget etc., but reusing ChannelFeedBody so pinned posts and
// filter handling come along.
import { ChannelFeedBody } from "./ChannelFeedWidget";
import ChannelFeedShell from "./ChannelFeedShell";

export function FeedOnly() {
  return <ChannelFeedShell body={() => <ChannelFeedBody mode="feed" />} />;
}

export function MasonryOnly() {
  return <ChannelFeedShell body={() => <ChannelFeedBody mode="masonry" />} />;
}

export function ListOnly() {
  return <ChannelFeedShell body={() => <ChannelFeedBody mode="list" />} />;
}
