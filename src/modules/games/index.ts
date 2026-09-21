import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { GAMES } from "./games-registry";

const gameView = () => import("./views/GamesPage");

registerModule({
  id: "games",
  routes: [
    { path: "/games",     component: gameView },
    ...GAMES.map((game) => ({ path: `/games/${game.id}`, component: gameView })),
  ],
  navItem: {
    path: "/games",
    href: "/games",
    label: () => useI18n().t("nav.games"),
    icon: "games",
    hidden: false,
  },
  frontendFeature: {
    label: () => useI18n().t("nav.games"),
    description: () => useI18n().t("nav.games_desc"),
    defaultEnabled: false,
  },
});

export {};
