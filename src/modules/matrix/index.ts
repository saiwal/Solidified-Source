import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

// The built-in Matrix client lives in Messenger (its Matrix tab, see
// messenger/matrix/). This module exists only to make it an app the user
// switches on in Settings → Integrations, like Jellyfin: no routes, no nav item.
// Gate checks go through matrixEnabled() (messenger/matrix-session.ts).
registerModule({
  id: "matrix",
  routes: [],
  requiresAuth: true,
  frontendFeature: {
    label: () => useI18n().t("nav.matrix"),
    description: () => useI18n().t("nav.matrix_desc"),
    defaultEnabled: false,
  },
});
