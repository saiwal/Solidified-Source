import { createSignal } from "solid-js";

// Global total unread count shared between NotificationsAside (writer)
// and Layout (reader). Kept outside any component so it survives navigation.
const [notifCount, setNotifCount] = createSignal(0);
export { notifCount, setNotifCount };
