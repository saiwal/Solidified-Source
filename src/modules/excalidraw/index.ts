/**
 * Registered purely for its frontendFeature toggle (Settings → Integrations)
 * and the isModuleActive() gate it drives — no routes/navItem of its own.
 * The actual UI is a /tools subsection (see modules/tools/tools-registry.ts)
 * and an editor toolbar button (see shared/editor/excalidraw).
 */
import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "excalidraw",
  routes: [],
  frontendFeature: {
    label: () => useI18n().t("nav.excalidraw"),
    description: () => useI18n().t("nav.excalidraw_desc"),
    defaultEnabled: false,
  },
});
