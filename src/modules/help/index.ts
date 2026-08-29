// src/modules/help/index.tsx
import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import "./tours";

registerModule({
  id: "help",
  routes: [
      {
      // Wildcard captures any depth: /help/about, /help/admin/toc, etc.
      path: "/help/*rest",
      component: () => import("./views/HelpView"),
    },
  ],
  navItem: {
    label: () => useI18n().t("nav.help"),
    href: "/help/user/",
    path: "/help",
    icon: "help",
    context: "all",
  },
  widgets: [
    {
      id: "help.chooser",
      label: () => useI18n().t("widgets.help_chooser"),
      loader: () => import("./widgets/HelpChooserWidget"),
      slot: ["header"],
      defaultModules: ["help"],
    },
    {
      id: "help.content",
      label: () => useI18n().t("widgets.help_content"),
      loader: () => import("./widgets/HelpContentWidget"),
      slot: "contentTop",
      defaultModules: ["help"],
      contexts: ["help"],
      locked: true,
    },
		{
      id: "help.tours",
      label: () => useI18n().t("widgets.help_tours"),
      loader: () => import("./widgets/HelpToursWidget"),
      slot: "right",
      defaultModules: ["help"],
      contexts: "any",
      helpTarget: "widgets.guided_tours",
      visitorVisible: false,
    },

    {
      id: "help.nav",
      label: () => useI18n().t("widgets.help_nav"),
      loader: () => import("./widgets/HelpNavWidget"),
      slot: "right",
      defaultModules: ["help"],
      helpTarget: "widgets.navigation_tree",
    },
    ],
});
