import { registerModule } from "@utsukta/spa-core/module-registry";

registerModule({
  id: "chanview",
  i18n: ["channel", "network"],
  routes: [
    { path: "/chanview", component: () => import("./views/ChanView") },
  ],
  permissions: [],
});
