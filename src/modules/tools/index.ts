import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { TOOLS } from "./tools-registry";

const toolView = () => import("./views/ToolsPage");

registerModule({
  id: "tools",
  routes: [
    { path: "/tools",      component: toolView },
    ...TOOLS.map((tool) => ({ path: `/tools/${tool.id}`, component: toolView })),
  ],
  navItem: {
    path: "/tools",
    href: "/tools",
    label: () => useI18n().t("nav.tools"),
    icon: "tools",
    hidden: false,
  },
  frontendFeature: {
    label: () => useI18n().t("nav.tools"),
    description: () => useI18n().t("nav.tools_desc"),
    defaultEnabled: false,
  },
});

export {};
