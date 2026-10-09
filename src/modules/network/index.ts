import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "network",
  routes: [
    { path: "/network", component: () => import("./views/NetworkView") },
  ],
  requiresAuth: true,
  navItem: {
    label: () => useI18n().t("nav.network"),
    icon: "network",
    path: "/network",
    href: "/network",
    context: "owner",
  },
  widgets: [
    {
      id: "network.content",
      label: () => useI18n().t("widgets.network_content"),
      loader: () => import("./widgets/NetworkContentWidget"),
      slot: "contentTop",
      defaultModules: ["network"],
      contexts: ["network"],
      locked: true,
    },
    {
      id: "network.filters",
      label: () => useI18n().t("widgets.stream_filters"),
      loader: () => import("./widgets/StreamFiltersWidget"),
      slot: "right",
      visitorVisible: false,
      helpTarget: "widgets.filters",
      locked: true,
    },
    {
      id: "network.savedSearch",
      label: () => useI18n().t("widgets.saved_searches"),
      loader: () => import("./widgets/SavedSearchesWidget"),
      slot: "right",
      visitorVisible: false,
      helpTarget: "widgets.saved_searches",
    },
  ],
  permissions: [],
});
