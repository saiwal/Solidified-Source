// src/modules/chat/widgets/BookmarkedRoomsWidget.tsx
import { For, Show, onMount, type JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
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
  const target = () => localRoomOf(props.bm);
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

/** A bookmark of a room on this hub, as nick + id; null for anything else. */
export function localRoomOf(bm: ChatBookmark): { nick: string; id: number } | null {
  try {
    const u = new URL(bm.url, location.origin);
    const m = u.origin === location.origin && u.pathname.match(/^\/chat\/([^/]+)\/(\d+)\/?$/);
    return m ? { nick: decodeURIComponent(m[1]), id: Number(m[2]) } : null;
  } catch {
    return null;
  }
}

/** What a custom row gets: the behaviour, with the layout left to the host. */
export interface BookmarkRowParts {
  open: () => void;
  remove: () => void;
  /** Unread dot (renders nothing when read). */
  unread: JSX.Element;
  /** Web Push toggle (renders nothing for a room on this hub). */
  push: JSX.Element;
  /** This hub's room behind the bookmark, or null for another hub's. */
  room: { nick: string; id: number } | null;
}

/**
 * The bookmark rows: open, unread dot, remote push toggle, unbookmark. The
 * widget frames them in a card; Messenger draws its own rows (`row`) as its
 * pinned rooms.
 */
export function BookmarkedRoomsList(props: {
  /** Which bookmarks to show — the host's search box. */
  filter?: (bm: ChatBookmark) => boolean;
  /** Custom row layout; omitted, the widget's compact row. */
  row?: (bm: ChatBookmark, parts: BookmarkRowParts) => JSX.Element;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();

  onMount(loadChatBookmarks);

  // A room on this hub opens in Messenger (/chat/:nick/:id). Rooms on
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
    if (u.origin === location.origin && room) navigate(`/chat/${room[1]}/${room[2]}`);
    else if (u.origin === location.origin) navigate(u.pathname);
    else {
      markRemoteChatSeen(bm);
      // #room: legacy hint for SPA hubs that predate Messenger serving /chat.
      window.open((bm.visit_url || bm.url).split("#")[0] + "#room", "_blank", "noopener");
    }
  }

  return (
    <div class="divide-y divide-rim">
      <For each={props.filter ? bookmarks().filter(props.filter) : bookmarks()}>
        {(bm) => {
          const push = (
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
          );
          const parts: BookmarkRowParts = {
            open: () => openBookmark(bm),
            remove: () => void removeChatBookmark(bm.id),
            unread: <UnreadDot bm={bm} />,
            push,
            room: localRoomOf(bm),
          };
          if (props.row) return props.row(bm, parts);
          return (
            <div class="flex items-center gap-2 px-3 py-2.5 hover:bg-elevated group transition-colors">
              <button
                class="flex-1 text-left text-xs text-txt truncate hover:text-accent transition-colors"
                onClick={parts.open}
              >
                {bm.title}
              </button>
              {parts.unread}
              {parts.push}
              <button
                onClick={parts.remove}
                class="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded text-muted hover:text-red-500 transition-all shrink-0"
                title={t("chat.unbookmark") as string}
              >
                <MdOutlineDelete class="w-3.5 h-3.5" />
              </button>
            </div>
          );
        }}
      </For>
    </div>
  );
}

export default function BookmarkedRoomsWidget() {
  const { t } = useI18n();
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

        <BookmarkedRoomsList />
      </div>
    </Show>
  );
}
