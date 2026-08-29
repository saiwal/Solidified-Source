import { registerTour } from "@utsukta/spa-core/lib/tours";

registerTour({
  id: "hq-demo",
  label: (t) => t("tour.hq_demo_label"),
  description: (t) => t("tour.hq_demo_desc"),
  path: "/hq",
  steps: [
    {
      selector: '[data-tour="hq.composer"]',
      title: (t) => t("tour.hq_composer_title"),
      text: (t) => t("tour.hq_composer_text"),
    },
    {
      selector: '[data-tour="hq.drafts"]',
      title: (t) => t("tour.hq_drafts_title"),
      text: (t) => t("tour.hq_drafts_text"),
    },
    {
      selector: '[data-tour="hq.messages"]',
      title: (t) => t("tour.hq_messages_title"),
      text: (t) => t("tour.hq_messages_text"),
    },
    {
      selector: '[data-tour="hq.events"]',
      title: (t) => t("tour.hq_events_title"),
      text: (t) => t("tour.hq_events_text"),
    },
    {
      selector: '[data-tour="hq.quotas"]',
      title: (t) => t("tour.hq_quotas_title"),
      text: (t) => t("tour.hq_quotas_text"),
    },
  ],
});

/** Clicks a tour anchor — how a step opens the modal it wants to spotlight. */
const click = (anchor: string) => () =>
  document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)?.click();

// Ordered so at most one composer modal is open at a time: DM modal first,
// closed again before the inline quick composer, then the full post composer.
registerTour({
  id: "dm-demo",
  label: (t) => t("tour.dm_label"),
  description: (t) => t("tour.dm_desc"),
  path: "/hq",
  steps: [
    {
      selector: '[data-tour="hq.messages.direct"]',
      title: (t) => t("tour.dm_inbox_title"),
      text: (t) => t("tour.dm_inbox_text"),
    },
    {
      selector: '[data-tour="hq.quick_compose.dm"]',
      title: (t) => t("tour.dm_button_title"),
      text: (t) => t("tour.dm_button_text"),
    },
    {
      selector: '[data-tour="composer.recipient"]',
      before: click("hq.quick_compose.dm"),
      title: (t) => t("tour.dm_recipient_title"),
      text: (t) => t("tour.dm_recipient_text"),
      on: "bottom",
    },
    {
      selector: '[data-tour="hq.composer.placeholder"]',
      before: click("composer.close"),
      title: (t) => t("tour.dm_quick_title"),
      text: (t) => t("tour.dm_quick_text"),
    },
    {
      selector: '[data-tour="hq.composer.acl"]',
      before: click("hq.composer.placeholder"),
      title: (t) => t("tour.dm_quick_acl_title"),
      text: (t) => t("tour.dm_quick_acl_text"),
      on: "top",
    },
    {
      selector: '[data-tour="post.composer.acl"]',
      before: click("hq.composer.full"),
      title: (t) => t("tour.dm_post_acl_title"),
      text: (t) => t("tour.dm_post_acl_text"),
      on: "top",
    },
  ],
});
