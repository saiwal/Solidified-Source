import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

// The visitor-facing half of the Jellyfin player: "Listening now" on a
// channel's pages. A module of its own because jellyfin's frontendFeature is
// a *viewer* opt-in — under it, every visitor who hadn't enabled Jellyfin
// themselves would have this widget filtered out. Here there's no gate; the
// hub returns nothing unless the page owner opted in (Settings in /jellyfin),
// and the widget renders nothing then.
registerModule({
  id: "jellyfin-profile",
  routes: [],
  widgets: [
    {
      id: "jellyfin-profile.nowplaying",
      label: () => useI18n().t("widgets.jellyfin_profile"),
      loader: () => import("./ProfileNowPlaying"),
      slot: "right",
      defaultModules: ["channel", "profile"],
      contexts: ["channel", "profile", "viewconnections"],
    },
  ],
});
