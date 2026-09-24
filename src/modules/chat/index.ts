// src/modules/chat/index.ts
import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";

registerModule({
  id: "chat",
  routes: [
    // Room list: /chat/:nick
    {
      path: "/chat/:nick",
      component: () => import("./views/ChatRoomsView"),
    },
    // Individual room: /chat/:nick/:roomId
    {
      path: "/chat/:nick/:roomId",
      component: () => import("./views/ChatRoomView"),
    },
  ],
  navItem: {
    label: () => useI18n().t("nav.chat"),
    icon: "chat",
    path: "/chat",
    // nav link always targets the subject nick's chat
    href: () => `/chat/${usePageNick()()}`,
    context: "all", // only shown in channel context
    // hidden: true,       // excluded from main nav; shown via channel_tabs
  },
  widgets: [
    {
      id: "chat.header",
      label: () => useI18n().t("widgets.chat_header"),
      loader: () => import("./widgets/ChatHeaderWidget"),
      slot: "header",
      defaultModules: ["chat"],
      contexts: ["chat"],
      locked: true,
    },
    {
      id: "chat.content",
      label: () => useI18n().t("widgets.chat_content"),
      loader: () => import("./widgets/ChatContentWidget"),
      slot: "contentTop",
      defaultModules: ["chat"],
      contexts: ["chat"],
      locked: true,
    },
    {
      // Room list with one-click join into a chat window. Two ids for two
      // slots (same as hq.quick_compose/_right) — a widget can't change slot.
      id: "chat.rooms_list",
      label: () => useI18n().t("widgets.chatrooms_list"),
      loader: () => import("./widgets/ChatRoomsListWidget"),
      slot: "contentTop",
      defaultModules: [],
      defaultSpan: 3,
      contexts: "any",
      helpTarget: "widgets.chatrooms_list",
    },
    {
      id: "chat.rooms_list_right",
      label: () => useI18n().t("widgets.chatrooms_list"),
      loader: () => import("./widgets/ChatRoomsListWidget"),
      slot: "right",
      defaultModules: ["hq"],
      contexts: "any",
      helpTarget: "widgets.chatrooms_list",
    },
    {
      id: "chat.bookmarkedRooms",
      label: () => useI18n().t("widgets.bookmarked_rooms"),
      loader: () => import("./widgets/BookmarkedRoomsWidget"),
      slot: "right",
      visitorVisible: false,
      helpTarget: "widgets.bookmarked_rooms",
    },
    {
      // Opt-in chatroom showcase; place several, each configured with a room
      id: "chat.room_card",
      label: () => useI18n().t("widgets.room_card"),
      loader: () => import("./widgets/RoomCardWidget"),
      slot: "right",
      defaultModules: [],
      contexts: ["channel", "profile", "chat"],
      multiInstance: true,
      configComponent: () => import("./widgets/RoomCardConfig"),
      helpTarget: "widgets.chat_room_card",
    },
  ],
  permissions: [],
  appUrlSlug: "/chat/",
});
