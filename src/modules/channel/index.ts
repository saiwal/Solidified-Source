import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import type { WidgetDef } from "@utsukta/spa-core/types/module.types";

// These widgets read the current page channel, so they also work on /profile
const channelWidgetPlacement: Pick<WidgetDef, "slot" | "defaultModules" | "contexts"> = {
  slot: "right",
  defaultModules: ["channel", "profile"],
  contexts: ["channel", "profile"],
};

registerModule({
  id: "channel",
  routes: [
    { path: "/channel", component: () => import("./views/ChannelView") },
    { path: "/channel/:nick", component: () => import("./views/ChannelView") },
  ],
  navItem: {
    label: () => useI18n().t("nav.channel"),
    icon: "home",
    path: "/channel",
    href: () => `/channel/${usePageNick()()}`,
    context: "all",
  },
  widgets: [
    {
      id: "channel.details",
      label: () => useI18n().t("widgets.channel_details"),
      loader: () => import("./widgets/ChannelDetailsWidget"),
      slot: "contentTop",
      defaultModules: ["channel"],
      contexts: ["channel"],
    },
    {
      id: "channel.feed",
      label: () => useI18n().t("widgets.channel_feed"),
      loader: () => import("./widgets/ChannelFeedWidget"),
      slot: "contentTop",
      defaultModules: ["channel"],
      contexts: ["channel"],
      helpTarget: "widgets.chronological_feed",
    },
    {
      // Opt-in single-layout variants of channel.feed (no view switcher) —
      // picker only, no default placement
      id: "channel.feed_chronological",
      label: () => useI18n().t("widgets.channel_feed_chronological"),
      loader: () => import("./widgets/ChannelFixedFeedWidgets").then((m) => ({ default: m.FeedOnly })),
      slot: "contentTop",
      defaultModules: [],
      contexts: ["channel"],
      helpTarget: "widgets.chronological_feed",
    },
    {
      id: "channel.feed_masonry",
      label: () => useI18n().t("widgets.channel_feed_masonry"),
      loader: () => import("./widgets/ChannelFixedFeedWidgets").then((m) => ({ default: m.MasonryOnly })),
      slot: "contentTop",
      defaultModules: [],
      contexts: ["channel"],
      helpTarget: "widgets.chronological_feed",
    },
    {
      id: "channel.feed_list",
      label: () => useI18n().t("widgets.channel_feed_list"),
      loader: () => import("./widgets/ChannelFixedFeedWidgets").then((m) => ({ default: m.ListOnly })),
      slot: "contentTop",
      defaultModules: [],
      contexts: ["channel"],
      helpTarget: "widgets.chronological_feed",
    },
    {
      // Opt-in alternate layout for channel.feed — picker only, no default placement
      id: "channel.feed_newspaper",
      label: () => useI18n().t("widgets.channel_feed_newspaper"),
      loader: () => import("./widgets/ChannelNewspaperWidget"),
      slot: "contentTop",
      defaultModules: [],
      contexts: ["channel"],
      helpTarget: "widgets.newspaper_feed",
    },
    {
      // Opt-in alternate layout for channel.feed — picker only, no default placement
      id: "channel.feed_timeline",
      label: () => useI18n().t("widgets.channel_feed_timeline"),
      loader: () => import("./widgets/ChannelTimelineWidget"),
      slot: "contentTop",
      defaultModules: [],
      contexts: ["channel"],
      helpTarget: "widgets.timeline_feed",
    },
    {
      // Opt-in alternate layout for channel.feed — picker only, no default placement
      id: "channel.feed_scrapbook",
      label: () => useI18n().t("widgets.channel_feed_scrapbook"),
      loader: () => import("./widgets/ChannelScrapbookWidget"),
      slot: "contentTop",
      defaultModules: [],
      contexts: ["channel"],
      helpTarget: "widgets.scrapbook_feed",
    },
		{
      // Opt-in vCard-style summary — picker only, no default placement.
      // Also placeable on /hq: usePageNick() falls back to the viewer's own
      // nick there, so it shows the owner's own card on their dashboard.
      id: "channel.contact_card",
      label: () => useI18n().t("widgets.contact_card"),
      loader: () => import("./widgets/ContactCardWidget"),
      slot: ["right"],
      defaultModules: ["articles", "photos", "cloud", "cal", "webpages", "wiki", "cart"],
      contexts: "any",
      helpTarget: "widgets.contact_card",
    },
    {
      id: "channel.connections",
      label: () => useI18n().t("widgets.connections"),
      loader: () => import("./widgets/ChannelConnectionsWidget"),
      ...channelWidgetPlacement,
      helpTarget: "widgets.connections",
    },
    {
      id: "channel.popular",
      label: () => useI18n().t("widgets.popular_posts"),
      loader: () => import("./widgets/ChannelPopularWidget"),
      ...channelWidgetPlacement,
      helpTarget: "widgets.popular_posts",
    },
    {
      id: "channel.categories",
      label: () => useI18n().t("widgets.categories"),
      loader: () => import("./widgets/ChannelCategoryWidget"),
      ...channelWidgetPlacement,
      helpTarget: "widgets.categories_list",
    },
    {
      id: "channel.tags",
      label: () => useI18n().t("widgets.tags"),
      loader: () => import("./widgets/ChannelTagWidget"),
      ...channelWidgetPlacement,
      helpTarget: "widgets.tags_cloud",
    },
    {
      id: "channel.archive",
      label: () => useI18n().t("widgets.archive"),
      loader: () => import("./widgets/ChannelArchiveWidget"),
      ...channelWidgetPlacement,
      helpTarget: "widgets.archive_tree",
    },
    {
      // Opt-in alternate layout for channel.tags — picker only, no default placement
      id: "channel.tags_list",
      label: () => useI18n().t("widgets.tag_list"),
      loader: () => import("./widgets/ChannelTagListWidget"),
      slot: ["right", "footer"],
      defaultModules: [],
      contexts: ["channel", "profile"],
      helpTarget: "widgets.tag_list",
    },
    {
      // Opt-in alternate layout for channel.categories — picker only, no default placement
      id: "channel.categories_cloud",
      label: () => useI18n().t("widgets.category_cloud"),
      loader: () => import("./widgets/ChannelCategoryCloudWidget"),
      slot: ["right", "footer"],
      defaultModules: [],
      contexts: ["channel", "profile"],
      helpTarget: "widgets.category_cloud",
    },
    {
      // Opt-in alternate layout for channel.archive — picker only, no default placement
      id: "channel.archive_grid",
      label: () => useI18n().t("widgets.archive_grid"),
      loader: () => import("./widgets/ChannelArchiveGridWidget"),
      slot: ["right", "footer"],
      defaultModules: [],
      contexts: ["channel", "profile"],
      helpTarget: "widgets.archive_calendar",
    },

    {
      // Opt-in GitHub-style posting activity graph — picker only, no default
      // placement. Also placeable on /hq (see channel.contact_card above).
      id: "channel.activity_heatmap",
      label: () => useI18n().t("widgets.activity_heatmap"),
      loader: () => import("./widgets/ActivityHeatmapWidget"),
      slot: ["right", "contentTop"],
      defaultModules: [],
      contexts: ["channel", "profile", "hq"],
      helpTarget: "widgets.activity_heatmap",
    },
  ],
  permissions: [],
});
