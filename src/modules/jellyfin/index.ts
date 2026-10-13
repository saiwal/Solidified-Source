import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

// Music player for the user's own Jellyfin server. Frontend-only — the browser
// talks to Jellyfin directly (see api.ts for why there's no /spa proxy) — so
// it is gated purely by its Settings → Integrations toggle.
registerModule({
  id: "jellyfin",
  routes: [
    { path: "/jellyfin", component: () => import("./views/JellyfinView") },
  ],
  requiresAuth: true,
  navItem: {
    label: () => useI18n().t("nav.jellyfin"),
    icon: "jellyfin",
    path: "/jellyfin",
    href: "/jellyfin",
    hidden: false,
    context: "local",
  },
  frontendFeature: {
    label: () => useI18n().t("nav.jellyfin"),
    description: () => useI18n().t("nav.jellyfin_desc"),
    defaultEnabled: false,
  },
  widgets: [
    {
      id: "jellyfin.header",
      label: () => useI18n().t("widgets.jellyfin_header"),
      loader: () => import("./widgets/JellyfinHeaderWidget"),
      slot: "header",
      defaultModules: ["jellyfin"],
      contexts: ["jellyfin"],
      locked: true,
    },
    {
      id: "jellyfin.content",
      label: () => useI18n().t("widgets.jellyfin_content"),
      loader: () => import("./widgets/JellyfinContentWidget"),
      slot: "contentTop",
      defaultModules: ["jellyfin"],
      contexts: ["jellyfin"],
      locked: true,
    },
    {
      // Global so it stays mounted across navigation; renders nothing until a
      // track is loaded. Playback itself lives in store.ts, not here.
      id: "jellyfin.nowplaying",
      label: () => useI18n().t("widgets.jellyfin_nowplaying"),
      loader: () => import("./widgets/NowPlayingWidget"),
      slot: "right",
      contexts: "any",
      global: true,
      visitorVisible: false,
    },
  ],
  permissions: [],
});
