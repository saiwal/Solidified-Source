// src/modules/post/index.ts
import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "post",
  i18n: ["blocklist"],
  routes: [
    { path: "/display/:uuid", component: () => import("./views/PostView") },
    { path: "/item/:uuid",    component: () => import("./views/PostView") },
  ],
  widgets: [
    {
      // Items sharing hashtags/categories with the one on screen; renders
      // nothing off a single-item page.
      id: "post.related",
      label: () => useI18n().t("widgets.related"),
      loader: () => import("@/shared/stream/components/RelatedItemsWidget"),
      slot: ["right", "footer"],
      defaultSlot: "right",
      defaultModules: ["post"],
      contexts: ["post"],
    },
  ],
});
