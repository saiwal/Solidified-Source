// src/modules/notify/index.ts
import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "notify",
  i18n: ["hq"],
  routes: [
    { path: "/notify", component: () => import("./views/NotifyListView") },
    {
      path: "/notify/view/:id",
      component: () => import("./views/NotifyRedirectView"),
    },
    {
      path: "/notifications",
      component: () => import("./views/NotificationsListView"),
    },
  ],
  requiresAuth: true,
  widgets: [
    {
      // Global — always mounted, every page. Id predates this module (was
      // "shared.notifications" from src/shared/slots.ts) — kept as-is,
      // widget ids are persisted in user layouts.
      id: "shared.notifications",
      label: () => useI18n().t("widgets.notifications"),
      loader: () => import("./widgets/NotificationsAside"),
      slot: "right",
      contexts: "any",
      global: true,
      helpTarget: "notifications",
    },
  ],
  permissions: [],
});
