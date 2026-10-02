// src/modules/messenger/index.ts
import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";

const messengerView = () => import("./views/MessengerView");

registerModule({
  id: "messenger",
  // One view for every path: it parses the channel and selection out of the
  // url itself, so picking a conversation never remounts the list. On your
  // own nick it's your mailbox; on another channel, your DMs with it and the
  // rooms it lets you into.
  routes: [
    { path: "/messenger", component: messengerView },
    { path: "/messenger/*rest", component: messengerView },
  ],
  requiresAuth: true,
  navItem: {
    label: () => useI18n().t("nav.messenger"),
    icon: "chat",
    path: "/messenger",
    href: () => `/messenger/${usePageNick()()}`,
    context: "local",
    hidden: false, // SPA-exclusive item: owner nav needs the explicit false (see inbox)
  },
  frontendFeature: {
    label: () => useI18n().t("nav.messenger"),
    description: () => useI18n().t("nav.messenger_desc"),
    // On: a remote visitor has no toggle of their own to turn it on with.
    defaultEnabled: true,
  },
  permissions: [],
});
