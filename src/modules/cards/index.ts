import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";

registerModule({
  id: "cards",
  routes: [
    { path: "/cards", component: () => import("./views/CardsView") },
    {
      path: "/cards/:nick",
      component: () => import("./views/CardsView"),
    },
    // Deck routes register before the :uuid catch-all so the literal
    // "deck" segment isn't swallowed by it.
    {
      path: "/cards/:nick/deck",
      component: () => import("./views/DeckIndexView"),
    },
    {
      path: "/cards/:nick/deck/:name",
      component: () => import("./views/DeckView"),
    },
    {
      path: "/cards/:nick/:uuid",
      component: () => import("./views/CardView"),
    },
  ],
  navItem: {
    label: () => useI18n().t("nav.cards"),
    icon: "cards",
    path: "/cards",
    href: () => `/cards/${usePageNick()()}`,
    context: "all",
    hidden: false,
  },
  widgets: [
    {
      id: "cards.header",
      label: () => useI18n().t("widgets.cards_header"),
      loader: () => import("./widgets/CardsHeaderWidget"),
      slot: "header",
      defaultModules: ["cards"],
      contexts: ["cards"],
      locked: true,
    },
    {
      id: "cards.content",
      label: () => useI18n().t("widgets.cards_content"),
      loader: () => import("./widgets/CardsContentWidget"),
      slot: "contentTop",
      defaultModules: ["cards"],
      contexts: ["cards"],
      locked: true,
    },
    {
      id: "cards.drafts",
      label: () => useI18n().t("widgets.card_drafts"),
      loader: () => import("./widgets/CardDraftsWidget"),
      slot: "right",
      visitorVisible: false,
      helpTarget: "widgets.drafts",
    },
    {
      id: "cards.popular",
      label: () => useI18n().t("widgets.popular_cards"),
      loader: () => import("./widgets/CardPopularWidget"),
      slot: "right",
      defaultModules: [],
      contexts: ["channel", "profile", "cards"],
      helpTarget: "widgets.popular_cards",
    },
    {
      id: "cards.categories",
      label: () => useI18n().t("widgets.card_categories"),
      loader: () => import("./widgets/CardCategoryWidget"),
      slot: "right",
      helpTarget: "widgets.categories_list",
    },
    {
      // Opt-in alternate layout for cards.categories — picker only, no default placement
      id: "cards.categories_cloud",
      label: () => useI18n().t("widgets.category_cloud"),
      loader: () => import("./widgets/CardCategoryCloudWidget"),
      slot: ["right", "footer"],
      defaultModules: [],
      contexts: ["cards"],
      helpTarget: "widgets.categories_cloud",
    },
    {
      id: "cards.tags",
      label: () => useI18n().t("widgets.card_tags"),
      loader: () => import("./widgets/CardTagWidget"),
      slot: "right",
      helpTarget: "widgets.tags_cloud",
    },
    {
      // Opt-in alternate layout for cards.tags — picker only, no default placement
      id: "cards.tags_list",
      label: () => useI18n().t("widgets.tag_list"),
      loader: () => import("./widgets/CardTagListWidget"),
      slot: ["right", "footer"],
      defaultModules: [],
      contexts: ["cards"],
      helpTarget: "widgets.tags_list",
    },
    {
      // Opt-in card showcase; place several, each configured with a card
      id: "cards.showcase",
      label: () => useI18n().t("widgets.card_showcase"),
      loader: () => import("./widgets/CardShowcaseWidget"),
      slot: "right",
      defaultModules: [],
      contexts: ["channel", "profile", "cards"],
      multiInstance: true,
      configComponent: () => import("./widgets/CardShowcaseConfig"),
      helpTarget: "widgets.card_showcase",
    },
    {
      id: "cards.deck",
      label: () => useI18n().t("widgets.card_deck"),
      loader: () => import("./widgets/CardDeckWidget"),
      slot: "right",
      defaultModules: ["cards"],
      contexts: ["cards"],
      helpTarget: "widgets.card_deck",
    },
  ],
  permissions: [],
  appUrlSlug: "/cards/",
});
