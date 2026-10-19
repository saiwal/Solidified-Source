import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";

registerModule({
  id: "cloud",
  i18n: ["files_mod"],
  routes: [
    { path: "/cloud", component: () => import("./views/FilesView") },
    { path: "/cloud/:nick", component: () => import("./views/FilesView") },
    { path: "/cloud/:nick/*", component: () => import("./views/FilesView") },
  ],

  navItem: {
    label: () => useI18n().t("nav.files"),
    icon: "files",
    path: "/cloud",
    href: () => `/cloud/${usePageNick()()}`,
		context: "all",
  },
  widgets: [
    {
      id: "cloud.header",
      label: () => useI18n().t("widgets.cloud_header"),
      loader: () => import("./widgets/FilesHeaderWidget"),
      slot: "header",
      defaultModules: ["cloud"],
      contexts: ["cloud"],
      locked: true,
    },
    {
      id: "cloud.content",
      label: () => useI18n().t("widgets.cloud_content"),
      loader: () => import("./widgets/FilesContentWidget"),
      slot: "contentTop",
      defaultModules: ["cloud"],
      contexts: ["cloud"],
      locked: true,
    },
    {
      // Bookmarks whose URL is a /cloud/ path — viewer-private, so local users only
      id: "cloud.bookmarks",
      label: () => useI18n().t("widgets.cloud_bookmarks"),
      loader: () => import("./widgets/CloudBookmarksWidget"),
      slot: "right",
      defaultModules: ["cloud"],
      contexts: "any",
      visitorVisible: false,
    },
    {
      // Categories in use; a click filters the open folder's subtree via ?cat=
      id: "cloud.categories",
      label: () => useI18n().t("widgets.cloud_categories"),
      loader: () => import("./widgets/CloudCategoriesWidget"),
      slot: "right",
      defaultModules: ["cloud"],
      contexts: ["cloud"],
    },
  ],
  permissions: [],
  appUrlSlug: "/cloud/",
});
