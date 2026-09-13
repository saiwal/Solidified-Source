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
    requiresApp: "/tokens",
  },
  // A source is a connection whose posts you republish, so it belongs with the
  // other per-connection tools rather than in its own top-level nav entry.
  {
    path: "sources",
    label: () => useI18n().t("sources.title"),
    context: "owner",
    dividerAfter: true,
    requiresApp: "/sources",
  },
  {
    path: "people",
    label: () => useI18n().t("directory.people_groups"),
    context: "all",
  },
  { path: "suggest", label: () => useI18n().t("directory.suggestions"), context: ["local", "owner"], requiresApp: "/suggest" },
  // Inviting is a people-facing action rather than a per-connection tool, so it
  // sits with the directory/suggestions group.
  {
    path: "invite",
    label: () => useI18n().t("invite.title"),
    context: ["local", "owner"],
    requiresApp: "/invite",
  },
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
    // Classic-Hubzilla entry points people paste into webpages / menus.
    { path: "/follow", component: () => import("./views/FollowView") },
    { path: "/connections", component: () => import("./views/ConnectionsRedirectView") },
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
