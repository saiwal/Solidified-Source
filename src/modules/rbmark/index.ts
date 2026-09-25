// src/modules/rbmark/index.ts
// `/rbmark` — core's "bookmark this on my hub" landing page, which other hubs
// link to (get_bookmark_link(): a chatroom's "Bookmark this room", the
// bookmarklet). The SPA shell serves every page, so without this route core's
// form never shows. Its own module because the bookmarks and chat modules are
// both app-gated, and a visitor's home channel may have neither app.
import { registerModule } from "@utsukta/spa-core/module-registry";

registerModule({
  id: "rbmark",
  routes: [{ path: "/rbmark", component: () => import("./views/RbmarkView") }],
  requiresAuth: true,
});
