import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";

registerModule({
  id: "cart",
  routes: [
    { path: "/cart", component: () => import("./views/CartView") },
    { path: "/cart/:nick", component: () => import("./views/CartView") },
  ],

  navItem: {
    label: () => useI18n().t("nav.cart"),
    icon: "cart",
    path: "/cart",
    href: () => `/cart/${usePageNick()()}`,
		context: "all",
  },
  widgets: [
    {
      id: "cart.header",
      helpTarget: "cart",
      label: () => useI18n().t("widgets.cart_header"),
      loader: () => import("./widgets/CartHeaderWidget"),
      slot: "header",
      defaultModules: ["cart"],
      contexts: ["cart"],
      locked: true,
    },
    {
      id: "cart.content",
      helpTarget: "cart",
      label: () => useI18n().t("widgets.cart_content"),
      loader: () => import("./widgets/CartContentWidget"),
      slot: "contentTop",
      defaultModules: ["cart"],
      contexts: ["cart"],
      locked: true,
    },
    {
      id: "cart.cart",
      label: () => useI18n().t("widgets.shopping_cart"),
      loader: () => import("./widgets/CartWidget"),
      slot: "right",
      helpTarget: "cart.widgets",
    },
    {
      // The viewer's subscriptions at this channel's shop; empty = renders nothing
      id: "cart.my_subscriptions",
      helpTarget: "widgets.my_subscriptions",
      label: () => useI18n().t("widgets.my_subscriptions"),
      loader: () => import("./widgets/MySubscriptionsWidget"),
      slot: "right",
      defaultModules: ["cart"],
      contexts: ["cart", "channel", "profile"],
    },
    {
      id: "cart.subscribers",
      helpTarget: "widgets.shop_subscribers",
      label: () => useI18n().t("widgets.shop_subscribers"),
      loader: () => import("./widgets/SubscribersWidget"),
      slot: "right",
      defaultModules: ["cart"],
      contexts: ["cart", "channel"],
      visitorVisible: false,
    },
    {
      // Opt-in showcase card; place several, each configured with its own sku
      id: "cart.item_card",
      label: () => useI18n().t("widgets.item_card"),
      loader: () => import("./widgets/ItemCardWidget"),
      slot: "right",
      defaultModules: [],
      contexts: ["channel", "profile", "cart"],
      multiInstance: true,
      configComponent: () => import("./widgets/ItemCardConfig"),
      helpTarget: "widgets.shop_item_card",
    },
  ],
  permissions: [],
});
