// src/modules/moderate/index.ts
import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "moderate",
  i18n: ["directory"],
  routes: [{ path: "/moderate", component: () => import("./views/ModerateView") }],
  navItem: {
    label: () => useI18n().t("nav.moderate"),
    icon: "moderate",
    path: "/moderate",
    href: "/moderate",
    context: ["owner", "local"],
  },
  requiresAuth: true,
  widgets: [],
  permissions: [],
});
