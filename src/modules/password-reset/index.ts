import { registerModule } from "@utsukta/spa-core/module-registry";

registerModule({
  id: "password-reset",
  i18n: ["auth"],
  routes: [
    { path: "/forgot-password", component: () => import("./views/ForgotPasswordView") },
    { path: "/reset-password/:token", component: () => import("./views/ResetPasswordView") },
  ],
  slots: {},
  permissions: [],
});
