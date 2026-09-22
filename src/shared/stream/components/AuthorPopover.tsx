import { createSignal, createEffect, Show, onCleanup, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { createMediaQuery } from "@solid-primitives/media";
import { MdOutlinePerson, MdOutlinePerson_add, MdOutlineEdit, MdOutlineEmail, MdOutlineChat_bubble, MdOutlineCheck, MdOutlineBlock, MdOutlineGavel } from "solid-icons/md";
import { useAuth, isAdmin } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer, useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { isAppInstalled } from "@utsukta/spa-core/module-registry";
import { addConnection } from "@/modules/directory/people/api";
import { fetchConnectionByAddress } from "@/modules/directory/connections/api";
import type { Connection } from "@/modules/directory/connections/api";
import ConnectionEditorModal from "@/shared/views/ConnectionEditorModal";
import { openComposer } from "@/shared/editor/store/composer-host";
import { createRoom } from "@/modules/chat/api";
import { blockChannel, blockChannelFromSite } from "@utsukta/spa-core/lib/blocklist-api";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useFloating } from "@utsukta/spa-core/lib/useFloating";
import { usePlatformSoftware } from "@utsukta/spa-core/lib/usePlatformSoftware";
import { PlatformIcon, platformLabel, networkBadge, type NetworkBadge } from "./PlatformIcons";

interface Props {
  name: string;
  avatar?: string;
  url?: string;
  hash?: string;
  address?: string;
  network?: string;
  children: JSX.Element;
}

// conn is fetched lazily after the xchan check confirms is_connected
type ConnState =
  | { tag: "idle" }
  | { tag: "loading" }
  | { tag: "connected"; conn: Connection | null }
  | { tag: "not_connected" }
  | { tag: "just_connected" };

function buildChatRoomName(names: string[]): string {
  if (names.length === 0) return "Chat";
  if (names.length === 1) return `Chat with ${names[0]}`;
  if (names.length === 2) return `Chat with ${names[0]} and ${names[1]}`;
  if (names.length === 3) return `Chat with ${names[0]}, ${names[1]}, and ${names[2]}`;
  const more = names.length - 3;
  return `Chat with ${names[0]}, ${names[1]}, ${names[2]}, and ${more} more`;
}

export default function AuthorPopover(props: Props) {
  const { t, locale } = useI18n();
  const [open, setOpen] = createSignal(false);
  const [connState, setConnState] = createSignal<ConnState>({ tag: "idle" });
  const [editOpen, setEditOpen] = createSignal(false);
  // Handed to ComposerHost so a half-written DM survives navigation. The scope
  // carries the recipient, so DMs to two different people are two composers
  // with two drafts rather than one that overwrites the other.
  const openDm = (r: {
    xid: string; name: string; nick: string; photo?: string;
  }) =>
    openComposer({
      kind: "dm",
      scope: `dm:new:${r.xid}`,
      title: t("editor.dm_new_message"),
      props: {
        profileUid: auth()!.uid,
        scopeKey: `dm:new:${r.xid}`,
        initialRecipients: [{
          type: "c",
          xid: r.xid,
          id: r.xid,
          name: r.name,
          nick: r.nick,
          link: r.nick,
          photo: r.photo,
        }],
      },
    });
  const [xchanHash, setXchanHash] = createSignal<string | null>(null);
  const [pdesc, setPdesc] = createSignal<string>("");
  const [chatCreating, setChatCreating] = createSignal(false);
  const [chatPanelOpen, setChatPanelOpen] = createSignal(false);
  const [chatExpire, setChatExpire] = createSignal(0);
  const [chatCustomMode, setChatCustomMode] = createSignal(false);
  const [chatCustomInput, setChatCustomInput] = createSignal("60");
  const [sendInvite, setSendInvite] = createSignal(true);
  const [blockState, setBlockState] = createSignal<"idle" | "loading" | "blocked">("idle");
  const [siteBlockState, setSiteBlockState] = createSignal<"idle" | "loading" | "blocked">("idle");
  const { x: popX, y: popY, mount: popMount, unmount: popUnmount } =
    useFloating({ placement: "bottom-start", offset: 8 });
  const canHover = createMediaQuery("(hover: hover) and (pointer: fine)");
  const auth = useAuth();
  const navViewer = useNavViewer();
  const installedApps = useInstalledApps();
  const chatroomsInstalled = () => isAppInstalled(installedApps(), "/chat/");
  const navigate = useNavigate();
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let triggerRef!: HTMLDivElement;
  let popoverRef!: HTMLDivElement;

  const isSelf = () => {
    const a = auth();
    if (!a?.isLocal || !a.nick || !props.address) return true;
    return props.address === `${a.nick}@${window.location.hostname}`;
  };

  const isLocal = () => auth()?.isLocal ?? false;

  // Resolving xchan_hash/pdesc is public data and must happen for every
  // viewer (anonymous, remote, local) — only the connection-status lookup
  // (is_connected/full Connection) requires a local, non-self viewer.
  // Previously this whole fetch was gated behind isLocal()/isSelf(), so
  // anonymous/remote viewers never got a resolved hash and the profile
  // link fell back to the raw xchan url.
  const [profileFetch, setProfileFetch] = createSignal<"idle" | "loading" | "done">("idle");

  createEffect(() => {
    if (!open() || !props.url || profileFetch() !== "idle") return;
    const needsConnState = isLocal() && !isSelf();
    setProfileFetch("loading");
    if (needsConnState) setConnState({ tag: "loading" });

    fetch(`/spa/xchan?hash=${encodeURIComponent(props.url)}`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then((body: { data?: { is_connected?: boolean; xchan_hash?: string; pdesc?: string } } | null) => {
        setProfileFetch("done");
        if (body?.data?.xchan_hash) setXchanHash(body.data.xchan_hash);
        if (body?.data?.pdesc) setPdesc(body.data.pdesc);
        if (!needsConnState) return;
        if (body?.data?.is_connected) {
          setConnState({ tag: "connected", conn: null });
          // Eagerly fetch full Connection for the edit modal
          if (props.address) {
            fetchConnectionByAddress(props.address)
              .then(conn => {
                setConnState(prev =>
                  prev.tag === "connected" ? { tag: "connected", conn } : prev,
                );
              })
              .catch(() => { /* conn stays null — edit button stays disabled */ });
          }
        } else {
          setConnState({ tag: "not_connected" });
        }
      })
      .catch(() => {
        setProfileFetch("done");
        if (needsConnState) setConnState({ tag: "not_connected" });
      });
  });

  createEffect(() => {
    if (open() && triggerRef && popoverRef) popMount(triggerRef, popoverRef);
    else popUnmount();
  });

  function scheduleClose() {
    closeTimer = setTimeout(() => setOpen(false), 150);
  }

  function cancelClose() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  }

  createEffect(() => {
    if (!open()) return;
    const handler = (e: MouseEvent) => {
      if (!triggerRef?.contains(e.target as Node) && !popoverRef?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    onCleanup(() => document.removeEventListener("mousedown", handler));
  });

  async function handleConnect(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (connState().tag !== "not_connected" || !props.address) return;
    setConnState({ tag: "loading" });
    try {
      await addConnection(props.address);
      setConnState({ tag: "just_connected" });
    } catch {
      setConnState({ tag: "not_connected" });
    }
  }

  function handleEditClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const s = connState();
    if (s.tag !== "connected" || !s.conn) return;
    setOpen(false);
    setEditOpen(true);
  }

  function handleDm(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    openDm({
      xid: xchanHash()!,
      name: props.name,
      nick: props.address ?? "",
      photo: props.avatar,
    });
  }

  function handleChatButtonClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setChatPanelOpen((v) => !v);
    setChatExpire(0);
    setChatCustomMode(false);
    setChatCustomInput("60");
    setSendInvite(true);
  }

  async function handleStartChat(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const hash = xchanHash();
    const nick = auth()?.nick;
    const uid  = auth()?.uid;
    if (!hash || !nick || !uid) return;
    setChatPanelOpen(false);
    setChatCreating(true);
    try {
      const room = await createRoom(nick, {
        name: buildChatRoomName([props.name, navViewer()?.name].filter(Boolean) as string[]),
        expire: chatExpire(),
        visibility: "custom",
        allow_cid: [hash],
      });

      if (sendInvite()) {
        const roomUrl = `${window.location.origin}/chat/${nick}/${room.id}`;
        const fd = new FormData();
        fd.append("body", `I've started a chatroom for us. [url=${roomUrl}]Join here[/url]`);
        fd.append("mimetype", "text/bbcode");
        fd.append("obj_type", "Note");
        fd.append("profile_uid", String(uid));
        fd.append("type", "wall");
        fd.append("contact_allow[]", hash);
        fd.append("return", "");
        fetch("/item", { method: "POST", credentials: "include", redirect: "manual", body: fd })
          .catch(() => {});
      }

      navigate(`/chat/${nick}/${room.id}`);
    } catch {
      // ignore — chat app may not be installed
    } finally {
      setChatCreating(false);
    }
  }

  async function handleBlock(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const hash = xchanHash() || props.hash;
    if (!hash || blockState() !== "idle") return;
    setBlockState("loading");
    try {
      await blockChannel(hash);
      setBlockState("blocked");
    } catch {
      setBlockState("idle");
    }
  }

  async function handleSiteBlock(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const hash = xchanHash() || props.hash;
    if (!hash || siteBlockState() !== "idle") return;
    setSiteBlockState("loading");
    try {
      await blockChannelFromSite(hash);
      setSiteBlockState("blocked");
    } catch {
      setSiteBlockState("idle");
    }
  }

  onCleanup(() => { if (closeTimer) clearTimeout(closeTimer); });

  const cs = () => connState();

  const badge = (): NetworkBadge | null => {
    const state = connState();
    const net = state.tag === "connected" ? (state.conn?.network ?? props.network) : props.network;
    return networkBadge(net);
  };

  const software = usePlatformSoftware(() => props.url);

  // Prefer the hash passed in from the item payload; fall back to the
  // resolved xchan_hash (fetched once the popover opens), then finally
  // the raw xchan url so the link is still available immediately.
  const chanviewUrl = () => {
    const hash = props.hash || xchanHash() || props.url;
    return hash ? `/chanview?f=&hash=${encodeURIComponent(hash)}` : undefined;
  };

  // The edit button is visible as soon as tag === "connected", but disabled
  // until conn is populated (the background fetch).
  const editReady = () => cs().tag === "connected" && (cs() as { tag: "connected"; conn: Connection | null }).conn !== null;

  return (
    <>
      <div
        ref={triggerRef}
        class="relative shrink-0"
        onMouseEnter={() => { if (canHover()) { cancelClose(); setOpen(true); } }}
        onMouseLeave={() => { if (canHover()) scheduleClose(); }}
        onClick={() => { if (!canHover()) { setOpen(!open()); } }}
      >
        {props.children}
      </div>
      <Portal mount={topLayer()}>
        <Show when={open()}>
          <div
            ref={popoverRef}
            class="fixed z-[9999] w-80 bg-surface border border-rim rounded-xl shadow-xl overflow-hidden"
            style={{ position: "fixed", top: `${popY()}px`, left: `${popX()}px` }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            {/* Identity */}
            <div class="p-3">
              <div class="flex items-start gap-3">
                <Show
                  when={props.avatar}
                  fallback={
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-accent-txt
                                shrink-0 flex items-center justify-center text-accent-fg text-sm font-bold">
                      {props.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  }
                >
                  <img
                    src={props.avatar}
                    width="48"
                    height="48"
                    class="w-12 h-12 rounded-full object-cover ring-2 ring-rim shrink-0"
                  />
                </Show>
                <div class="min-w-0 flex-1 pt-0.5">
                  <div class="font-semibold text-sm text-txt truncate leading-tight">{props.name}</div>
                  <Show when={props.address}>
                    <div class="text-xs text-muted truncate mt-0.5">{props.address}</div>
                  </Show>
                  <Show
                    when={software()}
                    fallback={
                      <Show when={badge()}>
                        {(b) => (
                          <span class={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[0.625rem] font-semibold leading-none ${b().cls}`}>
                            <PlatformIcon url={props.url} network={props.network} size={12} />
                            {b().label}
                          </span>
                        )}
                      </Show>
                    }
                  >
                    {(name) => (
                      <span class="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[0.625rem] font-semibold leading-none bg-accent/15 text-accent-txt">
                        <PlatformIcon url={props.url} size={12} />
                        {platformLabel(name())}
                      </span>
                    )}
                  </Show>
                </div>
              </div>

              <Show when={pdesc()}>
                <p class="text-xs text-txt/70 line-clamp-3 mt-2 leading-snug">{pdesc()}</p>
              </Show>

              {/* Connection details — only once the full Connection is loaded */}
              <Show when={cs().tag === "connected" && (cs() as { tag: "connected"; conn: Connection | null }).conn}>
                {(_) => {
                  const conn = (cs() as { tag: "connected"; conn: Connection }).conn;
                  return (
                    <div class="mt-2 pt-2 border-t border-rim/50 flex flex-wrap gap-x-3 gap-y-0.5">
                      <Show when={conn.connected}>
                        <span class="text-[0.625rem] text-muted">
                          {t("ui.connected_since")} {new Date(conn.connected + "Z").toLocaleDateString(locale(), { year: "numeric", month: "short" })}
                        </span>
                      </Show>
                      <Show when={conn.role}>
                        <span class="text-[0.625rem] text-muted capitalize">{conn.role}</span>
                      </Show>
                    </div>
                  );
                }}
              </Show>
            </div>

            {/* Actions — single icon-only row */}
            <Show when={chanviewUrl() || (isLocal() && !isSelf())}>
              <div class="px-3 pb-3 flex gap-1.5 items-center">
                <Show when={chanviewUrl()}>
                  <a
                    href={chanviewUrl()}
                    title={t("ui.view_profile")}
                    class="w-8 h-8 flex items-center justify-center rounded-lg border border-rim text-muted
                           hover:border-accent hover:text-accent transition-colors"
                  >
                    <MdOutlinePerson size={16} />
                  </a>
                </Show>

                <Show when={isLocal() && !isSelf()}>
                  <Show when={cs().tag === "loading"}>
                    <button disabled class="w-8 h-8 flex items-center justify-center rounded-lg border border-rim text-muted cursor-default">
                      <span class="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                    </button>
                  </Show>

                  <Show when={cs().tag === "not_connected"}>
                    <button
                      onClick={handleConnect}
                      title={t("ui.connect")}
                      class="w-8 h-8 flex items-center justify-center rounded-lg bg-accent text-accent-fg
                             hover:opacity-90 transition-opacity"
                    >
                      <MdOutlinePerson_add size={16} />
                    </button>
                  </Show>

                  <Show when={cs().tag === "just_connected"}>
                    <button disabled title={t("ui.connected_check")}
                      class="w-8 h-8 flex items-center justify-center rounded-lg border border-rim text-muted cursor-default">
                      <MdOutlineCheck size={16} />
                    </button>
                  </Show>

                  <Show when={cs().tag === "connected"}>
                    <button
                      onClick={handleEditClick}
                      disabled={!editReady()}
                      title={t("ui.edit_connection")}
                      class="w-8 h-8 flex items-center justify-center rounded-lg border border-rim text-muted
                             hover:border-accent hover:text-accent transition-colors
                             disabled:opacity-50 disabled:cursor-default disabled:hover:border-rim disabled:hover:text-muted"
                    >
                      <Show when={editReady()} fallback={<span class="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />}>
                        <MdOutlineEdit size={16} />
                      </Show>
                    </button>
                  </Show>

                  <Show when={xchanHash()}>
                    <button
                      onClick={handleDm}
                      title={t("ui.send_dm")}
                      class="w-8 h-8 flex items-center justify-center rounded-lg border border-rim text-muted
                             hover:border-accent hover:text-accent transition-colors"
                    >
                      <MdOutlineEmail size={16} />
                    </button>
                    <Show when={chatroomsInstalled()}>
                      <button
                        onClick={handleChatButtonClick}
                        disabled={chatCreating()}
                        title={t("ui.start_chatroom")}
                        class="w-8 h-8 flex items-center justify-center rounded-lg border border-rim text-muted
                               hover:border-accent hover:text-accent transition-colors
                               disabled:opacity-50 disabled:cursor-default disabled:hover:border-rim disabled:hover:text-muted"
                      >
                        <Show when={!chatCreating()} fallback={<span class="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />}>
                          <MdOutlineChat_bubble size={16} />
                        </Show>
                      </button>
                    </Show>

                    <button
                      onClick={handleBlock}
                      disabled={blockState() !== "idle"}
                      title={blockState() === "blocked" ? t("blocklist.blocked") : t("blocklist.block")}
                      class="w-8 h-8 flex items-center justify-center rounded-lg border border-rim text-muted
                             hover:border-red-500 hover:text-red-500 transition-colors
                             disabled:cursor-default"
                      classList={{ "text-red-500 border-red-500": blockState() === "blocked" }}
                    >
                      <Show when={blockState() !== "loading"} fallback={<span class="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />}>
                        <Show when={blockState() === "blocked"} fallback={<MdOutlineBlock size={16} />}>
                          <MdOutlineCheck size={16} />
                        </Show>
                      </Show>
                    </button>
                  </Show>
                </Show>
              </div>
            </Show>

            {/* Site-wide block — admins only */}
            <Show when={isAdmin() && isLocal() && !isSelf() && xchanHash()}>
              <div class="px-3 pb-3">
                <button
                  onClick={handleSiteBlock}
                  disabled={siteBlockState() !== "idle"}
                  class="w-full flex items-center justify-center gap-1.5 text-[0.6875rem] font-medium
                         text-red-500/80 hover:text-red-500 transition-colors disabled:cursor-default"
                >
                  <Show when={siteBlockState() !== "loading"} fallback={<span class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />}>
                    <MdOutlineGavel size={13} />
                  </Show>
                  {siteBlockState() === "blocked" ? t("blocklist.site_blocked") : t("blocklist.block_from_site")}
                </button>
              </div>
            </Show>

            {/* Expiry picker — shown after clicking the chat icon */}
            <Show when={chatPanelOpen() && chatroomsInstalled()}>
              <div class="px-3 pb-3 border-t border-rim/50 pt-2 space-y-2">
                <p class="text-[0.6875rem] text-muted">{t("chat.expire_after")}</p>
                <div class="flex gap-1.5 flex-wrap items-center">
                  {([
                    [0,     "Never"],
                    [5,     "5m"],
                    [60,    "1h"],
                    [1440,  "24h"],
                    [10080, "1w"],
                  ] as [number, string][]).map(([val, label]) => (
                    <button
                      onClick={() => { setChatExpire(val); setChatCustomMode(false); }}
                      class={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                        chatExpire() === val && !chatCustomMode()
                          ? "border-accent text-accent bg-accent/10"
                          : "border-rim text-muted hover:border-accent hover:text-accent"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={() => { setChatCustomMode(true); setChatExpire(parseInt(chatCustomInput()) || 60); }}
                    class={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                      chatCustomMode()
                        ? "border-accent text-accent bg-accent/10"
                        : "border-rim text-muted hover:border-accent hover:text-accent"
                    }`}
                  >
                    Custom
                  </button>
                  <Show when={chatCustomMode()}>
                    <input
                      type="number"
                      min="1"
                      max="10080"
                      value={chatCustomInput()}
                      onInput={(e) => {
                        setChatCustomInput(e.currentTarget.value);
                        setChatExpire(parseInt(e.currentTarget.value) || 0);
                      }}
                      placeholder="min"
                      class="w-16 bg-surface border border-accent text-txt text-xs rounded-md px-2 py-1 focus:outline-none"
                    />
                  </Show>
                </div>
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sendInvite()}
                    onChange={(e) => setSendInvite(e.currentTarget.checked)}
                    class="accent-accent w-3.5 h-3.5 cursor-pointer"
                  />
                  <span class="text-[0.6875rem] text-muted">Notify {props.name}</span>
                </label>
                <button
                  onClick={handleStartChat}
                  class="w-full text-xs bg-accent text-accent-fg rounded-lg py-1.5 hover:opacity-90 transition-opacity"
                >
                  {t("chat.create")}
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </Portal>

      {/* Connection editor modal */}
      <Show when={editOpen() && cs().tag === "connected" && (cs() as { tag: "connected"; conn: Connection | null }).conn}>
        <ConnectionEditorModal
          connection={(cs() as { tag: "connected"; conn: Connection }).conn}
          authorName={props.name}
          authorAvatar={props.avatar}
          onClose={() => setEditOpen(false)}
          onDeleted={() => {
            setConnState({ tag: "not_connected" });
            setEditOpen(false);
          }}
        />
      </Show>
    </>
  );
}
