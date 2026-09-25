// src/modules/chat/views/ChatRoomView.tsx
//
// A room is a hosted window now (views/ChatWindow.tsx), not a page. This route
// only keeps /chat/:nick/:roomId links (invites, bookmarks, reloads) working:
// it opens the window and swaps the URL for the room list underneath it.
//
// Except with `#room`, which the Bookmarked Rooms widget on *another* SPA hub
// adds when it opens one of this hub's rooms in a new tab: that tab exists only
// for the room, so the window opens full-page and the URL stays on the room.
// A hash because it survives the zid/OWA login redirects a query param may not,
// and a plain Hubzilla hub simply ignores it.
import { createEffect } from "solid-js";
import { useLocation, useNavigate, useParams } from "@solidjs/router";
import { openChat } from "@/shared/views/modal-host";

export default function ChatRoomView() {
	const params = useParams<{ nick: string; roomId: string }>();
	const navigate = useNavigate();
	const roomTab = useLocation().hash === "#room"; // read once, not tracked
	createEffect(() => {
		const roomId = parseInt(params.roomId);
		if (params.nick && roomId) openChat(params.nick, roomId, "", roomTab ? "page" : undefined);
		if (!roomTab) navigate(`/chat/${params.nick}`, { replace: true });
	});
	return null;
}
