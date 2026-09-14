import { createSignal } from "solid-js";

// Global total unread count shared between NotificationsAside (writer)
// and Layout (reader). Kept outside any component so it survives navigation.
const [notifCount, setNotifCount] = createSignal(0);
export { notifCount, setNotifCount };

// Unread direct messages, for the inbox nav badge. Same writer, same reason to
// live outside a component — and no second poller for a number already on the
// wire.
const [mailUnread, setMailUnread] = createSignal(0);
export { mailUnread, setMailUnread };
