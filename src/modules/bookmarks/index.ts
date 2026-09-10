// src/modules/bookmarks/index.ts
import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "bookmarks",
  routes: [
    { path: "/bookmarks", component: () => import("./views/BookmarksView") },
  ],
  requiresAuth: true,
  // Core gates /bookmarks on the Bookmarks app (Zotlabs/Module/Bookmarks.php),
  // and so does the API. Without this the route and widgets render for channels
  // that never installed it.
  appUrlSlug: "/bookmarks",
  navItem: {
    label: () => useI18n().t("nav.bookmarks"),
    icon: "bookmark",
    path: "/bookmarks",
    href: "/bookmarks",
    context: "local",
    // Same pair as articles/calendar/cards: the nav entry rides the server's
    // installed-app list once appUrlSlug is set, and this keeps it visible
    // rather than waiting on Nav.php's channel tab, which stays hidden until
    // you already own a bookmark — leaving no way to reach an empty /bookmarks.
    hidden: false,
  },
  widgets: [
    {
      id: "bookmarks.header",
      label: () => useI18n().t("widgets.bookmarks_header"),
      loader: () => import("./widgets/BookmarksHeaderWidget"),
      slot: "header",
      defaultModules: ["bookmarks"],
      contexts: ["bookmarks"],
      locked: true,
    },
    {
      id: "bookmarks.content",
      label: () => useI18n().t("widgets.bookmarks_content"),
      loader: () => import("./widgets/BookmarksContentWidget"),
      slot: "contentTop",
      defaultModules: ["bookmarks"],
      contexts: ["bookmarks"],
      locked: true,
    },
  ],
  permissions: [],
});
