// src/modules/chat/views/ChatWindow.tsx
//
// A joined chatroom, hosted by ModalHost (kind "chat", opened via openChat) so
// it gets the composer/post window modes: modal, docked, page and minimized.
// Each window owns its own room session, so several rooms can be open at once.
import { useI18n } from "@utsukta/spa-core/i18n";
import { createRoomSession } from "../store";
import ComposerModal from "@/shared/editor/components/ComposerModal";
import ChatRoomPane from "./ChatRoomPane";

export default function ChatWindow(props: { nick: string; roomId: number; onClose: () => void }) {
	const { t } = useI18n();
	const room = createRoomSession(props.nick, props.roomId);
	return (
		<ComposerModal
			title={room.name() || (room.loading() ? (t("calendar.loading") as string) : (t("chat.chatroom") as string))}
			onClose={props.onClose}
			widthClass="max-w-3xl"
		>
			<ChatRoomPane nick={props.nick} roomId={props.roomId} room={room} onClose={props.onClose} />
		</ComposerModal>
	);
}
