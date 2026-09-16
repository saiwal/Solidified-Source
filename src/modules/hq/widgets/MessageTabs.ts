// Tab ids are MessageList's own feed types, so the active tab passes straight
// through as `type`. Shared with the widget's config form.
export type Tab = "" | "direct" | "notification" | "folder";

export const TABS: { id: Tab; key: string }[] = [
  { id: "", key: "hq.msg_tab_all" },
  { id: "direct", key: "hq.msg_tab_direct" },
  { id: "notification", key: "hq.msg_tab_notices" },
  { id: "folder", key: "hq.msg_tab_folders" },
];
