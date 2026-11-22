import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";

registerModule({
  id: "photos",
  routes: [
    { path: "/photos", component: () => import("./views/PhotoView") },
    { path: "/photos/:nick", component: () => import("./views/PhotoView") },
    { path: "/photos/:nick/album", component: () => import("./views/PhotoView") },
    {
      path: "/photos/:nick/album/:datum",
      component: () => import("./views/PhotoView"),
    },
    {
      path: "/photos/:nick/image/:datum",
      component: () => import("./views/PhotoView"),
    },
  ],
  navItem: {
    label: () => useI18n().t("nav.photos"),
    icon: "photos",
    path: "/photos",
    href: () => `/photos/${usePageNick()()}`,
    context: "all",
  },
  widgets: [
    {
      id: "photos.header",
      helpTarget: "photos",
      label: () => useI18n().t("widgets.photos_header"),
      loader: () => import("./widgets/PhotosHeaderWidget"),
      slot: "header",
      defaultModules: ["photos"],
      contexts: ["photos"],
      locked: true,
    },
    {
      id: "photos.content",
      helpTarget: "photos",
      label: () => useI18n().t("widgets.photos_content"),
      loader: () => import("./widgets/PhotosContentWidget"),
      slot: "contentTop",
      defaultModules: ["photos"],
      contexts: ["photos"],
      locked: true,
    },
    {
      id: "photos.albums",
      label: () => useI18n().t("widgets.photo_albums"),
      loader: () => import("./widgets/PhotosWidget"),
      slot: "right",
      helpTarget: "photos.photo_albums_widget",
    },
    {
      // Opt-in album showcase; place several, each configured with an album
      id: "photos.album_strip",
      label: () => useI18n().t("widgets.album_strip"),
      loader: () => import("./widgets/AlbumStripWidget"),
      slot: "right",
      defaultModules: [],
      contexts: ["channel", "profile", "photos"],
      multiInstance: true,
      configComponent: () => import("./widgets/AlbumStripConfig"),
      helpTarget: "widgets.album_strip",
    },
    {
      // Opt-in random-photo slideshow; config: { album (""=all), interval secs }
      id: "photos.slideshow",
      helpTarget: "widgets.photo_slideshow",
      label: () => useI18n().t("widgets.photo_slideshow"),
      loader: () => import("./widgets/PhotoSlideshowWidget"),
      slot: "right",
      defaultModules: [],
      contexts: ["channel", "profile", "photos"],
      multiInstance: true,
      configComponent: () => import("./widgets/PhotoSlideshowConfig"),
    },
  ],
  permissions: [],
  appUrlSlug: "/photos/",
});
