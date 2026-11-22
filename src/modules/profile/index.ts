import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "profile",
  routes: [
    { path: "/profile/:nick", component: () => import("./views/ProfilePageView") },
  ],
  navItem: {
    label: () => useI18n().t("nav.profile"),
    icon: "profile",
    path: "/profile",
    href: "/profile",
    context: "all",
    hidden: true,
  },
  // Sidebar widgets come from the channel module — its widgets list
  // "profile" in their defaultModules.
  widgets: [
    {
      // No separable title/action row exists in this view — just the
      // profile card, so unlike other modules there's no "header" widget.
      id: "profile.content",
      helpTarget: "channel.profile_detail",
      label: () => useI18n().t("widgets.profile_content"),
      loader: () => import("./widgets/ProfileContentWidget"),
      slot: "contentTop",
      defaultModules: ["profile"],
      contexts: ["profile"],
      locked: true,
    },
  ],
  permissions: [],
});
