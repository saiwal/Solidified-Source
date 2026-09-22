import { createSignal, createEffect, onCleanup, Show, For } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { addConnection } from "@/modules/directory/people/api";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { oembedResolver } from "@utsukta/spa-core/lib/oembedResolver";
import { fetchConnectionByAddress } from "@/modules/directory/connections/api";
import type { Connection } from "@/modules/directory/connections/api";
import ConnectionEditorModal from "@/shared/views/ConnectionEditorModal";
import { openComposer } from "@/shared/views/modal-host";
import { MessageList } from "@/modules/hq/widgets/MessageList";
import { createStreamStore } from "@/shared/stream/store/createStreamStore";
import { createActionHandlers } from "@/shared/stream/store/actions-store";
import { fetchNetworkStream, type NetworkParams } from "@/modules/network/api";
import type { StreamHandlers } from "@/shared/stream/types";
import TimelineView, { TimelinePlaceholder } from "@/shared/stream/feedviews/TimelineView";
import { useI18n } from "@utsukta/spa-core/i18n";
import { bbcodeDisplay } from "@utsukta/spa-core/lib/renderBody";
import {
  MdOutlinePerson_add,
  MdOutlineEdit,
  MdFillLocation_on,
  MdFillPublic,
  MdOutlineArrow_back,
  MdFillOpen_in_new,
  MdOutlineContent_copy,
  MdOutlineCheck,
  MdOutlineMail,
} from "solid-icons/md";

interface RemotePost {
  id: string;
  url: string;
  content: string;
  published: string;
  summary?: string | null;
}

interface XchanData {
  xchan_hash: string;
  /** Every hash this identity is known by (see Xchan.php). */
  xchan_hashes?: string[];
  name: string;
  address: string;
  url: string;
  photo: string;
  network: string;
  is_forum: boolean;
  is_connected: boolean;
  abook_id: number | null;
  local_nick: string | null;
  // optional profile fields (local channels only)
  pdesc?: string;
  about?: string;
  location?: string;
  homepage?: string;
  keywords?: string[];
  connections?: number;
  cover?: string;
  // AP actor fields (remote channels)
  actor_fields?: { name: string; value: string }[];
  remote_posts?: RemotePost[];
}

interface NetworkBadge {
  label: string;
  cls: string;
}

function renderBbcode(raw?: string): string {
  if (!raw) return "";
  try {
    return sanitizeHtml(bbcodeDisplay(raw, { oembedResolver }));
  } catch {
    return "";
  }
}


function networkBadge(network?: string): NetworkBadge | null {
  if (!network) return null;
  switch (network.toLowerCase()) {
    case "zot6":
      return { label: "Hubzilla", cls: "bg-violet-500/20 text-violet-400" };
    case "activitypub":
      return { label: "ActivityPub", cls: "bg-indigo-500/20 text-indigo-400" };
    case "rss":
      return { label: "RSS", cls: "bg-orange-500/20 text-orange-400" };
    case "diaspora":
      return { label: "Diaspora", cls: "bg-emerald-500/20 text-emerald-400" };
    default:
      return null;
  }
}

async function fetchXchan(hash: string): Promise<XchanData | null> {
  if (!hash) return null;
  const res = await apiFetch(`/spa/xchan?hash=${encodeURIComponent(hash)}`);
  if (!res.ok) return null;
  const { data } = await res.json();
  return data as XchanData;
}

// Mirrors Hubzilla core's Zotlabs\Lib\Url::zid(): appends the viewer's own
// channel address as ?zid= so the remote site's zid_init() can trigger a
// zot6 magic-auth (reverse OWA) handshake and log the viewer in there.
function withZid(url: string, network: string | undefined, nick: string): string {
  if (!url || network?.toLowerCase() !== "zot6" || !nick || url.includes("zid=")) return url;
  let host = "";
  try { host = new URL(url).hostname; } catch { return url; }
  if (host === window.location.hostname) return url;
  const zid = `${nick}@${window.location.hostname}`;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}zid=${encodeURIComponent(zid)}`;
}

type ConnectState =
  | { tag: "idle" }
  | { tag: "loading" }
  | { tag: "done" };

export default function ChanView() {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const auth = useAuth();

  const hash = () => {
    const h = searchParams.hash;
    return Array.isArray(h) ? h[0] : (h ?? "");
  };

  const param = (key: string) => {
    const v = (searchParams as Record<string, string | string[] | undefined>)[key];
    return Array.isArray(v) ? v[0] : v;
  };

  // When the local hash lookup misses (channel never discovered on this
  // site), fall back to whatever profile data the caller already had —
  // e.g. a directory search result — instead of a bare "not found".
  const fallback = (): XchanData | null => {
    const name = param("name");
    const address = param("addr");
    if (!name || !address) return null;
    const kw = param("kw");
    return {
      xchan_hash: "",
      name,
      address,
      url: param("url") ?? "",
      photo: param("photo") ?? "",
      network: "zot6",
      is_forum: param("forum") === "1",
      is_connected: false,
      abook_id: null,
      local_nick: null,
      pdesc: param("desc"),
      location: param("location"),
      homepage: param("homepage"),
      cover: param("cover"),
      keywords: kw ? kw.split(",").filter(Boolean) : [],
    };
  };

  const [xchan] = createQueryResource("xchan", hash, fetchXchan);

  const [connectState, setConnectState] = createSignal<ConnectState>({ tag: "idle" });
  const [editConn, setEditConn] = createSignal<Connection | null>(null);
  const [editOpen, setEditOpen] = createSignal(false);
  const [disconnected, setDisconnected] = createSignal(false);
  const [addressCopied, setAddressCopied] = createSignal(false);
  // Handed to ModalHost so a half-written DM survives navigation. The scope
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

  function copyAddress(address: string) {
    navigator.clipboard.writeText(address).then(() => {
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 1500);
    });
  }

  const x = () => xchan() ?? fallback();
  const isConnected = () => !disconnected() && (x()?.is_connected ?? false);

  const isSelf = () => {
    const a = auth();
    if (!a?.isLocal || !a.nick) return false;
    const xdata = x();
    if (!xdata?.address) return false;
    return xdata.address === `${a.nick}@${window.location.hostname}`;
  };

  const canConnect = () =>
    auth()?.isLocal === true &&
    !isSelf() &&
    !isConnected() &&
    connectState().tag !== "done";

  const canEdit = () => auth()?.isLocal === true && !isSelf() && isConnected();

  async function handleConnect() {
    const xdata = x();
    if (!xdata?.address || connectState().tag !== "idle") return;
    setConnectState({ tag: "loading" });
    try {
      await addConnection(xdata.address);
      setConnectState({ tag: "done" });
    } catch {
      setConnectState({ tag: "idle" });
    }
  }

  async function handleEditOpen() {
    const xdata = x();
    if (!xdata?.address) return;
    const conn = await fetchConnectionByAddress(xdata.address);
    if (conn) {
      setEditConn(conn);
      setEditOpen(true);
    }
  }

  const badge = () => networkBadge(x()?.network);

  // Filters match on every hash of the identity, not just the first row.
  const hashFilter = () => (x()?.xchan_hashes ?? [x()?.xchan_hash ?? ""]).filter(Boolean).join(",");

  // Their recent activity as it reached our own stream. A local store
  // instance (the modules keep singletons; this one belongs to the view) so
  // it renders through the shared timeline with working reactions/comments.
  const stream = createStreamStore<NetworkParams>(fetchNetworkStream);
  const streamActions = createActionHandlers(stream);
  const streamHandlers: StreamHandlers = {
    onLike: streamActions.handleLike,
    onDislike: streamActions.handleDislike,
    onRepeat: streamActions.handleRepeat,
    onComment: streamActions.handleComment,
    onLoadComments: streamActions.loadComments,
    onLoadMoreComments: streamActions.loadMoreComments,
    onStar: streamActions.handleStar,
    onDelete: streamActions.handleDelete,
    onEdit: streamActions.handleEdit,
    onRefresh: streamActions.handleRefresh,
  };

  createEffect(() => {
    const h = hashFilter();
    if (h && auth()?.isLocal) void stream.load({ xchan: h });
  });
  onCleanup(() => stream.stopPolling());

  return (
    <div class="max-w-3xl mx-auto py-4 px-2">
      {/* Back button */}
      <button
        onClick={() => history.back()}
        class="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-txt transition-colors"
      >
        <MdOutlineArrow_back size={18} />
        <span>{t("ui.back")}</span>
      </button>

      <Show when={xchan.loading}>
        <ChanViewSkeleton />
      </Show>

      <Show when={(xchan.error || (xchan() === null && !xchan.loading)) && !fallback()}>
        <div class="rounded-2xl bg-surface border border-rim p-8 text-center text-muted text-sm">
          {t("ui.not_found_title")}
        </div>
      </Show>

      <Show when={x()}>
        {(xdata) => {
          const b = badge();
          return (
            <div class="rounded-2xl overflow-hidden bg-surface border border-rim shadow-sm">
              {/* Cover / header band */}
              <div
                class="relative bg-gradient-to-br from-accent/60 to-accent-txt/60"
                style="aspect-ratio: 3 / 1;"
              >
                <Show when={xdata().cover}>
                  <img src={xdata().cover} alt="" class="absolute inset-0 w-full h-full object-cover" />
                </Show>
                <div class="absolute -bottom-10 left-5">
                  <Show
                    when={xdata().photo}
                    fallback={
                      <div class="w-20 h-20 rounded-full ring-4 ring-surface bg-gradient-to-br from-accent to-accent-txt flex items-center justify-center text-accent-fg text-2xl font-bold">
                        {xdata().name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    }
                  >
                    <img
                      src={xdata().photo}
                      alt={xdata().name}
                      class="w-20 h-20 rounded-full ring-4 ring-surface object-cover bg-overlay"
                    />
                  </Show>
                </div>
              </div>

              {/* Body */}
              <div class="pt-12 px-5 pb-5">
                {/* Name row */}
                <div class="flex items-start justify-between gap-3 flex-wrap">
                  <div class="min-w-0">
                    <h1 class="text-lg font-bold leading-tight text-txt truncate">
                      {xdata().name}
                    </h1>
                    <Show when={xdata().address}>
                      <p class="flex items-center gap-1 text-sm text-muted mt-0.5">
                        <span class="truncate">@{xdata().address}</span>
                        <button
                          onClick={() => copyAddress(xdata().address)}
                          title={t("ui.copy_address")}
                          aria-label={t("ui.copy_address")}
                          class="p-0.5 rounded hover:bg-overlay transition-colors text-muted hover:text-txt shrink-0"
                        >
                          <Show
                            when={addressCopied()}
                            fallback={<MdOutlineContent_copy size={13} />}
                          >
                            <MdOutlineCheck size={13} class="text-accent" />
                          </Show>
                        </button>
                      </p>
                    </Show>
                    <Show when={xdata().pdesc}>
                      <p class="text-xs text-muted mt-0.5 italic">{xdata().pdesc}</p>
                    </Show>
                    <Show when={b}>
                      <span class={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[0.625rem] font-semibold leading-none ${b!.cls}`}>
                        {b!.label}
                      </span>
                    </Show>
                  </div>

                  {/* Action button */}
                  <div class="shrink-0 flex gap-2">
                    <Show when={canConnect()}>
                      <button
                        onClick={handleConnect}
                        disabled={connectState().tag === "loading"}
                        class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium
                               bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-60"
                      >
                        <Show when={connectState().tag === "loading"}>
                          <span class="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                        </Show>
                        <Show when={connectState().tag !== "loading"}>
                          <MdOutlinePerson_add size={16} />
                        </Show>
                        <span>{t("ui.connect")}</span>
                      </button>
                    </Show>

                    <Show when={connectState().tag === "done"}>
                      <span class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium
                                   border border-rim text-muted cursor-default">
                        {t("ui.connected_check")}
                      </span>
                    </Show>

                    <Show when={canEdit()}>
                      <button
                        onClick={handleEditOpen}
                        class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium
                               border border-rim text-muted hover:border-accent hover:text-accent transition-colors"
                      >
                        <MdOutlineEdit size={16} />
                        <span>{t("ui.edit_connection")}</span>
                      </button>
                    </Show>

                    <Show when={canEdit() && xdata().xchan_hash}>
                      <button
                        onClick={() =>
                          openDm({
                            xid: x()!.xchan_hash,
                            name: x()!.name,
                            nick: x()!.address,
                            photo: x()!.photo,
                          })
                        }
                        title={t("ui.send_dm")}
                        class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium
                               border border-rim text-muted hover:border-accent hover:text-accent transition-colors"
                      >
                        <MdOutlineMail size={16} />
                        <span>{t("ui.send_dm")}</span>
                      </button>
                    </Show>

                    <Show when={xdata().local_nick}>
                      <a
                        href={`/channel/${xdata().local_nick}`}
                        rel="external"
                        class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium
                               border border-rim text-muted hover:border-accent hover:text-accent transition-colors"
                      >
                        {t("ui.view_channel")}
                      </a>
                    </Show>
                  </div>
                </div>

                {/* Remote channel indicator */}
                <Show when={!xdata().local_nick && xdata().url}>
                  {(_) => {
                    const domain = () => { try { return new URL(xdata().url).hostname; } catch { return xdata().url; } };
                    const a = auth();
                    const remoteUrl = () =>
                      a?.isLocal && a.nick ? withZid(xdata().url, xdata().network, a.nick) : xdata().url;
                    return (
                      <a
                        href={remoteUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg
                               bg-overlay border border-rim text-xs text-muted
                               hover:border-accent hover:text-accent transition-colors group"
                      >
                        <MdFillPublic size={13} class="shrink-0" />
                        <span>{t("ui.remote_hosted_on")} <strong class="text-txt group-hover:text-accent">{domain()}</strong></span>
                        <MdFillOpen_in_new size={11} class="ml-auto shrink-0" />
                      </a>
                    );
                  }}
                </Show>

                {/* About */}
                <Show when={xdata().about}>
                  <div
                    class="mt-4 text-sm text-txt leading-relaxed prose prose-sm dark:prose-invert max-w-none
                           prose-a:text-accent prose-a:no-underline prose-a:hover:underline"
                    innerHTML={renderBbcode(xdata().about)}
                  />
                </Show>

                {/* Meta row */}
                <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <Show when={xdata().location}>
                    <span class="flex items-center gap-1">
                      <MdFillLocation_on size={14} /> {xdata().location}
                    </span>
                  </Show>
                  <Show when={xdata().homepage}>
                    <a
                      href={xdata().homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center gap-1 hover:text-accent transition-colors"
                    >
                      <MdFillPublic size={13} />
                      {xdata().homepage!.replace(/^https?:\/\//, "")}
                    </a>
                  </Show>
                  <Show when={(xdata().connections ?? 0) > 0}>
                    <span>
                      <strong class="text-txt">{xdata().connections}</strong> {t("channel.connections")}
                    </span>
                  </Show>
                </div>

                {/* Keywords */}
                <Show when={(xdata().keywords?.length ?? 0) > 0}>
                  <div class="mt-3 flex flex-wrap gap-1.5">
                    <For each={xdata().keywords}>
                      {(kw) => (
                        <span class="px-2 py-0.5 text-xs rounded-full bg-overlay text-muted">
                          #{kw}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>

                {/* AP actor profile fields (remote channels) */}
                <Show when={(xdata().actor_fields?.length ?? 0) > 0}>
                  <div class="mt-4 pt-4 border-t border-rim space-y-1.5">
                    <For each={xdata().actor_fields}>
                      {(f) => (
                        <div class="flex gap-3 text-xs">
                          <span class="text-muted w-24 shrink-0">{f.name}</span>
                          <span class="text-txt">{f.value}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

              </div>
            </div>
          );
        }}
      </Show>

      {/* DM history with this channel — same list the inbox uses, narrowed
          to threads involving their xchan (see HqMessages' xchan filter). */}
      <Show when={canEdit() && x()?.xchan_hash}>
        <div class="mt-4">
          <h2 class="text-xs font-semibold text-muted uppercase tracking-wide px-1 mb-2">
            {t("network.direct_messages")}
          </h2>
          {/* MessageList scrolls and paginates internally, so it needs a
              container that doesn't grow with its content. */}
          <div class="rounded-2xl overflow-hidden bg-surface border border-rim flex flex-col max-h-[26rem]">
            <MessageList type="direct" xchan={hashFilter()} />
          </div>
        </div>
      </Show>

      {/* Recent activity: the timeline over their posts in our own stream —
          local or remote alike. The AP outbox (Xchan.php fetches one for
          actors we can read) is the fallback for channels whose posts never
          reached us, and stays as plain non-interactive cards. */}
      <Show when={stream.loading() || stream.posts().length > 0}>
        <div class="mt-4">
          <h2 class="text-xs font-semibold text-muted uppercase tracking-wide px-1 mb-2">
            {t("ui.recent_posts")}
          </h2>
          <Show when={!stream.loading()} fallback={<TimelinePlaceholder count={2} />}>
            <TimelineView posts={stream.posts()} handlers={streamHandlers} />
          </Show>
        </div>
      </Show>

      <Show when={!stream.loading() && stream.posts().length === 0 && (x()?.remote_posts?.length ?? 0) > 0}>
        <div class="mt-4 space-y-3">
          <h2 class="text-xs font-semibold text-muted uppercase tracking-wide px-1">
            {t("ui.recent_posts")}
          </h2>
          <For each={x()!.remote_posts}>
            {(post) => <RemotePostCard post={post} />}
          </For>
        </div>
      </Show>

      {/* Connection editor modal */}
      <Show when={editOpen() && editConn()}>
        <ConnectionEditorModal
          connection={editConn()!}
          authorName={x()?.name ?? ""}
          authorAvatar={x()?.photo}
          onClose={() => setEditOpen(false)}
          onDeleted={() => {
            setDisconnected(true);
            setEditConn(null);
            setEditOpen(false);
          }}
        />
      </Show>

    </div>
  );
}

function RemotePostCard(props: { post: RemotePost }) {
  const { post } = props;

  const dateStr = () => {
    if (!post.published) return "";
    const d = new Date(post.published);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div class="rounded-xl bg-surface border border-rim px-4 py-3 text-sm">
      <Show when={post.summary}>
        <p class="text-xs font-medium text-muted mb-1 italic">{post.summary}</p>
      </Show>
      <div
        class="text-txt leading-relaxed prose prose-sm dark:prose-invert max-w-none
               prose-a:text-accent prose-a:no-underline prose-a:hover:underline
               line-clamp-6"
        innerHTML={post.content}
      />
      <div class="mt-2 flex items-center justify-between">
        <span class="text-xs text-muted">{dateStr()}</span>
        <Show when={post.url}>
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors"
          >
            <MdFillOpen_in_new size={12} />
          </a>
        </Show>
      </div>
    </div>
  );
}

function ChanViewSkeleton() {
  return (
    <div class="rounded-2xl overflow-hidden bg-surface border border-rim shadow-sm animate-pulse">
      <div class="h-36 bg-overlay" />
      <div class="pt-12 px-5 pb-5">
        <div class="flex items-start justify-between">
          <div class="space-y-2">
            <div class="h-5 w-44 bg-overlay rounded" />
            <div class="h-3.5 w-28 bg-overlay rounded" />
            <div class="h-4 w-16 bg-overlay rounded-full mt-1" />
          </div>
          <div class="h-9 w-28 bg-overlay rounded-full" />
        </div>
        <div class="mt-4 space-y-2">
          <div class="h-3 bg-overlay rounded w-full" />
          <div class="h-3 bg-overlay rounded w-3/4" />
        </div>
      </div>
    </div>
  );
}
