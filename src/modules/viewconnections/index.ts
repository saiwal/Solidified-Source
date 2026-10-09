import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

// Full list behind the channel.connections widget's "View all". Its own
// module (not a channel route) so the channel's feed widgets don't render
// in contentTop above it.
registerModule({
  id: "viewconnections",
  routes: [
    { path: "/viewconnections/:nick", component: () => import("./views/ViewConnectionsView") },
  ],
  widgets: [
    {
      id: "viewconnections.content",
      label: () => useI18n().t("widgets.viewconnections_content"),
      loader: () => import("./widgets/ViewConnectionsContentWidget"),
      slot: "contentTop",
      defaultModules: ["viewconnections"],
      contexts: ["viewconnections"],
      locked: true,
    },
  ],
  permissions: [],
});
