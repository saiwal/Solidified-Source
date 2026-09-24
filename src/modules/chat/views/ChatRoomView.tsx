// src/modules/chat/views/ChatRoomView.tsx
//
// A room is a hosted window now (views/ChatWindow.tsx), not a page. This route
// only keeps /chat/:nick/:roomId links (invites, bookmarks, reloads) working:
// it opens the window and swaps the URL for the room list underneath it.
import { createEffect } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { openChat } from "@/shared/views/modal-host";

export default function ChatRoomView() {
	const params = useParams<{ nick: string; roomId: string }>();
	const navigate = useNavigate();
	createEffect(() => {
		const roomId = parseInt(params.roomId);
		if (params.nick && roomId) openChat(params.nick, roomId);
		navigate(`/chat/${params.nick}`, { replace: true });
	});
	return null;
}
