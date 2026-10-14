// src/modules/post/index.ts
import { registerModule } from "@utsukta/spa-core/module-registry";

registerModule({
  id: "post",
  i18n: ["blocklist"],
  routes: [
    { path: "/display/:uuid", component: () => import("./views/PostView") },
    { path: "/item/:uuid",    component: () => import("./views/PostView") },
  ],
});
