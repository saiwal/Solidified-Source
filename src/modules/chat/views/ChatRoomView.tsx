// src/modules/chat/views/ChatRoomView.tsx
import {
	createEffect,
	createSignal,
	For,
	Show,
	onCleanup,
	createMemo,
	on,
	untrack,
} from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useParams, useNavigate } from "@solidjs/router";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import {
	messages,
	presence,
	chatLoading,
	viewerHash,
	roomName,
	roomExpire,
	roomIsOwner,
	roomAcl,
	enterRoom,
	exitRoom,
	pinRoom,
	unpinRoom,
	isRoomPinned,
	updateChatRoomExpire,
	type PinnedRoom,
} from "../store";
import {
	loadChatBookmarks,
	isRoomBookmarked,
	bookmarkIdForRoom,
	addChatBookmark,
	removeChatBookmark,
} from "../bookmarks";
import { isLocalUser } from "@utsukta/spa-core/store/auth-store";
import { MdFillArrow_back, MdFillChat, MdFillLock, MdFillLock_open, MdFillPeople, MdOutlineBookmark_border, MdOutlineTimer } from "solid-icons/md";
import formatPostDate from "@utsukta/spa-core/lib/date";
import ChatComposer from "../ChatComposer";
import DOMPurify from "dompurify";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { decryptPayload, getPayloadHint } from "@utsukta/spa-core/lib/postCrypto";
import { bbcodeDisplay } from "@utsukta/spa-core/lib/renderBody";

export default function ChatRoomView() {
	const params = useParams<{ nick: string; roomId: string }>();
	const navigate = useNavigate();
	const pageNick = usePageNick();
	const { t } = useI18n();

	const nick = () => params.nick || pageNick();
	const roomId = () => parseInt(params.roomId);

	const [showPresence, setShowPresence] = createSignal(false);
	const [expireEditing, setExpireEditing] = createSignal(false);
	const [expireUpdating, setExpireUpdating] = createSignal(false);
	const [expireCustomMode, setExpireCustomMode] = createSignal(false);
	const [expireCustomInput, setExpireCustomInput] = createSignal("60");

	let messagesEl: HTMLDivElement | undefined;

	const isBookmarked = createMemo(() => isRoomBookmarked(nick(), roomId()));
	const isPinned     = createMemo(() => isRoomPinned(nick(), roomId()));

	// Load bookmarks once for local users
	createEffect(() => { if (isLocalUser()) loadChatBookmarks(); });

	function togglePin() {
		const n = nick();
		const r = roomId();
		if (isPinned()) {
			unpinRoom(n, r);
		} else {
			pinRoom({
				nick:  n,
				roomId: r,
				name:  roomName() || (t("chat.chatroom") as string),
				acl:   roomAcl(),
			} satisfies PinnedRoom);
		}
	}

	async function toggleBookmark() {
		if (isBookmarked()) {
			const id = bookmarkIdForRoom(nick(), roomId());
			if (id) await removeChatBookmark(id);
		} else {
			await addChatBookmark(nick(), roomId(), roomName() || t("chat.chatroom") as string);
		}
	}

	// Enter room on mount / param change
	createEffect(on([nick, roomId] as const, ([n, r]) => {
		if (n && r) enterRoom(n, r);
	}));

	// Auto-scroll to bottom when new messages arrive
	createEffect(on(messages, () => {
		untrack(() => {
			if (messagesEl)
				requestAnimationFrame(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; });
		});
	}));

	// Leave on unmount
	onCleanup(() => {
		const n = nick();
		const r = roomId();
		if (n && r) exitRoom(n, r);
	});

	// Inline decrypt form for one-off clicks (when no session password is active).
	// On success we write into decryptedBodies so Solid's reactive render handles display,
	// making the result persist through polls / re-renders instead of being wiped by innerHTML.
	function handleBubbleClick(e: MouseEvent) {
		const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-crypt-payload]");
		if (!btn) return;
		e.stopPropagation();

		const payload = btn.dataset.cryptPayload ?? "";
		const msgId   = parseInt(
			(e.currentTarget as HTMLElement).dataset.msgId ?? "",
		);
		const hint = getPayloadHint(payload);

		const form = document.createElement("form");
		form.className = "hz-decrypt-form flex flex-col gap-1.5 mt-1";
		form.innerHTML = `
			<span class="text-[0.6875rem] text-muted">🔒 ${DOMPurify.sanitize(hint || "Enter passphrase")}</span>
			<div class="flex items-center gap-1.5">
				<input type="password" placeholder="Passphrase" autofocus
					class="hz-decrypt-input flex-1 bg-surface border border-rim rounded px-2 py-0.5 text-xs text-txt outline-none focus:border-rim-strong" />
				<button type="submit" class="px-2 py-0.5 rounded bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 whitespace-nowrap">
					Decrypt
				</button>
				<button type="button" class="hz-decrypt-cancel px-1.5 py-0.5 rounded text-muted hover:text-txt text-xs">
					✕
				</button>
			</div>
			<span class="hz-decrypt-error text-[0.6875rem] text-red-400 hidden"></span>
		`;

		btn.replaceWith(form);
		form.querySelector<HTMLInputElement>(".hz-decrypt-input")?.focus();
		form.querySelector(".hz-decrypt-cancel")?.addEventListener("click", () => form.replaceWith(btn));

		form.addEventListener("submit", async (ev) => {
			ev.preventDefault();
			const password = form.querySelector<HTMLInputElement>(".hz-decrypt-input")?.value ?? "";
			const submitBtn = form.querySelector<HTMLButtonElement>("button[type=submit]");
			const errorEl   = form.querySelector<HTMLElement>(".hz-decrypt-error");
			if (!password) return;
			if (submitBtn) { submitBtn.textContent = "…"; submitBtn.disabled = true; }

			try {
				const plain = await decryptPayload(payload, password);
				// Store in the signal so Solid's re-render shows decrypted content
				// and polls don't wipe it back to the encrypted button.
				if (!isNaN(msgId))
					setDecryptedBodies((prev) => new Map([...prev, [msgId, plain]]));
			} catch (err) {
				if (errorEl) {
					errorEl.textContent = err instanceof Error ? err.message : "Decryption failed";
					errorEl.classList.remove("hidden");
				}
				if (submitBtn) { submitBtn.textContent = "Decrypt"; submitBtn.disabled = false; }
			}
		});
	}

	async function handleSetExpire(val: number) {
		setExpireUpdating(true);
		try {
			await updateChatRoomExpire(nick(), roomId(), val);
		} finally {
			setExpireUpdating(false);
			setExpireEditing(false);
			setExpireCustomMode(false);
			setExpireCustomInput("60");
		}
	}

	function expireLabel(minutes: number): string {
		if (minutes === 0) return t("chat.expire_never") as string;
		if (minutes < 60) return `${minutes}m`;
		if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
		return `${Math.round(minutes / 1440)}d`;
	}

	// Stores per-message decrypted bodies (keyed by message id).
	// Written by handleBubbleClick on success; persists across polls.
	const [decryptedBodies, setDecryptedBodies] = createSignal(new Map<number, string>());

	const presenceCount = createMemo(() => presence().length);
	const isRestricted = createMemo(() => {
		const acl = roomAcl();
		if (!acl) return null;
		return acl.allow_cid.length > 0 || acl.allow_gid.length > 0 ||
		       acl.deny_cid.length > 0  || acl.deny_gid.length > 0;
	});
	const groupedMessages = createMemo(() => {
		const msgs      = messages();
		const decrypted = decryptedBodies();
		return msgs.map((msg, i) => ({
			...msg,
			// Use auto-decrypted body when available so the chat renders plaintext
			body: decrypted.get(msg.id) ?? msg.body,
			isFirst: i === 0 || msgs[i - 1].author_hash !== msg.author_hash,
			isLast:
				i === msgs.length - 1 ||
				msgs[i + 1].author_hash !== msg.author_hash,
		}));
	});

	return (
		<div class="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
			{/* Header */}
			<div class="flex items-center gap-3 px-4 py-3 border-b border-rim bg-surface shrink-0">
				<button
					onClick={() => navigate(`/chat/${nick()}`)}
					class="p-1.5 rounded-lg text-muted hover:bg-elevated hover:text-txt transition-colors"
				>
					<MdFillArrow_back class="text-lg" />
				</button>
				<div class="flex items-center gap-2 flex-1 min-w-0">
					<MdFillChat class="text-accent shrink-0" />
					<span class="font-medium text-txt text-sm truncate">
						{roomName() || (chatLoading() ? t("calendar.loading") : t("chat.chatroom"))}
					</span>
					<Show when={isRestricted() !== null}>
						<span
							title={isRestricted() ? t("chat.privacy_private") as string : t("chat.privacy_public") as string}
							class={`flex items-center gap-1 shrink-0 text-xs px-1.5 py-0.5 rounded-full border ${
								isRestricted()
									? "border-accent/40 bg-accent/10 text-accent"
									: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
							}`}
						>
							<Show when={isRestricted()} fallback={<MdFillLock_open size={11} />}>
								<MdFillLock size={11} />
							</Show>
							<span class="hidden sm:inline">
								{isRestricted() ? t("chat.privacy_private") : t("chat.privacy_public")}
							</span>
						</span>
					</Show>
				</div>

				{/* Expiry badge — clickable for owner */}
				<Show when={!chatLoading()}>
					<button
						onClick={() => roomIsOwner() && setExpireEditing((v) => !v)}
						title={roomIsOwner() ? (t("chat.expire_after") as string) : undefined}
						class={`flex items-center gap-1 shrink-0 text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
							roomIsOwner()
								? "border-rim hover:border-accent hover:text-accent cursor-pointer"
								: "border-rim cursor-default"
						} text-muted`}
					>
						<MdOutlineTimer size={11} />
						<span class="hidden sm:inline">{expireLabel(roomExpire())}</span>
					</button>
				</Show>

				<Show when={isLocalUser()}>
					<button
						onClick={togglePin}
						title={isPinned() ? t("chat.unpin") as string : t("chat.pin_to_sidebar") as string}
						class="p-1.5 rounded-lg transition-colors hover:bg-elevated"
						classList={{
							"text-accent": isPinned(),
							"text-muted hover:text-txt": !isPinned(),
						}}
					>
						<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
							<path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
						</svg>
					</button>
				</Show>
				<Show when={isLocalUser()}>
					<button
						onClick={() => void toggleBookmark()}
						title={isBookmarked() ? t("chat.unbookmark") as string : t("chat.bookmark") as string}
						class="p-1.5 rounded-lg transition-colors hover:bg-elevated"
						classList={{
							"text-accent": isBookmarked(),
							"text-muted hover:text-txt": !isBookmarked(),
						}}
					>
						<MdOutlineBookmark_border class="w-4 h-4" />
					</button>
				</Show>
				<button
					onClick={() => setShowPresence((v) => !v)}
					class="flex items-center gap-1.5 text-xs text-muted hover:text-txt border border-rim rounded-lg px-2.5 py-1.5 hover:bg-elevated transition-colors"
				>
					<MdFillPeople class="text-sm" />
					{presenceCount()} online
				</button>
			</div>

			{/* Expiry picker — owner only */}
			<Show when={expireEditing()}>
				<div class="px-4 py-2 border-b border-rim bg-surface flex items-center gap-3 flex-wrap">
					<span class="text-xs text-muted shrink-0">{t("chat.expire_after")}</span>
					<div class="flex gap-1.5 flex-wrap items-center">
						{([
							[0,     "Never"],
							[5,     "5m"],
							[60,    "1h"],
							[1440,  "24h"],
							[10080, "1w"],
						] as [number, string][]).map(([val, label]) => (
							<button
								onClick={() => { void handleSetExpire(val); setExpireCustomMode(false); }}
								disabled={expireUpdating()}
								class={`text-xs px-2.5 py-1 rounded-md border transition-colors disabled:opacity-50 ${
									roomExpire() === val && !expireCustomMode()
										? "border-accent text-accent bg-accent/10"
										: "border-rim text-muted hover:border-accent hover:text-accent"
								}`}
							>
								{label}
							</button>
						))}
						<button
							onClick={() => { setExpireCustomMode(true); }}
							disabled={expireUpdating()}
							class={`text-xs px-2.5 py-1 rounded-md border transition-colors disabled:opacity-50 ${
								expireCustomMode()
									? "border-accent text-accent bg-accent/10"
									: "border-rim text-muted hover:border-accent hover:text-accent"
							}`}
						>
							Custom
						</button>
						<Show when={expireCustomMode()}>
							<input
								type="number"
								min="1"
								max="10080"
								value={expireCustomInput()}
								onInput={(e) => setExpireCustomInput(e.currentTarget.value)}
								placeholder="min"
								class="w-16 bg-surface border border-accent text-txt text-xs rounded-md px-2 py-1 focus:outline-none"
							/>
							<button
								onClick={() => void handleSetExpire(parseInt(expireCustomInput()) || 0)}
								disabled={expireUpdating()}
								class="text-xs px-2.5 py-1 rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50"
							>
								Set
							</button>
						</Show>
					</div>
					<button
						onClick={() => setExpireEditing(false)}
						class="ml-auto text-xs text-muted hover:text-txt transition-colors"
					>
						{t("chat.cancel")}
					</button>
				</div>
			</Show>

			<div class="flex flex-1 min-h-0">
				{/* Messages area */}
				<div class="flex flex-col flex-1 min-w-0">
					{/* Loading skeleton */}
					<Show when={chatLoading()}>
						<div class="flex-1 p-4 space-y-3">
							<For each={[0, 1, 2, 3]}>
								{(_, i) => (
									<div
										class="flex gap-2 animate-pulse"
										classList={{ "flex-row-reverse": i() % 3 === 0 }}
									>
										<div class="w-7 h-7 rounded-full bg-elevated shrink-0" />
										<div class="space-y-1 flex-1 max-w-xs">
											<div class="h-3 bg-elevated rounded w-20" />
											<div class="h-8 bg-elevated rounded-xl" />
										</div>
									</div>
								)}
							</For>
						</div>
					</Show>

					{/* Empty */}
					<Show when={!chatLoading() && messages().length === 0}>
						<div class="flex-1 flex items-center justify-center">
							<div class="text-center space-y-2">
								<MdFillChat class="text-3xl text-muted mx-auto" />
								<p class="text-sm text-muted">{t("chat.no_messages")}</p>
							</div>
						</div>
					</Show>

					{/* Message list */}
					<Show when={!chatLoading() && messages().length > 0}>
						<div
							ref={messagesEl}
							class="flex-1 overflow-y-auto px-4 py-3 space-y-0.5 scroll-smooth"
						>
							<For each={groupedMessages()}>
								{(msg) => {
									// Rough self-detection by name match
									const isSelf = () =>
										!!viewerHash() && msg.author_hash === viewerHash();

									return (
										<div
											class="flex gap-2 py-0.5"
											classList={{
												"flex-row-reverse": isSelf(),
												"mt-3": msg.isFirst,
											}}
										>
											{/* Avatar — only show on first of a run */}
											<Show when={msg.isFirst}>
												<div class="w-7 h-7 shrink-0 mt-0.5">
													<Show
														when={msg.author_avatar}
														fallback={
															<div class="w-7 h-7 rounded-full bg-accent-muted flex items-center justify-center text-xs text-accent font-semibold">
																{msg.author_name?.[0]?.toUpperCase() ?? "?"}
															</div>
														}
													>
														<img
															src={msg.author_avatar}
															alt={msg.author_name}
															class="w-7 h-7 rounded-full object-cover"
														/>
													</Show>
												</div>
											</Show>
											<Show when={!msg.isFirst}>
												<div class="w-7 shrink-0" />
											</Show>

											{/* Bubble */}
											<div
												class="max-w-[72%] space-y-0.5"
												classList={{ "items-end flex flex-col": isSelf() }}
											>
												<Show when={msg.isFirst}>
													<p
														class="text-[0.6875rem] text-muted px-1"
														classList={{ "text-right": isSelf() }}
													>
														{msg.author_name}
													</p>
												</Show>
												<div
													class="px-3 py-2 text-sm leading-relaxed rounded-2xl"
													classList={{
														"bg-accent text-accent-fg rounded-tr-sm": isSelf(),
														"bg-elevated text-txt rounded-tl-sm": !isSelf(),
														"rounded-tr-2xl": isSelf() && !msg.isFirst,
														"rounded-tl-2xl": !isSelf() && !msg.isFirst,
													}}
													data-msg-id={String(msg.id)}
													onClick={handleBubbleClick}
												>
													<span innerHTML={sanitizeHtml(bbcodeDisplay(msg.body))} />
												</div>
												<Show when={msg.isLast}>
													<p
														class="text-[0.625rem] text-muted px-1"
														title={new Date(msg.created.replace(" ", "T") + "Z").toLocaleString()}
													>
														{formatPostDate(msg.created)}
													</p>
												</Show>
											</div>
										</div>
									);
								}}
							</For>
						</div>
					</Show>

					<ChatComposer nick={nick()} roomId={roomId()} />
				</div>

				{/* Presence sidebar */}
				<Show when={showPresence()}>
					<div class="w-48 border-l border-rim bg-surface flex flex-col shrink-0">
						<p class="text-xs font-medium text-muted px-3 py-2 border-b border-rim">
							{presenceCount()} {t("chat.online_count")}
						</p>
						<div class="overflow-y-auto flex-1 px-2 py-2 space-y-1">
							<For each={presence()}>
								{(member) => (
									<div class="flex items-center gap-2 py-1">
										<div class="relative shrink-0">
											<Show
												when={member.avatar}
												fallback={
													<div class="w-6 h-6 rounded-full bg-accent-muted flex items-center justify-center text-[0.625rem] text-accent font-semibold">
														{member.name?.[0]?.toUpperCase() ?? "?"}
													</div>
												}
											>
												<img
													src={member.avatar}
													alt={member.name}
													class="w-6 h-6 rounded-full object-cover"
												/>
											</Show>
											<span
												class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface"
												classList={{
													"bg-green-500": member.status === "online",
													"bg-yellow-500": member.status !== "online",
												}}
											/>
										</div>
										<span class="text-xs text-txt truncate">{member.name}</span>
									</div>
								)}
							</For>
						</div>
					</div>
				</Show>
			</div>
		</div>
	);
}
