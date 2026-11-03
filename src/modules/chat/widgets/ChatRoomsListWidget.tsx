// src/modules/chat/widgets/ChatRoomsListWidget.tsx
// The page channel's chatrooms; a click joins the room in a hosted chat window
// (openChat), so it works from HQ or any sidebar without leaving the page.
import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { openChat } from "@/shared/views/modal-host";
import { MdFillPeople } from "solid-icons/md";
import { fetchRooms } from "../api";
import { isChatUnread } from "../unread";
import { WidgetShell } from "@ui/WidgetShell";

export default function ChatRoomsListWidget() {
  const { t } = useI18n();
  const nick = usePageNick();
  const [data] = createQueryResource("chat-rooms", () => nick() || null, fetchRooms);

  return (
    // Hidden where the channel has no chatrooms app (or the fetch failed).
    <Show when={data.error ? null : data()?.chatrooms_installed !== false}>
      <WidgetShell
        title={t("chat.chatrooms")}
        actions={
          <A href={`/chat/${nick()}`} class="text-xs text-muted hover:text-accent transition-colors">
            {t("widgets.view_all")}
          </A>
        }
      >

        <Show when={data.loading && !data()}>
          <div class="px-(--ws-px) pb-3 space-y-2 animate-pulse">
            <For each={[1, 2, 3]}>{() => <div class="h-3 bg-elevated rounded w-4/5" />}</For>
          </div>
        </Show>

        <Show when={data() && data()!.rooms.length === 0}>
          <p class="px-(--ws-px) pb-4 text-xs text-muted text-center">{t("chat.no_chatrooms")}</p>
        </Show>

        <div class="divide-y divide-rim border-t border-rim empty:border-t-0 max-h-[26rem] overflow-y-auto">
          <For each={data()?.rooms}>
            {(room) => (
              <button
                type="button"
                onClick={() => openChat(nick(), room.id, room.name)}
                class="w-full flex items-center gap-2 px-(--ws-px) py-2.5 text-left hover:bg-elevated transition-colors"
              >
                <span class="flex-1 min-w-0 text-sm text-txt truncate">{room.name}</span>
                <Show when={isChatUnread(nick(), room)}>
                  <span class="w-2 h-2 rounded-full bg-accent shrink-0" role="img" aria-label={t("chat.unread") as string} />
                </Show>
                <span class="flex items-center gap-1 shrink-0 text-xs text-muted tabular-nums">
                  <MdFillPeople class="text-sm" />
                  {room.in_room}
                </span>
              </button>
            )}
          </For>
        </div>
      </WidgetShell>
    </Show>
  );
}
