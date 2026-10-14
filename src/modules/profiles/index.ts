import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "profiles",
  i18n: ["settings"],
  routes: [
    { path: "/settings/profile",     component: () => import("./views/ProfilesView") },
    { path: "/settings/profile/:id", component: () => import("./views/ProfileEditView") },
  ],
  requiresAuth: true,
  navItem: {
    label: () => useI18n().t("nav.profiles"),
    icon: "manage",
    path: "/settings/profile",
    href: "/settings/profile",
    context: "owner",
    hidden: true,
  },
  slots: {},
  permissions: [],
});
