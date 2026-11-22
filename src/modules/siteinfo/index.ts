import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "siteinfo",

  routes: [
    // Index — renders the shell (desktop defaults to Display; mobile shows list)
    { path: "/siteinfo", component: () => import("./views/SiteinfoView") },
  ],

  navItem: {
    label: () => useI18n().t("nav.siteinfo"),
    icon: "siteinfo",
    path: "/siteinfo",
    href: "/siteinfo",
    context: "all",
    hidden: true,
  },

  // Header card is locked (a page needs some identity); the info sections
  // below it are ordinary contentTop widgets — subdividing them is meant to
  // let an owner reorder/hide individual sections, so they're left removable.
  widgets: [
    {
      id: "siteinfo.header",
      helpTarget: "nav.siteinfo",
      label: () => useI18n().t("widgets.siteinfo_header"),
      loader: () => import("./widgets/SiteinfoHeaderWidget"),
      slot: "header",
      defaultModules: ["siteinfo"],
      contexts: ["siteinfo"],
      locked: true,
    },
    {
      id: "siteinfo.about",
      label: () => useI18n().t("widgets.siteinfo_about"),
      loader: () => import("./widgets/SiteinfoAboutWidget"),
      slot: "contentTop",
      defaultModules: ["siteinfo"],
      contexts: ["siteinfo"],
      helpTarget: "widgets.about_site",
    },
    {
      id: "siteinfo.admin",
      label: () => useI18n().t("widgets.siteinfo_admin"),
      loader: () => import("./widgets/SiteinfoAdminWidget"),
      slot: "contentTop",
      defaultModules: ["siteinfo"],
      contexts: ["siteinfo"],
      helpTarget: "widgets.admin_info",
    },
    {
      id: "siteinfo.service_classes",
      label: () => useI18n().t("widgets.siteinfo_service_classes"),
      loader: () => import("./widgets/SiteinfoServiceClassesWidget"),
      slot: "contentTop",
      defaultModules: ["siteinfo"],
      contexts: ["siteinfo"],
      helpTarget: "widgets.service_classes",
    },
    {
      id: "siteinfo.addons",
      label: () => useI18n().t("widgets.siteinfo_addons"),
      loader: () => import("./widgets/SiteinfoAddonsWidget"),
      slot: "contentTop",
      defaultModules: ["siteinfo"],
      contexts: ["siteinfo"],
      helpTarget: "widgets.addons_info",
    },
    {
      id: "siteinfo.themes",
      label: () => useI18n().t("widgets.siteinfo_themes"),
      loader: () => import("./widgets/SiteinfoThemesWidget"),
      slot: "contentTop",
      defaultModules: ["siteinfo"],
      contexts: ["siteinfo"],
      helpTarget: "widgets.themes_info",
    },
    {
      id: "siteinfo.federation",
      label: () => useI18n().t("widgets.siteinfo_federation"),
      loader: () => import("./widgets/SiteinfoFederationWidget"),
      slot: "contentTop",
      defaultModules: ["siteinfo"],
      contexts: ["siteinfo"],
      helpTarget: "widgets.federation",
    },
  ],

  permissions: [],
});
