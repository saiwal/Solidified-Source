import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import "./tours";

registerModule({
  id: "hq",
  i18n: ["articles", "calendar", "cards", "settings"],
  // :uuid — core redirects DM notifications (/notify/view/:id, NOTIFY_MAIL)
  // server-side to classic HQ's /hq/<b64mid> permalink before the SPA loads,
  // so this route has to answer that URL too; HqView opens it in the same
  // PostDetailModal the message list uses.
  routes: [{ path: "/hq/:uuid?", component: () => import("./views/HqView") }],
  requiresAuth: true,
  navItem: {
    label: () => useI18n().t("nav.hq"),
    icon: "dashboard",
    path: "/hq",
    href: "/hq",
    context: "owner",
  },
  widgets: [
    {
      // Opt-in: connections' birthdays in the next 30 days — your own pages only
      id: "hq.birthdays",
      label: () => useI18n().t("widgets.birthdays"),
      loader: () => import("./widgets/BirthdaysWidget"),
      slot: "right",
      defaultModules: [],
      contexts: ["hq", "network", "cal"],
      visitorVisible: false,
    },
    {
      // Opt-in: recent outgoing delivery success + the sites that keep failing
      id: "hq.delivery_health",
      label: () => useI18n().t("widgets.delivery_health"),
      loader: () => import("./widgets/DeliveryHealthWidget"),
      slot: "right",
      defaultModules: ["hq"],
      contexts: ["hq", "network"],
      visitorVisible: false,
    },
    // Row of quick-launch buttons for the other composers (post, DM,
    // webpage, wiki, article) — each button only appears when its
    // corresponding Hubzilla app is installed.
    {
      id: "hq.quick_compose",
      label: () => useI18n().t("hq.quick_compose"),
      loader: () => import("./widgets/QuickComposeWidget"),
      slot: "contentTop",
      defaultModules: [],
      contexts: "any",
      helpTarget: "widgets.quick_compose_btns",
    },
		{
      id: "hq.quick_compose_right",
      label: () => useI18n().t("hq.quick_compose"),
      loader: () => import("./widgets/QuickComposeWidget"),
      slot: "right",
      defaultModules: [],
      contexts: "any",
      helpTarget: "widgets.quick_compose_btns",
    },
    {
      id: "hq.composer",
      label: () => useI18n().t("hq.post_composer"),
      loader: () => import("./widgets/HqComposer"),
      slot: "contentTop",
      defaultModules: ["hq"],
      contexts: "any",
      helpTarget: "widgets.quick_composer",
    },
		{
      id: "hq.composer_header",
      label: () => useI18n().t("hq.post_composer"),
      loader: () => import("./widgets/HqComposer"),
      slot: "header",
      defaultModules: ["network"],
      contexts: "any",
      helpTarget: "widgets.quick_composer",
    },
		{
      id: "hq.messages",
      label: () => useI18n().t("hq.messages"),
      loader: () => import("./widgets/HqMessagesWidget"),
      slot: "contentTop",
      defaultSpan: 3,
      defaultModules: ["hq"],
      contexts: ["hq"],
      configComponent: () => import("./widgets/HqMessagesConfig"),
      helpTarget: "widgets.recent_posts",
    },
    {
      id: "hq.channel_activities",
      label: () => useI18n().t("hq.channel_activities"),
      loader: () => import("./widgets/ChannelActivitiesWidget"),
      slot: "contentTop",
      defaultSpan: 3,
      defaultModules: ["hq"],
      contexts: "any",
      visitorVisible: false,
      helpTarget: "widgets.channel_activities",
    },
    {
      id: "hq.drafts",
      label: () => useI18n().t("hq.drafts"),
      loader: () => import("./widgets/DraftsWidget"),
      slot: "contentTop",
      defaultSpan: 3,
      defaultModules: ["hq"],
      contexts: ["hq"],
      visitorVisible: false,
      helpTarget: "widgets.drafts",
    },
    {
      // Delayed-publish queue in the right sidebar — the component renders
      // nothing while no posts are scheduled, so the widget self-hides.
      id: "hq.scheduled",
      label: () => useI18n().t("hq.scheduled"),
      loader: () => import("./widgets/ScheduledPostsWidget"),
      slot: "right",
      defaultModules: ["hq"],
      contexts: "any",
      visitorVisible: false,
      helpTarget: "widgets.scheduled_posts",
    },
    {
      // Local users only — mirrors the old `auth()?.isLocal` gate in HqView
      id: "hq.upcoming_events",
      label: () => useI18n().t("hq.upcoming_events"),
      loader: () => import("./widgets/UpcomingEventsWidget"),
      slot: "contentTop",
      defaultSpan: 3,
      defaultModules: ["hq"],
      contexts: ["hq"],
      visitorVisible: false,
      helpTarget: "widgets.upcoming_events",
    },
     // Account resource usage (storage, channels, connections, etc.) at a
    // glance — full detail lives on the Account settings page.
    {
      id: "hq.usage_quotas",
      label: () => useI18n().t("widgets.usage_quotas"),
      loader: () => import("./widgets/UsageQuotasWidget"),
      slot: "contentTop",
      defaultSpan: 3,
      defaultModules: [],
      contexts: ["hq"],
      helpTarget: "widgets.usage_quotas",
    },
    {
      id: "hq.usage_quotas_right",
      label: () => useI18n().t("widgets.usage_quotas"),
      loader: () => import("./widgets/UsageQuotasWidget"),
      slot: "right",
      defaultModules: ["hq"],
      contexts: ["hq"],
      helpTarget: "widgets.usage_quotas",
    },
		{
      id: "hq.perf_stats",
      label: () => useI18n().t("hq.server_performance"),
      loader: () => import("./widgets/PerfStatsWidget"),
      slot: "footer",
      defaultModules: ["hq"],
      contexts: ["hq"],
      helpTarget: "widgets.perf_stats",
    },

  ],
  permissions: [],
});
