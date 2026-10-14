import { registerModule } from "@utsukta/spa-core/module-registry";

// No requiresAuth guard — same reasoning as channel-create: an account with
// no channel yet has no local_channel(), so auth-store's isLoggedIn is false
// for it and AuthGuard would bounce straight to /login. This is also the
// entire point of this route: importing a channel from a file/old hub is how
// a channel-less account gets its first channel. The view authenticates
// itself via the account-level POST /api/portability/import call instead.
registerModule({
  id: "channel-import",
  i18n: ["channel_create", "settings"],
  routes: [{ path: "/import", component: () => import("./views/ImportChannelView") }],
  slots: {},
  permissions: [],
});
