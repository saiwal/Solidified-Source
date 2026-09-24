import { createEffect, Show, For, on } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { openChat } from "@/shared/views/modal-host";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import {
  rooms,
  roomsLoading,
  isOwner,
  chatroomsInstalled,
  loadRooms,
  deleteChatRoom,
} from "../store";
import {
  MdFillChat,
  MdFillPeople,
  MdFillDelete,
  MdFillSchedule,
  MdOutlineTimer,
} from "solid-icons/md";
import formatPostDate from "@utsukta/spa-core/lib/date";

function formatExpiry(minutes: number, neverLabel: string, expiresLabel: string): string {
  if (minutes === 0) return neverLabel;
  if (minutes < 60) return `${expiresLabel} ${minutes}m`;
  if (minutes < 1440) return `${expiresLabel} ${Math.round(minutes / 60)}h`;
  return `${expiresLabel} ${Math.round(minutes / 1440)}d`;
}

export default function ChatContentWidget() {
  const { t } = useI18n();
  const nick = usePageNick();

  createEffect(on(nick, (n) => {
    if (n) loadRooms(n);
  }));

  async function handleDrop(roomId: number, name: string) {
    if (!confirm(`Delete chatroom "${name}"?`)) return;
    await deleteChatRoom(nick(), roomId);
  }

  return (
    <>
      <div class="max-w-3xl mx-auto px-4 pb-6 space-y-4">
        {/* App not installed */}
        <Show when={!chatroomsInstalled() && !roomsLoading()}>
          <div class="bg-surface border border-rim rounded-xl p-8 text-center space-y-2">
            <MdFillChat class="text-3xl text-muted mx-auto" />
            <p class="text-sm text-muted">{t("chat.not_installed")}</p>
          </div>
        </Show>

        {/* Loading */}
        <Show when={roomsLoading()}>
          <div class="space-y-3">
            <For each={[0, 1, 2]}>
              {() => (
                <div class="bg-surface border border-rim rounded-xl p-4 h-16 animate-pulse" />
              )}
            </For>
          </div>
        </Show>

        {/* Empty */}
        <Show when={!roomsLoading() && chatroomsInstalled() && rooms().length === 0}>
          <div class="bg-surface border border-rim rounded-xl p-8 text-center space-y-2">
            <MdFillChat class="text-3xl text-muted mx-auto" />
            <p class="text-sm text-muted">{t("chat.no_chatrooms")}</p>
            <Show when={isOwner()}>
              <p class="text-xs text-muted">{t("chat.create_hint")}</p>
            </Show>
          </div>
        </Show>

        {/* Room list */}
        <Show when={!roomsLoading() && rooms().length > 0}>
          <div class="space-y-2">
            <For each={rooms()}>
              {(room) => (
                <div class="bg-surface border border-rim rounded-xl p-4 flex items-center gap-3 hover:bg-elevated transition-colors group">
                  <button
                    onClick={() => openChat(nick(), room.id, room.name)}
                    class="flex-1 flex items-center gap-3 text-left min-w-0"
                  >
                    <div class="w-9 h-9 rounded-full bg-accent-muted flex items-center justify-center shrink-0">
                      <MdFillChat class="text-accent text-base" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium text-txt truncate">{room.name}</p>
                      <div class="flex items-center gap-3 mt-0.5">
                        <span class="flex items-center gap-1 text-xs text-muted">
                          <MdFillPeople class="text-sm" />
                          {room.in_room} {t("chat.online")}
                        </span>
                        <Show when={room.last_msg}>
                          <span class="flex items-center gap-1 text-xs text-muted">
                            <MdFillSchedule class="text-sm" />
                            {formatPostDate(room.last_msg!)}
                          </span>
                        </Show>
                        <span class="flex items-center gap-1 text-xs text-muted">
                          <MdOutlineTimer class="text-sm" />
                          {formatExpiry(room.expire, t("chat.expire_never") as string, t("chat.expire_label") as string)}
                        </span>
                      </div>
                    </div>
                  </button>
                  <Show when={isOwner()}>
                    <button
                      onClick={() => handleDrop(room.id, room.name)}
                      class="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-elevated transition-all"
                      title={t("chat.delete_room") as string}
                    >
                      <MdFillDelete class="text-base" />
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </>
  );
}
