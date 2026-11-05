import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";

registerModule({
  id: "graph",
  routes: [
    { path: "/graph", component: () => import("./views/GraphView") },
    { path: "/graph/:nick", component: () => import("./views/GraphView") },
  ],
  navItem: {
    label: () => useI18n().t("nav.graph"),
    icon: "graph",
    path: "/graph",
    href: () => `/graph/${usePageNick()()}`,
    hidden: false,
    context: "local",
  },
  // Off until switched on in Settings → Integrations, like Jellyfin. On a
  // channel's pages the *owner's* switch decides (channelScoped): it is what
  // puts the Graph tab on their channel and lets visitors open /graph/<nick>.
  frontendFeature: {
    label: () => useI18n().t("nav.graph"),
    description: () => useI18n().t("nav.graph_desc"),
    defaultEnabled: false,
    channelScoped: true,
  },
  widgets: [
    {
      // "Linked from" — renders nothing off a single-item page or with no backlinks.
      id: "graph.backlinks",
      label: () => useI18n().t("widgets.backlinks"),
      loader: () => import("./widgets/BacklinksWidget"),
      slot: ["right", "footer"],
      defaultSlot: "right",
      defaultModules: ["wiki", "articles", "cards", "post"],
      contexts: "any",
    },
  ],
  permissions: [],
});
