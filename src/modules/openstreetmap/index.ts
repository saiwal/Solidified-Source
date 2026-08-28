/**
 * Registered purely for its gate — no routes/navItem of its own. The feature
 * is a composer toolbar button (see shared/editor/map) plus [map] rendering
 * (see spa-core/lib/useOsmMap.ts).
 *
 * Two conditions:
 *  - frontendFeature — per-user opt-in under Settings → Integrations, enforced
 *    by isModuleActive() like any other toggleable module.
 *  - the core openstreetmap addon being enabled site-wide, which use sites
 *    check as `navData()?.osm` (Nav.php sends that addon's config, or null).
 *    It matters beyond tidiness: that addon's content_security_policy hook is
 *    what whitelists the tile server for frame-src, so without it an embedded
 *    map can't render at all. It is NOT expressed as appUrlSlug — see Nav.php
 *    for why a site-level entry must not go into the per-channel app list.
 */
import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "openstreetmap",
  routes: [],
  frontendFeature: {
    label: () => useI18n().t("nav.openstreetmap"),
    defaultEnabled: false,
  },
});
