import { registerTour } from "@utsukta/spa-core/lib/tours";

// Layout chrome, not a route — no `path`, so it runs wherever the user starts
// it. The desktop-only and mobile-only steps both listed: `startTour` keeps
// whichever of the pair actually has a layout box and drops the other.
registerTour({
  id: "ui-basics",
  label: (t) => t("tour.ui_label"),
  description: (t) => t("tour.ui_desc"),
  steps: [
    {
      selector: '[data-tour="nav.primary"]',
      title: (t) => t("tour.ui_nav_title"),
      text: (t) => t("tour.ui_nav_text"),
      on: "right",
    },
    {
      selector: '[data-tour="nav.bottom"]',
      title: (t) => t("tour.ui_bottom_title"),
      text: (t) => t("tour.ui_bottom_text"),
      on: "top",
    },
    {
      selector: '[data-tour="nav.user_menu"]',
      title: (t) => t("tour.ui_user_menu_title"),
      text: (t) => t("tour.ui_user_menu_text"),
      on: "right",
    },
    {
      selector: "#main-content",
      title: (t) => t("tour.ui_content_title"),
      text: (t) => t("tour.ui_content_text"),
    },
    {
      selector: "#right-sidebar",
      title: (t) => t("tour.ui_sidebar_title"),
      text: (t) => t("tour.ui_sidebar_text"),
      on: "left",
    },
    {
      selector: '[data-tour="nav.edit_layout"]',
      title: (t) => t("tour.ui_edit_layout_title"),
      text: (t) => t("tour.ui_edit_layout_text"),
      on: "right",
    },
  ],
});
