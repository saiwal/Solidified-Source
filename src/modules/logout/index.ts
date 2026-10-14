import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "logout",
  i18n: ["auth"],
  routes: [
    { path: "/logout", component: () => import("./views/LogoutView") },
  ],
  requiresAuth: true,
  navItem: {
    label: () => useI18n().t("nav.logout"),
    icon: "logout",
    path: "/logout",
    href: "/logout",
    context: ["owner", "local"],
    hidden: true,
  },
  slots: {},
  permissions: [],
});
