// modules/manage/index.ts

import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "manage",
  navItem: {
    label: () => useI18n().t("nav.channels"),
    icon: "manage",
    href: "/manage",
    path: "/manage",
    context: ["owner", "local"],
		hidden: true,
  },
  routes: [
    {
      path: "/manage",
      component: () => import("./views/ManagePage"),
    },
  ],
  requiresAuth: true,
  widgets: [
    {
      id: "manage.header",
      helpTarget: "manage",
      label: () => useI18n().t("widgets.manage_header"),
      loader: () => import("./widgets/ManageHeaderWidget"),
      slot: "header",
      defaultModules: ["manage"],
      contexts: ["manage"],
      locked: true,
    },
    {
      id: "manage.content",
      helpTarget: "manage",
      label: () => useI18n().t("widgets.manage_content"),
      loader: () => import("./widgets/ManageContentWidget"),
      slot: "contentTop",
      defaultModules: ["manage"],
      contexts: ["manage"],
      locked: true,
    },
  ],
});
