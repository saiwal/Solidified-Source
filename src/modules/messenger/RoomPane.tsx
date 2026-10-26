// src/modules/messenger/RoomPane.tsx
// A chatroom inline in Messenger: its own room session (joins on mount, leaves
// on unmount) around the same ChatRoomPane the chat window uses.
import { Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillChat, MdOutlineDelete, MdOutlineLogout } from "solid-icons/md";
import { toast } from "@utsukta/spa-core/store/toast";
import { createRoomSession, deleteChatRoom } from "@/modules/chat/store";
import PageActions from "@/shared/views/layout/PageActions";
import ChatRoomPane from "@/modules/chat/views/ChatRoomPane";
import { BackButton } from "./DmPane";

export default function RoomPane(props: { back: string; nick: string; roomId: number }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const room = createRoomSession(props.nick, props.roomId);
  async function drop() {
    if (!confirm(`${t("chat.delete_room")}: ${room.name()}?`)) return;
    try {
      await deleteChatRoom(props.nick, props.roomId);
      navigate(props.back, { replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div class="flex flex-col flex-1 min-h-0">
      {/* Bookmark and notify stay in the pane's own toolbar — their icons
          carry state. */}
      <PageActions mobileOnly label={room.name() || undefined} actions={[
        { label: t("chat.leave"), icon: MdOutlineLogout, onClick: () => navigate(props.back) },
        { label: t("chat.delete_room"), icon: MdOutlineDelete, onClick: () => void drop(), show: room.isOwner() },
      ]} />
      <div class="flex items-center gap-3 px-3 py-2.5 border-b border-rim shrink-0">
        <BackButton href={props.back} />
        <div class="w-9 h-9 rounded-full bg-accent-muted text-accent flex items-center justify-center shrink-0">
          <MdFillChat size={18} />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-txt truncate">{room.name() || t("chat.chatroom")}</p>
          <Show when={!room.loading()}>
            <p class="text-xs text-muted">{room.presence().length} {t("chat.online_count")}</p>
          </Show>
        </div>
      </div>
      <ChatRoomPane nick={props.nick} roomId={props.roomId} room={room} onClose={() => navigate(props.back)} />
    </div>
  );
}
