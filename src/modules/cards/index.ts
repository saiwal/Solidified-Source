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
      // Style (list | cloud) and rainbow mode come from the widget config.
      id: "cards.categories",
      label: () => useI18n().t("widgets.card_categories"),
      loader: () => import("./widgets/CardCategoryWidget"),
      slot: ["right", "footer"],
      defaultSlot: "right",
      configComponent: () => import("@/shared/stream/components/CategoryStyleConfig"),
      helpTarget: "widgets.categories",
    },
    {
      // Style (cloud | list) and rainbow mode come from the widget config.
      id: "cards.tags",
      label: () => useI18n().t("widgets.card_tags"),
      loader: () => import("./widgets/CardTagWidget"),
      slot: ["right", "footer"],
      defaultSlot: "right",
      configComponent: () => import("@/shared/stream/components/TagStyleConfig"),
      helpTarget: "widgets.tags",
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
