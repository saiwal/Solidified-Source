// src/modules/chat/widgets/BookmarkedRoomsWidget.tsx
import { For, Show, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { openChat } from "@/shared/views/modal-host";
import { useI18n } from "@utsukta/spa-core/i18n";
import { isLocalUser } from "@utsukta/spa-core/store/auth-store";
import {
  bookmarks,
  loading,
  loadChatBookmarks,
  removeChatBookmark,
  setChatPush,
  isRemoteBookmark,
  type ChatBookmark,
} from "../bookmarks";
import {
  MdOutlineBookmark_border,
  MdOutlineDelete,
  MdOutlineNotifications_active,
  MdOutlineNotifications_off,
} from "solid-icons/md";
import { toast } from "@utsukta/spa-core/store/toast";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchRooms } from "../api";
import { isChatUnread, isRemoteChatUnread, markRemoteChatSeen } from "../unread";

/**
 * Unread dot for a bookmarked room. On this hub it reads the channel's room
 * list (bookmarks of one channel share one cached fetch); on another hub it
 * reads `last_other`, which that hub's notices keep current (ChatFed).
 */
function UnreadDot(props: { bm: ChatBookmark }) {
  const { t } = useI18n();
  const target = () => {
    try {
      const u = new URL(props.bm.url);
      const m = u.origin === location.origin && u.pathname.match(/^\/chat\/([^/]+)\/(\d+)\/?$/);
      return m ? { nick: m[1], id: Number(m[2]) } : null;
    } catch {
      return null;
    }
  };
  const [data] = createQueryResource("chat-rooms", () => target()?.nick ?? null, fetchRooms);
  const room = () => data.error ? undefined : data()?.rooms.find((r) => r.id === target()?.id);
  return (
    <Show when={isRemoteBookmark(props.bm)
      ? isRemoteChatUnread(props.bm)
      : room() && isChatUnread(target()!.nick, room()!)}>
      <span class="w-2 h-2 rounded-full bg-accent shrink-0" role="img" aria-label={t("chat.unread") as string} />
    </Show>
  );
}

export default function BookmarkedRoomsWidget() {
  const { t } = useI18n();
  const navigate = useNavigate();

  onMount(loadChatBookmarks);

  // A room on this hub opens straight into a chat window over the current page,
  // as ChatRoomsListWidget does. (Navigating to /chat/:nick/:id would too, but
  // ChatRoomView then swaps the page for that channel's room list.) Rooms on
  // another hub can't (the chat API is local), so they open on their own hub,
  // logged in via zid.
  function openBookmark(bm: ChatBookmark) {
    let u: URL;
    try {
      u = new URL(bm.url, location.origin);
    } catch {
      return;
    }
    const room = u.pathname.match(/^\/chat\/([^/]+)\/(\d+)\/?$/);
    if (u.origin === location.origin && room) openChat(decodeURIComponent(room[1]), Number(room[2]), bm.title);
    else if (u.origin === location.origin) navigate(u.pathname);
    else {
      markRemoteChatSeen(bm);
      // #room: an SPA hub keeps that tab on the room (see ChatRoomView).
      window.open((bm.visit_url || bm.url).split("#")[0] + "#room", "_blank", "noopener");
    }
  }

  return (
    <Show when={isLocalUser()}>
      <div class="bg-surface border border-rim rounded-2xl shadow-sm overflow-hidden">

        {/* Header */}
        <div class="px-4 pt-3.5 pb-3 flex items-center gap-2">
          <MdOutlineBookmark_border class="w-4 h-4 text-accent shrink-0" />
          <h3 class="text-sm font-semibold text-txt flex-1">{t("chat.bookmarked_rooms")}</h3>
          <Show when={!loading() && bookmarks().length > 0}>
            <span class="text-xs text-muted tabular-nums">{bookmarks().length}</span>
          </Show>
        </div>

        {/* Skeleton */}
        <Show when={loading()}>
          <div class="px-4 py-3 space-y-2 animate-pulse">
            <For each={[1, 2, 3]}>{() => <div class="h-3 bg-elevated rounded w-4/5" />}</For>
          </div>
        </Show>

        {/* Empty */}
        <Show when={!loading() && bookmarks().length === 0}>
          <p class="px-4 py-6 text-xs text-muted text-center">{t("chat.no_bookmarks")}</p>
        </Show>

        {/* List */}
        <div class="divide-y divide-rim">
          <For each={bookmarks()}>
            {(bm) => (
              <div class="flex items-center gap-2 px-3 py-2.5 hover:bg-elevated group transition-colors">
                <button
                  class="flex-1 text-left text-xs text-txt truncate hover:text-accent transition-colors"
                  onClick={() => openBookmark(bm)}
                >
                  {bm.title}
                </button>
                <UnreadDot bm={bm} />
                <Show when={isRemoteBookmark(bm)}>
                  <button
                    onClick={async () => {
                      if (!(await setChatPush(bm.id, !bm.push))) toast.error(t("chat.remote_push_failed"));
                    }}
                    class="p-1 rounded shrink-0 transition-colors"
                    classList={{
                      "text-accent": !!bm.push,
                      "text-muted hover:text-txt": !bm.push,
                    }}
                    title={t(bm.push ? "chat.remote_push_on" : "chat.remote_push_off") as string}
                    aria-label={t(bm.push ? "chat.remote_push_on" : "chat.remote_push_off") as string}
                    aria-pressed={!!bm.push}
                  >
                    {bm.push
                      ? <MdOutlineNotifications_active class="w-3.5 h-3.5" />
                      : <MdOutlineNotifications_off class="w-3.5 h-3.5" />}
                  </button>
                </Show>
                <button
                  onClick={() => void removeChatBookmark(bm.id)}
                  class="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded text-muted hover:text-red-500 transition-all shrink-0"
                  title={t("chat.unbookmark") as string}
                >
                  <MdOutlineDelete class="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
