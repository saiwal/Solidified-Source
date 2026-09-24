// src/modules/chat/widgets/BookmarkedRoomsWidget.tsx
import { For, Show, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { isLocalUser } from "@utsukta/spa-core/store/auth-store";
import {
  bookmarks,
  loading,
  loadChatBookmarks,
  removeChatBookmark,
  type ChatBookmark,
} from "../bookmarks";
import { MdOutlineBookmark_border, MdOutlineDelete } from "solid-icons/md";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchRooms } from "../api";
import { isChatUnread } from "../unread";

/**
 * Unread dot for a bookmark pointing at a room on this hub. Rooms on other
 * hubs get none — the browser can't ask them. Bookmarks of the same channel
 * share one cached room-list fetch.
 */
function UnreadDot(props: { url: string }) {
  const { t } = useI18n();
  const target = () => {
    try {
      const u = new URL(props.url);
      const m = u.origin === location.origin && u.pathname.match(/^\/chat\/([^/]+)\/(\d+)$/);
      return m ? { nick: m[1], id: Number(m[2]) } : null;
    } catch {
      return null;
    }
  };
  const [data] = createQueryResource("chat-rooms", () => target()?.nick ?? null, fetchRooms);
  const room = () => data.error ? undefined : data()?.rooms.find((r) => r.id === target()?.id);
  return (
    <Show when={room() && isChatUnread(target()!.nick, room()!)}>
      <span class="w-2 h-2 rounded-full bg-accent shrink-0" role="img" aria-label={t("chat.unread") as string} />
    </Show>
  );
}

export default function BookmarkedRoomsWidget() {
  const { t } = useI18n();
  const navigate = useNavigate();

  onMount(loadChatBookmarks);

  // Rooms on this hub open in the SPA; rooms on another hub can't (the chat
  // API is local), so they open on their own hub, logged in via zid.
  function openBookmark(bm: ChatBookmark) {
    let u: URL;
    try {
      u = new URL(bm.url, location.origin);
    } catch {
      return;
    }
    if (u.origin === location.origin) navigate(u.pathname);
    else window.open(bm.visit_url || bm.url, "_blank", "noopener");
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
                <UnreadDot url={bm.url} />
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
