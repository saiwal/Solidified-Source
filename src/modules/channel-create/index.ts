import { registerModule } from "@utsukta/spa-core/module-registry";

// No requiresAuth guard: an account that has never created a channel has no
// local_channel() yet, so auth-store's isLoggedIn (which requires an active
// channel) is false for it — the AuthGuard would bounce a brand-new account
// straight to /login. The view authenticates itself via the account-level
// GET /api/new-channel call instead.
registerModule({
  id: "channel-create",
  i18n: ["settings"],
  routes: [{ path: "/new_channel", component: () => import("./views/NewChannelView") }],
  slots: {},
  permissions: [],
});
