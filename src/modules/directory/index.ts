import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { SubPageItem } from "@/shared/views/SubPageLayout";

export const CONNECTIONS_ITEMS: SubPageItem[] = [
  { path: "connections", label: () => useI18n().t("directory.connections"), context: "owner", requiresApp: "/connections" },
  { path: "contact-roles", label: () => useI18n().t("directory.contact_roles"), context: "owner", requiresApp: "/permcats" },
  {
    path: "privacy-groups",
    label: () => useI18n().t("directory.privacy_groups"),
    context: "owner",
    requiresApp: "/group",
  },
  // Guest tokens are pseudo-contacts (they carry a real xchan + abook row and
  // are granted access like any connection), so they belong with connections
  // rather than in their own top-level nav entry.
  {
    path: "guest-access",
    label: () => useI18n().t("guest_access.title"),
    context: "owner",
    dividerAfter: true,
    requiresApp: "/tokens",
  },
  {
    path: "people",
    label: () => useI18n().t("directory.people_groups"),
    context: "all",
  },
  { path: "suggest", label: () => useI18n().t("directory.suggestions"), context: ["local", "owner"], requiresApp: "/suggest" },
  { path: "hubs", label: () => useI18n().t("directory.hubs"), context: "all" },
];

const subRoutes = CONNECTIONS_ITEMS.map((item) => ({
  path: `/directory/${item.path}`,
  component: () => import("./views/ConnectionsShellView"),
}));

registerModule({
  id: "directory",
  routes: [
    {
      path: "/directory",
      component: () => import("./views/ConnectionsShellView"),
    },
    {
      path: "/directory/*",
      component: () => import("./views/ConnectionsShellView"),
    },
    ...subRoutes,
  ],
  navItem: {
    label: () => useI18n().t("nav.directory"),
    icon: "directory",
    path: "/directory",
    href: "/directory",
    context: "all",
  },
  slots: {},
  permissions: [],
});
