// src/modules/cal/index.ts

import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";

registerModule({
  id: "cal",
  i18n: ["calendar"],
  routes: [
    { path: "/cdav/calendar", component: () => import("./views/CalView") },
    { path: "/cal/:nick", component: () => import("./views/CalView") },
  ],
  navItem: {
    label: () => useI18n().t("nav.calendar"),
    icon: "calendar",
    path: "/cal",
    href: () => `/cal/${usePageNick()()}`,
    context: "all",
    hidden: false,
  },
  widgets: [
    {
      id: "cal.header",
      label: () => useI18n().t("widgets.cal_header"),
      loader: () => import("./widgets/CalendarHeaderWidget"),
      slot: "header",
      defaultModules: ["cal"],
      contexts: ["cal"],
      locked: true,
    },
    {
      id: "cal.content",
      label: () => useI18n().t("widgets.cal_content"),
      loader: () => import("./widgets/CalendarContentWidget"),
      slot: "contentTop",
      defaultModules: ["cal"],
      contexts: ["cal"],
      locked: true,
    },
    {
      id: "cal.calendar",
      label: () => useI18n().t("widgets.calendar"),
      loader: () => import("./widgets/CdavCalendarWidget"),
      slot: "right",
      visitorVisible: false,
      helpTarget: "calendar.caldav_calendars_widget",
    },
    {
      // Opt-in event showcase; place several, each configured with an event
      id: "cal.event_card",
      label: () => useI18n().t("widgets.event_card"),
      loader: () => import("./widgets/EventCardWidget"),
      slot: "right",
      defaultModules: [],
      contexts: ["channel", "profile", "cal"],
      multiInstance: true,
      configComponent: () => import("./widgets/EventCardConfig"),
      helpTarget: "widgets.event_card",
    },
  ],
  permissions: [],
  appUrlSlug: "/cdav/calendar",
});
