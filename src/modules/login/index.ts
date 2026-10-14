import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "login",
  i18n: ["auth"],
  routes: [
    { path: "/login", component: () => import("./views/LoginView") },
  ],
  navItem: {
    label: () => useI18n().t("nav.login"),
    icon: "login",
    path: "/login",
    href: "/login",
    context: "anonymous",
  },
  slots: {},
  permissions: [],
});
