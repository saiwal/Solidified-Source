// src/modules/pubstream/index.ts
import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";


registerModule({
  id: "pubstream",
  routes: [
    {
      path: "/pubstream",
      component: () => import("./views/PubstreamView"),
    },
  ],
  navItem: {
    path: "/pubstream",
    label: () => useI18n().t("nav.pubstream"),
    icon: "pubstream",
		href: "/pubstream",
		context: "all",
  },
  widgets: [
    {
      id: "pubstream.content",
      helpTarget: "nav.pubstream",
      label: () => useI18n().t("widgets.pubstream_content"),
      loader: () => import("./widgets/PubstreamContentWidget"),
      slot: "contentTop",
      defaultModules: ["pubstream"],
      contexts: ["pubstream"],
      locked: true,
    },
  ],
  appUrlSlug: "/pubstream",
});
