// src/modules/chat/views/ChatWindow.tsx
//
// A joined chatroom, hosted by ModalHost (kind "chat", opened via openChat) so
// it gets the composer/post window modes: modal, docked, page and minimized.
// Each window owns its own room session, so several rooms can be open at once.
import {
	createEffect,
	createSignal,
	For,
	Show,
	createMemo,
	on,
	useContext,
	untrack,
} from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createRoomSession } from "../store";
import {
	loadChatBookmarks,
	isRoomBookmarked,
	bookmarkIdForRoom,
	addChatBookmark,
	removeChatBookmark,
} from "../bookmarks";
import { isLocalUser } from "@utsukta/spa-core/store/auth-store";
import { MdFillChat, MdFillLock, MdFillLock_open, MdFillPeople, MdOutlineBookmark_border, MdOutlineLogout, MdOutlineNotifications_active, MdOutlineNotifications_off, MdOutlineTimer, MdOutlineVolume_up } from "solid-icons/md";
import ChatComposer from "../ChatComposer";
import DOMPurify from "dompurify";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { decryptPayload, getPayloadHint } from "@utsukta/spa-core/lib/postCrypto";
import { bbcodeDisplay } from "@utsukta/spa-core/lib/renderBody";
import { Dynamic, Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { createPopover } from "@/shared/stream/filters/createPopover";
import AclPicker, { entryKey, aclModeFrom, aclEntryKeys, aclPayload, fetchAclNames, type AclMode, type AclEntry } from "@/shared/editor/components/AclPicker";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import ComposerModal from "@/shared/editor/components/ComposerModal";
import { ComposerFrameContext, openChat } from "@/shared/views/modal-host";
import { alertNewMessage, chatNotifyMode, cycleChatNotify } from "../notify";
import { markChatSeen } from "../unread";

/** Chat timestamps are UTC "YYYY-MM-DD HH:MM:SS". */
const chatDate = (created: string) => new Date(created.replace(" ", "T") + "Z");

export default function ChatWindow(props: { nick: string; roomId: number; onClose: () => void }) {
	const { t, locale } = useI18n();

	/** "Today" / "Yesterday" in the UI language, else a short date. */
	function dayLabel(d: Date): string {
		const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		const diff = Math.round((startOf(d) - startOf(new Date())) / 86_400_000);
		if (diff === 0 || diff === -1) {
			const s = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" }).format(diff, "day");
			return s.charAt(0).toUpperCase() + s.slice(1);
		}
		return d.toLocaleDateString(locale(), {
			weekday: "short",
			day: "numeric",
			month: "short",
			...(d.getFullYear() !== new Date().getFullYear() && { year: "numeric" }),
		});
	}
	const frame = useContext(ComposerFrameContext);
	const room = createRoomSession(props.nick, props.roomId);

	const presencePop = createPopover({ placement: "bottom-end" });
	const [expireEditing, setExpireEditing] = createSignal(false);
	const [expireUpdating, setExpireUpdating] = createSignal(false);
	const [expireCustomMode, setExpireCustomMode] = createSignal(false);
	const [expireCustomInput, setExpireCustomInput] = createSignal("60");

	let messagesEl: HTMLDivElement | undefined;

	const isBookmarked = createMemo(() => isRoomBookmarked(props.nick, props.roomId));

	// Load bookmarks once for local users
	createEffect(() => { if (isLocalUser()) loadChatBookmarks(); });

	// Name the minimized pill after the room once it is known.
	createEffect(() => frame?.setDocTitle(room.name()));

	async function toggleBookmark() {
		if (isBookmarked()) {
			const id = bookmarkIdForRoom(props.nick, props.roomId);
			if (id) await removeChatBookmark(id);
		} else {
			await addChatBookmark(props.nick, props.roomId, room.name() || t("chat.chatroom") as string);
		}
	}

	// Unread = others' messages newer than the last one on screen. Ids, not a
	// count: the session caps its list at 200, so its length stops growing.
	const [seenId, setSeenId] = createSignal(0);
	createEffect(() => {
		const m = room.messages();
		if (frame?.mode() === "min") return;
		setSeenId(m.length ? m[m.length - 1].id : 0);
		if (m.length) markChatSeen(props.nick, props.roomId, m[m.length - 1].created);
	});
	createEffect(() =>
		frame?.setUnread(
			room.messages().filter((m) => m.id > seenId() && m.author_hash !== room.viewerHash()).length,
		),
	);

	// ── New-message alerts (sound / push / silent, per room) ──
	const notifyMode = () => chatNotifyMode(props.nick, props.roomId);
	const NOTIFY_ICON = {
		sound: MdOutlineVolume_up,
		push: MdOutlineNotifications_active,
		silent: MdOutlineNotifications_off,
	} as const;
	// Only alert for messages newer than what the room loaded with, and only
	// while you aren't looking: tab hidden/unfocused or window minimized.
	let alertedId = -1;
	createEffect(() => {
		const msgs = room.messages();
		if (room.loading()) return;
		const last = msgs.length ? msgs[msgs.length - 1].id : 0;
		if (alertedId === -1) { alertedId = last; return; }
		const fresh = msgs.filter((m) => m.id > alertedId && m.author_hash !== room.viewerHash());
		alertedId = Math.max(alertedId, last);
		const away = document.visibilityState !== "visible" || !document.hasFocus() || frame?.mode() === "min";
		const m = fresh[fresh.length - 1];
		if (!m || !away) return;
		untrack(() => alertNewMessage(notifyMode(), {
			title: `${m.author_name} · ${room.name() || t("chat.chatroom")}`,
			// Plain text for the OS popup: bbcode tags stripped, ciphertext hidden.
			body: m.body.includes("[crypt") ? "🔒" : m.body.replace(/\[[^\]]*\]/g, "").slice(0, 140),
			icon: m.author_avatar,
			onClick: () => openChat(props.nick, props.roomId),
		}));
	});

	// Stick to the bottom on new messages, and on restore: a minimized window
	// is display:none, so scrolling it while hidden does nothing.
	createEffect(on([room.messages, () => frame?.mode()], () => {
		requestAnimationFrame(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; });
	}));

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
			await room.setExpire(val);
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

	// ── Audience editor (owner) — same AclPicker flow as Files permissions ──
	const viewer = useNavViewer();
	const [aclEditing, setAclEditing] = createSignal(false);
	const [aclMode, setAclMode] = createSignal<AclMode>("public");
	const [allowKeys, setAllowKeys] = createSignal(new Set<string>());
	const [denyKeys, setDenyKeys] = createSignal(new Set<string>());
	const [aclSeed, setAclSeed] = createSignal<AclEntry[]>([]);
	const [aclSaving, setAclSaving] = createSignal(false);
	const [aclError, setAclError] = createSignal("");

	function openAclEditor() {
		const acl = room.acl() ?? { allow_cid: [], allow_gid: [], deny_cid: [], deny_gid: [] };
		const mode = aclModeFrom(acl, viewer()?.hash);
		const keys = aclEntryKeys(acl, mode);
		setAclMode(mode);
		setAllowKeys(keys.allow);
		setDenyKeys(keys.deny);
		setAclError("");
		setAclEditing(true);
		// Chips name people, not hashes — resolve the stored contacts.
		void fetchAclNames([...acl.allow_cid, ...acl.deny_cid]).then(setAclSeed);
	}

	function toggleAclEntry(entry: AclEntry, list: "allow" | "deny") {
		const key = entryKey(entry);
		const [mine, setMine, setOther] = list === "allow"
			? [allowKeys, setAllowKeys, setDenyKeys]
			: [denyKeys, setDenyKeys, setAllowKeys];
		const next = new Set(mine());
		next.has(key) ? next.delete(key) : next.add(key);
		setMine(next);
		setOther((prev) => { const n = new Set(prev); n.delete(key); return n; });
	}

	async function saveAcl() {
		const payload = aclPayload(aclMode(), allowKeys(), denyKeys());
		if (aclMode() === "custom" && !payload.allow_cid.length && !payload.allow_gid.length) {
			setAclError(t("chat.private_select_hint") as string);
			return;
		}
		setAclSaving(true);
		setAclError("");
		try {
			await room.setVisibility(payload);
			setAclEditing(false);
		} catch (e) {
			setAclError((e as Error).message);
		} finally {
			setAclSaving(false);
		}
	}

	const privacyBadge = () => (
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
	);

	const presenceCount = createMemo(() => room.presence().length);
	const isRestricted = createMemo(() => {
		const acl = room.acl();
		if (!acl) return null;
		return acl.allow_cid.length > 0 || acl.allow_gid.length > 0 ||
		       acl.deny_cid.length > 0  || acl.deny_gid.length > 0;
	});
	const groupedMessages = createMemo(() => {
		const msgs      = room.messages();
		const decrypted = decryptedBodies();
		// A run is one author's consecutive messages on one day; a new day
		// breaks it and gets a separator.
		const days = msgs.map((m) => chatDate(m.created).toDateString());
		const sameRun = (a: number, b: number) =>
			msgs[a].author_hash === msgs[b].author_hash && days[a] === days[b];
		return msgs.map((msg, i) => ({
			...msg,
			// Use auto-decrypted body when available so the chat renders plaintext
			body: decrypted.get(msg.id) ?? msg.body,
			dayLabel: i === 0 || days[i] !== days[i - 1] ? dayLabel(chatDate(msg.created)) : "",
			isFirst: i === 0 || !sameRun(i - 1, i),
			isLast: i === msgs.length - 1 || !sameRun(i, i + 1),
		}));
	});

	return (
		<ComposerModal
			title={room.name() || (room.loading() ? (t("calendar.loading") as string) : (t("chat.chatroom") as string))}
			onClose={props.onClose}
			widthClass="max-w-3xl"
		>
			{/* Toolbar — the room name and window controls live in ComposerModal's header */}
			<div class="flex items-center gap-2 px-3 py-2 border-b border-rim bg-surface shrink-0 flex-wrap">
				<div class="flex items-center gap-2 flex-1 min-w-0">
					<Show when={isRestricted() !== null}>
						{/* The owner edits the audience from the badge; anyone else only
						    sees public/private (core never reveals a room's audience to
						    non-owners). */}
						<Show when={room.isOwner()} fallback={privacyBadge()}>
							<button
								type="button"
								onClick={() => (aclEditing() ? setAclEditing(false) : openAclEditor())}
								aria-expanded={aclEditing()}
								class="shrink-0 rounded-full hover:opacity-80 transition-opacity"
							>
								{privacyBadge()}
							</button>
						</Show>
					</Show>
				</div>

				{/* Expiry badge — clickable for owner */}
				<Show when={!room.loading()}>
					<button
						onClick={() => room.isOwner() && setExpireEditing((v) => !v)}
						title={room.isOwner() ? (t("chat.expire_after") as string) : undefined}
						class={`flex items-center gap-1 shrink-0 text-xs px-1.5 py-1 rounded-lg text-muted transition-colors ${
							room.isOwner() ? "hover:bg-elevated hover:text-txt cursor-pointer" : "cursor-default"
						}`}
					>
						<MdOutlineTimer class="w-4 h-4" />
						<span class="hidden sm:inline">{expireLabel(room.expire())}</span>
					</button>
				</Show>

				{/* Click cycles sound → push → silent */}
				<button
					onClick={() => void cycleChatNotify(props.nick, props.roomId)}
					title={t(`chat.notify_${notifyMode()}`) as string}
					aria-label={t(`chat.notify_${notifyMode()}`) as string}
					class="p-1.5 rounded-lg transition-colors hover:bg-elevated"
					classList={{
						"text-accent": notifyMode() !== "silent",
						"text-muted hover:text-txt": notifyMode() === "silent",
					}}
				>
					<Dynamic component={NOTIFY_ICON[notifyMode()]} class="w-4 h-4" />
				</button>
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
				{/* A visitor from another hub saves the bookmark on their own hub. */}
				<Show when={!isLocalUser() && room.bookmarkUrl()}>
					<a
						href={room.bookmarkUrl()!}
						target="_blank"
						rel="noopener"
						title={t("chat.bookmark_on_home") as string}
						aria-label={t("chat.bookmark_on_home") as string}
						class="p-1.5 rounded-lg transition-colors hover:bg-elevated text-muted hover:text-txt"
					>
						<MdOutlineBookmark_border class="w-4 h-4" />
					</a>
				</Show>
				{/* Esc/backdrop only minimize (still joined); this closes the window,
				    and the session's cleanup leaves the room. */}
				<button
					onClick={props.onClose}
					title={t("chat.leave") as string}
					aria-label={t("chat.leave") as string}
					class="p-1.5 rounded-lg transition-colors hover:bg-elevated text-muted hover:text-txt"
				>
					<MdOutlineLogout class="w-4 h-4" />
				</button>
				{/* Who's here — a floating dropdown rather than a side column, which
				    left no room for messages in a docked window or on a phone. */}
				<div ref={presencePop.ref}>
					<button
						onClick={() => presencePop.setOpen(!presencePop.open())}
						aria-haspopup="true"
						aria-expanded={presencePop.open()}
						title={`${presenceCount()} ${t("chat.online_count")}`}
						class="flex items-center gap-1 text-xs text-muted hover:text-txt rounded-lg px-1.5 py-1 hover:bg-elevated transition-colors tabular-nums"
					>
						<MdFillPeople class="w-4 h-4" />
						{presenceCount()}
					</button>
				</div>
				<Show when={presencePop.open()}>
					<Portal mount={topLayer()}>
						<div
							ref={presencePop.floating}
							style={presencePop.style()}
							class="z-[60] w-56 max-w-[calc(100vw-1rem)] rounded-lg border border-rim bg-elevated shadow-lg"
						>
							<p class="text-xs font-medium text-muted px-3 py-2 border-b border-rim">
								{presenceCount()} {t("chat.online_count")}
							</p>
							<div class="max-h-72 overflow-y-auto px-2 py-2 space-y-1">
								<For each={room.presence()}>
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
					</Portal>
				</Show>
			</div>

			{/* Audience editor — owner only */}
			<Show when={aclEditing()}>
				<div class="px-3 py-2 border-b border-rim bg-surface space-y-2 shrink-0">
					<AclPicker
						mode={aclMode()}
						onModeChange={setAclMode}
						allowEntries={allowKeys()}
						denyEntries={denyKeys()}
						seedEntries={aclSeed()}
						onToggle={toggleAclEntry}
						onClear={() => { setAllowKeys(new Set<string>()); setDenyKeys(new Set<string>()); }}
					/>
					<p class="text-[0.6875rem] text-muted">
						{aclMode() === "public" && t("chat.visibility_public")}
						{aclMode() === "connections" && t("chat.visibility_connections")}
						{aclMode() === "me" && t("chat.visibility_me")}
						{aclMode() === "custom" && t("chat.visibility_private")}
					</p>
					<Show when={aclError()}>
						<p class="text-xs text-red-500">{aclError()}</p>
					</Show>
					<div class="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setAclEditing(false)}
							class="text-xs px-2.5 py-1 rounded-md text-muted hover:text-txt transition-colors"
						>
							{t("chat.cancel")}
						</button>
						<button
							type="button"
							onClick={() => void saveAcl()}
							disabled={aclSaving()}
							class="text-xs px-2.5 py-1 rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50"
						>
							{t("chat.save")}
						</button>
					</div>
				</div>
			</Show>

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
									room.expire() === val && !expireCustomMode()
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
					<Show when={room.loading()}>
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
					<Show when={!room.loading() && room.messages().length === 0}>
						<div class="flex-1 flex items-center justify-center">
							<div class="text-center space-y-2">
								<MdFillChat class="text-3xl text-muted mx-auto" />
								<p class="text-sm text-muted">{t("chat.no_messages")}</p>
							</div>
						</div>
					</Show>

					{/* Message list */}
					<Show when={!room.loading() && room.messages().length > 0}>
						<div
							ref={messagesEl}
							class="flex-1 overflow-y-auto px-4 py-3 space-y-0.5 scroll-smooth"
						>
							<For each={groupedMessages()}>
								{(msg) => {
									// Rough self-detection by name match
									const isSelf = () =>
										!!room.viewerHash() && msg.author_hash === room.viewerHash();

									return (
										<>
										<Show when={msg.dayLabel}>
											<div class="flex items-center gap-3 pt-4 pb-1" role="separator">
												<div class="flex-1 h-px bg-rim" />
												<span class="text-[0.6875rem] font-medium text-muted">{msg.dayLabel}</span>
												<div class="flex-1 h-px bg-rim" />
											</div>
										</Show>
										<div
											class="flex gap-2 py-px"
											classList={{
												"justify-end": isSelf(),
												"mt-2.5": msg.isFirst,
											}}
										>
											{/* Avatar — others only, first of a run; your own messages
											    need no face or name. */}
											<Show when={!isSelf() && msg.isFirst}>
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
											<Show when={!isSelf() && !msg.isFirst}>
												<div class="w-7 shrink-0" />
											</Show>

											{/* Bubble */}
											<div
												class="max-w-[80%] min-w-0 space-y-0.5"
												classList={{ "items-end flex flex-col": isSelf() }}
											>
												<Show when={!isSelf() && msg.isFirst}>
													<p class="text-[0.6875rem] font-medium text-muted px-1">
														{msg.author_name}
													</p>
												</Show>
												<div
													class="px-3 py-1.5 text-sm leading-relaxed rounded-2xl break-words"
													title={chatDate(msg.created).toLocaleString(locale())}
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
													<p class="text-[0.625rem] text-muted px-1 tabular-nums">
														{chatDate(msg.created).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" })}
													</p>
												</Show>
											</div>
										</div>
										</>
									);
								}}
							</For>
						</div>
					</Show>

					<ChatComposer room={room} />
				</div>

			</div>
		</ComposerModal>
	);
}
