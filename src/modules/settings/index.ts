import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { SubPageItem } from "@/shared/views/SubPageLayout";

export const SETTINGS_ITEMS: SubPageItem[] = [
  // "profile" links to /settings/profile which is owned by the profiles module.
  // It is listed here for sidebar display only — excluded from settingsRoutes below.
  { path: "profile",       label: () => useI18n().t("settings.title_profile") },
  { path: "account",       label: () => useI18n().t("settings.title_account") },
  { path: "channel",       label: () => useI18n().t("settings.title_channel") },
  { path: "privacy",       label: () => useI18n().t("settings.title_privacy") },
  { path: "locations",     label: () => useI18n().t("settings.title_locations") },
  { path: "notifications", label: () => useI18n().t("settings.title_notifications") },
  { path: "display",       label: () => useI18n().t("settings.title_display") },
  { path: "integrations",  label: () => useI18n().t("settings.title_integrations") },
  { path: "features",      label: () => useI18n().t("settings.title_features") },
  { path: "blocked",       label: () => useI18n().t("settings.title_blocked") },
  { path: "portability",   label: () => useI18n().t("settings.title_portability") },
  { path: "danger",        label: () => useI18n().t("settings.title_danger") },
];

// /settings/profile is served by the profiles module — don't register it here.
const settingsRoutes = SETTINGS_ITEMS.filter((item) => item.path !== "profile").map((item) => ({
  path: `/settings/${item.path}`,
  component: () => import("./views/SettingsView"),
}));

registerModule({
  id: "settings",
  i18n: ["blocklist", "directory"],
  routes: [
    { path: "/settings", component: () => import("./views/SettingsView") },
    ...settingsRoutes,
  ],
  requiresAuth: true,
  navItem: {
    label: () => useI18n().t("nav.settings"),
    icon: "settings",
    path: "/settings",
    href: "/settings",
    context: "owner",
    hidden: true,
  },
  slots: {},
  permissions: [],
});
