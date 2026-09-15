// src/modules/inbox/index.ts
import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

const inboxView = () => import("./views/InboxView");

registerModule({
  id: "inbox",
  // One view, one route per section — SubPageLayout's mobile "< Back" relies
  // on the bare base path being its own route (see SettingsView).
  routes: [
    { path: "/inbox", component: inboxView },
    { path: "/inbox/:section", component: inboxView },
    { path: "/inbox/folder/:name", component: inboxView },
  ],
  requiresAuth: true,
  navItem: {
    label: () => useI18n().t("nav.inbox"),
    icon: "mail",
    path: "/inbox",
    href: "/inbox",
    context: "local",
    // useNav's owner branch only picks up SPA-exclusive nav items that opt in
    // with an explicit `false` — omitting it hides the item entirely.
    hidden: false,
  },
  // SPA-exclusive feature with no Hubzilla app behind it, so it's toggled from
  // Settings → Integrations like Tools and Games.
  frontendFeature: {
    label: () => useI18n().t("nav.inbox"),
    defaultEnabled: false,
  },
  permissions: [],
});
