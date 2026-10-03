// src/modules/messenger/views/MessengerView.tsx
//
// DMs and chatrooms in one split view, for one channel. The url is the selection:
//   /messenger/:nick[/dms]                  DM list
//   /messenger/:nick/dms/:people[/:uuid]    a person's threads / one thread
//   /messenger/:nick/rooms                  room list
//   /messenger/:nick/rooms/new              create a room (owner)
//   /messenger/:nick/rooms/:room/:roomId    a room
// On your own nick it's your mailbox, rooms and bookmarks. On another channel
// (local or remote visitor) it's your DMs with that channel and the rooms it
// lets you into. Desktop shows list + pane side by side; below md, one at a time.
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, on, onMount, type JSX } from "solid-js";
import { A, useLocation, useNavigate } from "@solidjs/router";
import { useInfiniteQuery } from "@tanstack/solid-query";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchMessages } from "@utsukta/spa-core/lib/message-store";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { currentNick, useAuth } from "@utsukta/spa-core/store/auth-store";
import { MdFillChat, MdFillPeople, MdOutlineAdd, MdOutlineOpen_in_new, MdOutlineSearch } from "solid-icons/md";
import { fetchRooms } from "@/modules/chat/api";
import { addChatBookmark, bookmarkIdForRoom, bookmarks, isRoomBookmarked, loadChatBookmarks, removeChatBookmark } from "@/modules/chat/bookmarks";
import { isChatUnread, isRemoteChatUnread } from "@/modules/chat/unread";
import { BookmarkedRoomsList, type BookmarkRowParts } from "@/modules/chat/widgets/BookmarkedRoomsWidget";
import type { ChatBookmark } from "@/modules/chat/bookmarks";
import NewRoomForm from "@/modules/chat/NewRoomForm";
import { groupThreads, groupName, groupMatches, shortTime, type DmGroup } from "../dms";
import DmPane, { Avatar, PinButton, decodeHtmlEntities, toRecipient } from "../DmPane";
import { usePins, setPinned } from "../pins";
import { toast } from "@utsukta/spa-core/store/toast";
import NewDmPane from "../NewDmPane";
import RoomPane from "../RoomPane";

/** A row holding a link plus a pin button beside it. */
const pinRowClass = (active: boolean) =>
  `group flex items-center gap-1 pl-3 pr-1 transition-colors ${active ? "bg-elevated" : "hover:bg-elevated/60"}`;

/** One room row — the same for your rooms and your pinned (bookmarked) ones. */
function RoomRow(props: {
  active: boolean;
  name: string;
  unread: boolean;
  /** People in the room now; absent for a room on another hub. */
  count?: number;
  /** A room on another hub: opens there, in a new tab. */
  remote?: boolean;
  onOpen: () => void;
  /** Extra controls before the pin (the remote-room push toggle). */
  extra?: JSX.Element;
  pin?: { pinned: boolean; onClick: () => void };
}) {
  const { t } = useI18n();
  return (
    <div class={pinRowClass(props.active)}>
      <button type="button" onClick={props.onOpen} class="flex-1 min-w-0 flex items-center gap-3 py-2.5 text-left">
        <div class="w-10 h-10 rounded-full bg-accent-muted text-accent flex items-center justify-center shrink-0">
          <MdFillChat size={18} />
        </div>
        <span class="flex-1 min-w-0 text-sm text-txt truncate" classList={{ "font-semibold": props.unread }}>{props.name}</span>
        <Show when={props.unread}>
          <span class="w-2 h-2 rounded-full bg-accent shrink-0" role="img" aria-label={t("chat.unread") as string} />
        </Show>
        <Show
          when={!props.remote}
          fallback={<MdOutlineOpen_in_new size={14} class="text-muted shrink-0" />}
        >
          <span class="flex items-center gap-1 text-xs text-muted tabular-nums shrink-0">
            <MdFillPeople size={14} />
            {props.count ?? "–"}
          </span>
        </Show>
      </button>
      {props.extra}
      <Show when={props.pin}>
        {(p) => <PinButton pinned={p().pinned} onClick={p().onClick} />}
      </Show>
    </div>
  );
}

/** A pinned room: its live state from the owning channel's room list (the
 *  same cached query the chat widgets use), or the bookmark's own for
 *  another hub's room. */
function PinnedRoomRow(props: { bm: ChatBookmark; parts: BookmarkRowParts; active: boolean }) {
  const [list] = createQueryResource("chat-rooms", () => props.parts.room?.nick ?? null, fetchRooms);
  const room = () => (list.error ? undefined : list()?.rooms.find((r) => r.id === props.parts.room?.id));
  return (
    <RoomRow
      active={props.active}
      name={props.bm.title}
      remote={!props.parts.room}
      unread={props.parts.room ? !!room() && isChatUnread(props.parts.room.nick, room()!) : isRemoteChatUnread(props.bm)}
      count={room()?.in_room}
      onOpen={props.parts.open}
      extra={props.parts.push}
      pin={{ pinned: true, onClick: props.parts.remove }}
    />
  );
}

export default function MessengerView() {
  const { t, locale } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();

  const path = createMemo(() => location.pathname.split("/").slice(2).filter(Boolean).map(decodeURIComponent));
  const nick = () => path()[0] ?? "";
  // Bare /messenger: your own.
  createEffect(() => { if (!nick() && currentNick()) navigate(`/messenger/${currentNick()}`, { replace: true }); });
  const base = () => `/messenger/${encodeURIComponent(nick())}`;
  const segs = () => path().slice(1);
  const isOwner = () => !!auth()?.isLocal && nick() === currentNick();
  const urlTab = () => (segs()[0] === "rooms" ? "rooms" : "dms");
  // Local, so flipping tabs keeps the open conversation; follows the url.
  const [pickedTab, setTab] = createSignal<"dms" | "rooms">(urlTab());
  createEffect(on(urlTab, setTab, { defer: true }));
  const selected = () => segs().length > 1;
  const [query, setQuery] = createSignal("");

  // ── DMs ──
  const dms = useInfiniteQuery(() => ({
    queryKey: ["messenger-dms", nick()],
    queryFn: ({ pageParam }) => fetchMessages({
      offset: pageParam, type: "direct", file: "", search: "",
      channel: isOwner() ? undefined : nick(),
    }),
    enabled: !!nick(),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset >= 0 ? last.offset : undefined),
    refetchInterval: 30_000,
  }));
  // ponytail: search filters the loaded pages only; use hq-messages `author` if that falls short.
  const allGroups = createMemo(() => groupThreads(dms.data?.pages.flatMap((p) => p.entries) ?? []));
  const groups = () => allGroups().filter((g) => groupMatches(g, query()));

  // ── Pins: conversations bookmarked from here, listed first ──
  const pins = usePins(base);
  const pinFor = (key: string) => pins.data?.find((p) => p.key === key);
  const pinnedGroups = () =>
    (pins.data ?? [])
      .map((p) => ({ pin: p, g: allGroups().find((g) => g.key === p.key) }))
      // A pinned conversation not on the loaded pages still lists, by its title.
      .filter(({ pin, g }) => (g ? groupMatches(g, query()) : pin.title.toLowerCase().includes(query().toLowerCase())));
  const unpinnedGroups = () => groups().filter((g) => !pinFor(g.key));
  const togglePin = (key: string, title: string) =>
    setPinned(base(), key, title, pinFor(key)).catch((e) => toast.error((e as Error).message));

  // ── Rooms: the channel's (the API filters by the viewer's permissions).
  // On your own, your bookmarked rooms (here or on other hubs) are its
  // pinned section, and a bookmarked room of yours is listed only there. ──
  const [own] = createQueryResource("chat-rooms", () => nick() || null, fetchRooms);
  onMount(() => { if (auth()?.isLocal) void loadChatBookmarks(); });
  const matches = (name: string) => name.toLowerCase().includes(query().toLowerCase());
  const ownRooms = () =>
    (own.error ? [] : own()?.rooms ?? []).filter((r) => matches(r.name) && !(isOwner() && isRoomBookmarked(nick(), r.id)));
  const pinnedRooms = () => (isOwner() ? bookmarks().filter((bm) => matches(bm.title)) : []);
  async function toggleRoomPin(roomId: number, name: string) {
    const id = bookmarkIdForRoom(nick(), roomId);
    if (id) await removeChatBookmark(id);
    else await addChatBookmark(nick(), roomId, name);
  }
  // Rooms (tab + switcher) only when this channel has the Chatrooms app — the
  // same gate core's /chat uses. Unknown (loading) or an error counts as off,
  // so the switcher never flashes in and out. `tab()` folds the gate in, so
  // every caller below stays DMs-only while rooms are off.
  const roomsOn = () => !own.error && own()?.chatrooms_installed === true;
  const tab = () => (roomsOn() ? pickedTab() : "dms");
  // A /rooms url on a channel without the app: back to its DMs. Waits for this
  // nick's own answer (`loading` covers a previous channel's placeholder data).
  createEffect(() => {
    if (!own.loading && !roomsOn() && segs()[0] === "rooms") navigate(base(), { replace: true });
  });
  const canCreateRoom = () => isOwner() && !own.error && own()?.is_owner && own()?.chatrooms_installed !== false;
  // A local visitor can start a DM from their own channel; a remote one sends from their hub.
  const canNewDm = () => !!auth()?.isLocal;

  async function newItem() {
    if (tab() === "rooms") return navigate(`${base()}/rooms/new`);
    // Visiting: the DM goes to this channel.
    const ch = isOwner() ? null : await apiFetch(`/spa/profile/${nick()}`).then((r) => r.json()).then((j) => j.data).catch(() => null);
    const to = ch?.channel_hash
      ? [toRecipient({ hash: ch.channel_hash, name: ch.channel_name, addr: ch.xchan_addr || nick(), photo: ch.channel_photo_l })]
      : [];
    navigate(`${base()}/dms/new`, { state: { to } });
  }

  const roomActive = (nick: string, id: number) => segs()[1] === nick && segs()[2] === String(id);
  const empty = (text: string) => <p class="px-4 py-8 text-sm text-muted text-center">{text}</p>;
  const section = (text: string) => (
    <p class="px-3 pt-2 pb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-muted">{text}</p>
  );
  const canPin = () => !!auth()?.isLocal;

  // One conversation row. The pin sits beside the link, not inside it.
  const dmRow = (g: DmGroup | undefined, key: string, title: string) => (
    <div class={pinRowClass(segs()[0] === "dms" && segs()[1] === key)}>
      <A href={`${base()}/dms/${encodeURIComponent(key)}`} class="flex-1 min-w-0 flex items-center gap-3 py-2.5">
        <Avatar src={g?.people[0]?.photo} name={g ? groupName(g) : title} />
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span class="flex-1 text-sm text-txt truncate" classList={{ "font-semibold": (g?.unread ?? 0) > 0 }}>{g ? groupName(g) : title}</span>
            <Show when={g}>
              <span class="text-[0.6875rem] text-muted shrink-0 tabular-nums">{shortTime(g!.threads[0].created, locale())}</span>
            </Show>
          </div>
          <Show when={g}>
            <div class="flex items-center gap-2">
              <span class="flex-1 text-xs text-muted truncate">
                {g!.threads[0].title || decodeHtmlEntities(g!.threads[0].summary)}
              </span>
              <Show when={g!.threads.length > 1}>
                <span class="text-[0.625rem] text-muted shrink-0 tabular-nums" title={t("messenger.conversations", { n: String(g!.threads.length) }) as string}>
                  ×{g!.threads.length}
                </span>
              </Show>
              <Show when={g!.unread > 0}>
                <span class="min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-accent text-accent-fg text-[0.625rem] font-semibold flex items-center justify-center tabular-nums">
                  {g!.unread}
                </span>
              </Show>
            </div>
          </Show>
        </div>
      </A>
      <Show when={canPin()}>
        <PinButton pinned={!!pinFor(key)} onClick={() => void togglePin(key, g ? groupName(g) : title)} />
      </Show>
    </div>
  );

  return (
    <div class="flex h-[calc(100dvh-10rem)] md:h-[calc(100dvh-8rem)] min-h-[20rem] border border-rim rounded-2xl overflow-hidden bg-surface">
      {/* ── List ── */}
      <aside
        class="flex-col w-full md:w-72 lg:w-80 shrink-0 md:border-r border-rim min-h-0"
        classList={{ "hidden md:flex": selected(), flex: !selected() }}
      >
        <div class="p-3 space-y-3 shrink-0">
          <label class="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-rim focus-within:border-accent">
            <MdOutlineSearch size={18} class="text-muted shrink-0" />
            <input
              type="search"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              placeholder={t("messenger.search") as string}
              class="flex-1 min-w-0 bg-transparent text-sm text-txt outline-none"
            />
          </label>
          <Show when={roomsOn()}>
          <div role="tablist" class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-elevated text-sm">
            <For each={["dms", "rooms"] as const}>
              {(k) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab() === k}
                  onClick={() => setTab(k)}
                  class="flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-colors"
                  classList={{ "bg-surface text-txt font-medium shadow-sm": tab() === k, "text-muted hover:text-txt": tab() !== k }}
                >
                  {k === "dms" ? t("messenger.tab_dms") : t("messenger.tab_rooms")}
                  <Show when={k === "dms" && groups().some((g) => g.unread)}>
                    <span class="w-1.5 h-1.5 rounded-full bg-accent" />
                  </Show>
                </button>
              )}
            </For>
          </div>
          </Show>
        </div>

        <div class="flex-1 overflow-y-auto min-h-0">
          <Show when={tab() === "dms"}>
            <Show when={dms.isLoading}>
              <div class="px-3 space-y-3 animate-pulse">
                <For each={[0, 1, 2, 3]}>{() => <div class="h-10 bg-elevated rounded-xl" />}</For>
              </div>
            </Show>
            <Show when={dms.isError && !dms.data}>{empty(t("messenger.load_failed") as string)}</Show>
            <Show when={dms.isSuccess && !groups().length && !pinnedGroups().length}>
              {empty((query() ? t("messenger.no_match") : t("messenger.no_dms")) as string)}
            </Show>
            <Show when={pinnedGroups().length}>
              {section(t("messenger.pinned") as string)}
              <For each={pinnedGroups()}>{({ pin, g }) => dmRow(g, pin.key, pin.title)}</For>
              <Show when={unpinnedGroups().length}>{section(t("messenger.tab_dms") as string)}</Show>
            </Show>
            <For each={unpinnedGroups()}>{(g) => dmRow(g, g.key, groupName(g))}</For>
            <Show when={dms.hasNextPage}>
              <button
                type="button"
                onClick={() => void dms.fetchNextPage()}
                disabled={dms.isFetchingNextPage}
                class="w-full py-3 text-xs text-muted hover:text-txt disabled:opacity-50"
              >
                {t("messenger.load_more")}
              </button>
            </Show>
          </Show>

          <Show when={tab() === "rooms"}>
            {/* Your bookmarked rooms: the Bookmarked Rooms widget's own list. */}
            <Show when={pinnedRooms().length}>
              {section(t("messenger.pinned") as string)}
              <BookmarkedRoomsList
                filter={(bm) => matches(bm.title)}
                onOpenLocal={(n, id) => navigate(`${base()}/rooms/${encodeURIComponent(n)}/${id}`)}
                row={(bm, parts) => (
                  <PinnedRoomRow bm={bm} parts={parts} active={!!parts.room && roomActive(parts.room.nick, parts.room.id)} />
                )}
              />
            </Show>
            <Show when={ownRooms().length}>
              {section((isOwner() ? t("messenger.my_rooms") : t("messenger.tab_rooms")) as string)}
              <For each={ownRooms()}>
                {(r) => (
                  <RoomRow
                    active={roomActive(nick(), r.id)}
                    name={r.name}
                    unread={isChatUnread(nick(), r)}
                    count={r.in_room}
                    onOpen={() => navigate(`${base()}/rooms/${encodeURIComponent(nick())}/${r.id}`)}
                    pin={canPin() ? { pinned: isRoomBookmarked(nick(), r.id), onClick: () => void toggleRoomPin(r.id, r.name) } : undefined}
                  />
                )}
              </For>
            </Show>
            <Show when={!own.loading && !ownRooms().length && !pinnedRooms().length}>
              {empty((query() ? t("messenger.no_match") : t("messenger.no_rooms")) as string)}
            </Show>
          </Show>
        </div>

        <Show when={tab() === "dms" ? canNewDm() : canCreateRoom()}>
          <div class="p-3 border-t border-rim shrink-0">
            <button
              type="button"
              onClick={() => void newItem()}
              class="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-accent text-accent-fg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <MdOutlineAdd size={18} />
              {tab() === "dms" ? t("messenger.new_dm") : t("messenger.new_room")}
            </button>
          </div>
        </Show>
      </aside>

      {/* ── Conversation ── */}
      <main class="flex-1 min-w-0 flex-col min-h-0" classList={{ "hidden md:flex": !selected(), flex: selected() }}>
        <Switch fallback={
          <div class="flex-1 flex flex-col items-center justify-center gap-2 text-muted">
            <MdFillChat size={40} class="opacity-40" />
            <p class="text-sm">{t("messenger.select")}</p>
          </div>
        }>
          <Match when={segs()[0] === "dms" && segs()[1] === "new" && auth()?.isLocal}>
            {/* Keyed on the navigation's state: each "new message" starts fresh. */}
            <Show when={location.state || "blank"} keyed>{(_s) => <NewDmPane base={base()} />}</Show>
          </Match>
          <Match when={segs()[0] === "dms" && segs()[1]}>
            <DmPane base={base()} channel={isOwner() ? undefined : nick()} groupKey={segs()[1]} uuid={segs()[2]} />
          </Match>
          <Match when={segs()[0] === "rooms" && segs()[1] === "new" && isOwner()}>
            <div class="flex-1 overflow-y-auto p-4">
              <NewRoomForm
                nick={nick()}
                onCreated={(room) => navigate(`${base()}/rooms/${encodeURIComponent(nick())}/${room.id}`)}
                onCancel={() => navigate(`${base()}/rooms`)}
              />
            </div>
          </Match>
          <Match when={segs()[0] === "rooms" && segs()[2] && `${segs()[1]}/${segs()[2]}`} keyed>
            {/* Keyed: a different room is a new session (leave old, join new). */}
            {(_key) => <RoomPane base={base()} nick={segs()[1]} roomId={Number(segs()[2])} />}
          </Match>
        </Switch>
      </main>
    </div>
  );
}
