import { For, Show, Switch, Match, createSignal, createEffect, onMount, onCleanup, batch } from "solid-js";
import {
  connectionsData, refetch, setFilter, setOrder, setSearch, setPage,
  filter, order, search, page, LIMIT,
} from "../../connections/store";
import type { ConnectionFilter, ConnectionOrder, Connection } from "../../connections/api";
import { deleteConnection, approveConnection, fetchConnectionByAddress, fetchConnectionById } from "../../connections/api";
import { addConnection } from "../../people/api";
import { useSearchParams } from "@solidjs/router";
import ImportConnectionsModal from "../ImportConnectionsModal";
import ConnectionEditorModal from "@/shared/views/ConnectionEditorModal";
import { PlatformIcon } from "@/shared/stream/components/PlatformIcons";
import Tooltip from "@/shared/views/Tooltip";
import DMComposer from "@/shared/editor/composers/DMComposer";
import { createRoom } from "@/modules/chat/api";
import { MdOutlineEdit, MdOutlineEmail, MdOutlineChat_bubble } from "solid-icons/md";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer, useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { isAppInstalled } from "@utsukta/spa-core/module-registry";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";

// ── Constants ─────────────────────────────────────────────────────────────────

const FILTER_IDS: ConnectionFilter[] = ["active", "pending", "blocked", "ignored", "hidden", "archived", "all"];
const ORDER_IDS: { id: ConnectionOrder; key: string }[] = [
  { id: "name",           key: "order_name_asc"  },
  { id: "name_desc",      key: "order_name_desc" },
  { id: "connected",      key: "order_oldest"    },
  { id: "connected_desc", key: "order_newest"    },
];

function formatDate(iso: string): string {
  if (!iso || iso.startsWith("0001")) return "—";
  return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

// ── PermissionDot ─────────────────────────────────────────────────────────────
// Mirrors classic Hubzilla's connections "traffic light": red/yellow/green dot
// based on how many of these 3 their_perms keys the contact has granted us.

const PERM_ORDER: { key: string; labelKey: string }[] = [
  { key: "post_comments", labelKey: "directory.perm_comments" },
  { key: "send_stream",   labelKey: "directory.perm_stream_items" },
  { key: "post_wall",     labelKey: "directory.perm_wall_posts" },
];

function PermissionDot(props: { granted: string[] }) {
  const { t } = useI18n();
  const grantedSet = () => new Set(props.granted);
  const count = () => props.granted.length;
  const color = () =>
    count() === 3 ? "bg-green-500" : count() > 0 ? "bg-yellow-500" : "bg-red-500";
  const tooltip = () => {
    const labels = PERM_ORDER
      .filter((p) => grantedSet().has(p.key))
      .map((p) => t(p.labelKey as any));
    return `${t("directory.perm_accepts")}: ${labels.length ? labels.join(", ") : t("directory.perm_nothing")}`;
  };

  return (
    <Tooltip content={tooltip()}>
      <span class={`w-2.5 h-2.5 rounded-full shrink-0 ${color()}`} />
    </Tooltip>
  );
}

// ── ConnectionCard ────────────────────────────────────────────────────────────

function ConnectionCard(props: { conn: Connection; onDeleted: () => void }) {
  const [busy, setBusy] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [editOpen, setEditOpen] = createSignal(false);
  const [dmOpen, setDmOpen] = createSignal(false);
  const [chatPanelOpen, setChatPanelOpen] = createSignal(false);
  const [chatCreating, setChatCreating] = createSignal(false);
  const [chatExpire, setChatExpire] = createSignal(0);
  const [chatCustomMode, setChatCustomMode] = createSignal(false);
  const [chatCustomInput, setChatCustomInput] = createSignal("60");
  const [sendInvite, setSendInvite] = createSignal(true);
  const { t } = useI18n();
  const auth = useAuth();
  const navViewer = useNavViewer();
  const installedApps = useInstalledApps();
  const chatroomsInstalled = () => isAppInstalled(installedApps(), "/chat/");
  const navigate = useNavigate();

  function handleChatButtonClick() {
    setChatPanelOpen((v) => !v);
    setChatExpire(0);
    setChatCustomMode(false);
    setChatCustomInput("60");
    setSendInvite(true);
  }

  async function handleStartChat() {
    const nick = auth()?.nick;
    const uid  = auth()?.uid;
    if (!nick || !uid) return;
    setChatPanelOpen(false);
    setChatCreating(true);
    try {
      const names = [props.conn.name, navViewer()?.name].filter(Boolean) as string[];
      const name = names.length >= 2
        ? `Chat with ${names[0]} and ${names[1]}`
        : `Chat with ${names[0]}`;
      const room = await createRoom(nick, {
        name,
        expire: chatExpire(),
        visibility: "custom",
        allow_cid: [props.conn.xchan_hash],
      });

      if (sendInvite()) {
        const roomUrl = `${window.location.origin}/chat/${nick}/${room.id}`;
        const fd = new FormData();
        fd.append("body", `I've started a chatroom for us. [url=${roomUrl}]Join here[/url]`);
        fd.append("mimetype", "text/bbcode");
        fd.append("obj_type", "Note");
        fd.append("profile_uid", String(uid));
        fd.append("type", "wall");
        fd.append("contact_allow[]", props.conn.xchan_hash);
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

  async function handleApprove() {
    setBusy(true);
    await approveConnection(props.conn.id);
    props.onDeleted();
  }

  async function handleDelete() {
    if (!confirm(`Remove connection with ${props.conn.name}?`)) return;
    setBusy(true);
    await deleteConnection(props.conn.id);
    props.onDeleted();
  }

  return (
    <div class="rounded-lg border border-rim bg-surface overflow-hidden">
      <div class="flex items-center gap-3 p-3">
        <a href={`/chanview?f=&hash=${encodeURIComponent(props.conn.xchan_hash)}`} class="shrink-0">
          <img
            src={props.conn.photo}
            alt={props.conn.name}
            class="w-11 h-11 rounded-full object-cover ring-1 ring-rim bg-overlay"
          />
        </a>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <a
              href={`/chanview?f=&hash=${encodeURIComponent(props.conn.xchan_hash)}`}
              class="font-medium text-sm text-txt truncate hover:underline"
            >
              {props.conn.name}
            </a>
            <PermissionDot granted={props.conn.granted_perms} />
            <PlatformIcon url={props.conn.url} network={props.conn.network} size={14} />
            <Show when={props.conn.is_forum}>
              <span class="shrink-0 text-xs px-1.5 py-0.5 rounded font-medium bg-accent-muted text-accent">
                {t("directory.forum")}
              </span>
            </Show>
            <Show when={props.conn.pending}>
              <span class="shrink-0 text-xs px-1.5 py-0.5 rounded font-medium bg-accent-muted text-accent">
                {t("directory.pending")}
              </span>
            </Show>
            <For each={props.conn.status.filter((s) => s !== "pending")}>
              {(s) => (
                <span class="shrink-0 text-xs px-1.5 py-0.5 rounded font-medium bg-accent-muted text-accent">
                  {s}
                </span>
              )}
            </For>
          </div>
          <p class="text-xs text-muted truncate mt-0.5">
            {props.conn.address || props.conn.url}
          </p>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <Show when={props.conn.pending}>
            <button
              onClick={handleApprove}
              disabled={busy()}
              class="text-xs px-2 py-1 rounded bg-accent text-accent-fg hover:opacity-80 disabled:opacity-50 transition-opacity"
            >
              {t("directory.approve")}
            </button>
          </Show>
          <Show when={!props.conn.pending}>
            <button
              onClick={() => setDmOpen(true)}
              title={t("ui.send_dm")}
              class="p-1.5 rounded text-muted hover:text-txt hover:bg-overlay transition-colors"
            >
              <MdOutlineEmail size={14} />
            </button>
            <Show when={chatroomsInstalled()}>
              <button
                onClick={handleChatButtonClick}
                disabled={chatCreating()}
                title={t("ui.start_chatroom")}
                class={`p-1.5 rounded transition-colors disabled:opacity-50 ${chatPanelOpen() ? "text-accent bg-accent/10" : "text-muted hover:text-txt hover:bg-overlay"}`}
              >
                <Show when={!chatCreating()} fallback={<span class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" />}>
                  <MdOutlineChat_bubble size={14} />
                </Show>
              </button>
            </Show>
          </Show>
          <button
            onClick={() => setEditOpen(true)}
            class="p-1.5 rounded text-muted hover:text-txt hover:bg-overlay transition-colors"
            title={t("directory.edit")}
          >
            <MdOutlineEdit size={14} />
          </button>
          <button
            onClick={handleDelete}
            disabled={busy()}
            class="p-1.5 rounded text-muted hover:text-accent hover:bg-accent-muted disabled:opacity-50 transition-colors"
            title={t("directory.remove")}
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3H4" />
            </svg>
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            class="p-1.5 rounded text-muted hover:text-txt hover:bg-overlay transition-colors"
            title={t("directory.details")}
          >
            <svg
              class={`w-3.5 h-3.5 transition-transform ${expanded() ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      <Show when={chatPanelOpen()}>
        <div class="px-3 pb-3 pt-2 border-t border-rim/50 space-y-2">
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
            <span class="text-[0.6875rem] text-muted">Notify {props.conn.name}</span>
          </label>
          <div class="flex gap-2">
            <button
              onClick={() => void handleStartChat()}
              class="text-xs bg-accent text-accent-fg rounded-lg px-4 py-1.5 hover:opacity-90 transition-opacity"
            >
              {t("chat.create")}
            </button>
            <button
              onClick={() => setChatPanelOpen(false)}
              class="text-xs border border-rim text-muted rounded-lg px-3 py-1.5 hover:bg-overlay transition-colors"
            >
              {t("chat.cancel")}
            </button>
          </div>
        </div>
      </Show>

      <Show when={expanded()}>
        <div class="px-3 pb-3 pt-0 border-t border-rim grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
          <DetailField label={t("directory.field_connected")} value={formatDate(props.conn.connected)} />
          <DetailField label={t("directory.field_closeness")} value={String(props.conn.closeness)} />
          <DetailField label={t("directory.field_role")}      value={props.conn.role} />
          <DetailField label={t("directory.field_network")}   value={props.conn.network} />
          <Show when={props.conn.address}>
            <DetailField label={t("directory.field_address")} value={props.conn.address} />
          </Show>
        </div>
      </Show>

      <Show when={editOpen()}>
        <ConnectionEditorModal
          connection={props.conn}
          authorName={props.conn.name}
          authorAvatar={props.conn.photo}
          onSaved={() => props.onDeleted()}
          onClose={() => setEditOpen(false)}
          onDeleted={() => {
            setEditOpen(false);
            props.onDeleted();
          }}
        />
      </Show>

      <Show when={dmOpen() && auth()}>
        <DMComposer
          open={dmOpen()}
          onClose={() => setDmOpen(false)}
          profileUid={auth()!.uid}
          initialRecipients={[{
            type: "c",
            xid: props.conn.xchan_hash,
            id: props.conn.xchan_hash,
            name: props.conn.name,
            nick: props.conn.address,
            link: props.conn.address,
            photo: props.conn.photo,
          }]}
        />
      </Show>
    </div>
  );
}

function DetailField(props: { label: string; value: string }) {
  return (
    <div class="pt-2">
      <p class="text-muted uppercase tracking-wide text-[0.625rem] font-semibold">{props.label}</p>
      <p class="text-txt mt-0.5 break-all">{props.value}</p>
    </div>
  );
}

function ConnectionsSkeleton() {
  return (
    <div class="space-y-2">
      <For each={Array(8).fill(0)}>
        {() => (
          <div class="rounded-lg border border-rim bg-surface p-3 flex items-center gap-3 animate-pulse">
            <div class="w-11 h-11 rounded-full bg-overlay shrink-0" />
            <div class="flex-1 space-y-2">
              <div class="h-3.5 bg-overlay rounded w-1/3" />
              <div class="h-3 bg-overlay rounded w-1/2" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function ConnectionsSection() {
  const { t } = useI18n();
  const [input, setInput] = createSignal("");
  const [addBusy, setAddBusy] = createSignal(false);
  const [addError, setAddError] = createSignal<string | null>(null);
  const [newConn, setNewConn] = createSignal<Connection | null>(null);
  const [importOpen, setImportOpen] = createSignal(false);
  const [allConnections, setAllConnections] = createSignal<Connection[]>([]);
  const [hasMore, setHasMore] = createSignal(true);
  const [searchParams, setSearchParams] = useSearchParams();

  // Plain boolean ref — set synchronously before fetch, cleared when data arrives.
  // Prevents the IntersectionObserver from double-firing between setPage() and when
  // the resource actually transitions to loading=true (which is async in Solid).
  let fetchingMore = false;

  let sentinelRef!: HTMLDivElement;

  // .latest instead of () — a plain read while the resource is re-fetching triggers
  // the section's <Suspense> boundary, blanking the whole view on every page load.
  const meta = () => connectionsData.latest?.meta;

  onMount(() => {
    setPage(0);

    // Deep-link from a notification (e.g. "new connection request") — see
    // resolveNotifyPath, which routes classic connections#<abook_id> intro
    // links here as ?open=<abook_id> so the accept/reject modal opens directly.
    const openId = Number(searchParams.open);
    if (openId > 0) {
      fetchConnectionById(openId).then((conn) => {
        if (conn) setNewConn(conn);
      });
      setSearchParams({ open: undefined });
    }
  });

  onCleanup(() => {
    setPage(0);
  });

  // Only tracks connectionsData() — NOT page(). Tracking page() caused the effect to
  // fire with stale data the moment setPage() was called, before the resource switched
  // to loading, resulting in duplicate appends followed by an unexpected full replace.
  createEffect(() => {
    const data = connectionsData.latest;
    if (connectionsData.loading || !data) return;

    fetchingMore = false;

    // meta.offset === 0 means a fresh fetch (new search/filter/sort or first page).
    if (data.meta.offset === 0) {
      setAllConnections(data.connections);
    } else {
      setAllConnections((prev) => [...prev, ...data.connections]);
    }

    setHasMore(data.connections.length >= LIMIT);
  });

  onMount(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore() && !fetchingMore && allConnections().length > 0) {
          fetchingMore = true;
          setPage((p) => p + 1);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinelRef);
    onCleanup(() => observer.disconnect());
  });

  function onDeleted() {
    setAllConnections([]);
    setHasMore(true);
    fetchingMore = false;
    if (page() > 0) setPage(0);
    else refetch();
  }

  function applySearch() {
    setAddError(null);
    batch(() => {
      setAllConnections([]);
      setHasMore(true);
      fetchingMore = false;
      setSearch(input());
      setPage(0);
    });
  }

  function handleFilterChange(f: ConnectionFilter) {
    batch(() => {
      setAllConnections([]);
      setHasMore(true);
      fetchingMore = false;
      setFilter(f);
      setPage(0);
    });
  }

  function handleOrderChange(o: ConnectionOrder) {
    batch(() => {
      setAllConnections([]);
      setHasMore(true);
      fetchingMore = false;
      setOrder(o);
      setPage(0);
    });
  }

  async function handleAdd() {
    const addr = input().trim();
    if (!addr) return;
    setAddBusy(true);
    setAddError(null);
    try {
      await addConnection(addr);
      const conn = await fetchConnectionByAddress(addr);
      if (conn) setNewConn(conn);
      onDeleted();
      setInput("");
    } catch {
      setAddError(t("directory.add_connection_error"));
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div class="px-4 md:px-6 py-6 space-y-3">

      {/* ── Row 1: shared input + search + connect + sort ── */}
      <div class="flex gap-2">
        <input
          type="text"
          placeholder={t("directory.search_connections")}
          value={input()}
          onInput={(e) => { setInput(e.currentTarget.value); setAddError(null); }}
          onKeyDown={(e) => e.key === "Enter" && applySearch()}
          class="flex-1 px-3 py-2 rounded-lg border border-rim bg-surface text-sm text-txt
                 placeholder:text-muted focus:outline-none hover:border-rim-strong
                 focus:border-rim-strong transition-colors"
        />
        <button
          onClick={applySearch}
          class="px-4 py-2 rounded-lg bg-accent text-accent-fg text-sm font-medium
                 hover:opacity-80 transition-opacity shrink-0"
        >
          {t("directory.search")}
        </button>
        <button
          onClick={handleAdd}
          disabled={addBusy() || !input().trim()}
          class="shrink-0 px-3 py-2 rounded-lg border border-rim bg-surface text-muted text-sm
                 font-medium hover:bg-overlay disabled:opacity-40 transition-colors
                 flex items-center gap-1.5"
        >
          <Show when={addBusy()}>
            <span class="w-3 h-3 border-2 border-muted/40 border-t-muted rounded-full animate-spin" />
          </Show>
          {addBusy() ? t("directory.add_connection_connecting") : "+ " + t("directory.connect")}
        </button>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          class="shrink-0 hidden sm:flex items-center px-3 py-2 rounded-lg border border-rim
                 bg-surface text-muted text-sm font-medium hover:bg-overlay transition-colors"
        >
          {t("directory.import_connections")}
        </button>
        <select
          value={order()}
          onChange={(e) => handleOrderChange(e.currentTarget.value as ConnectionOrder)}
          class="hidden sm:block px-3 py-2 rounded-lg border border-rim bg-surface text-txt text-sm
                 focus:outline-none hover:border-rim-strong transition-colors"
        >
          <For each={ORDER_IDS}>
            {(o) => <option value={o.id}>{t(`directory.${o.key}` as any)}</option>}
          </For>
        </select>
      </div>

      <Show when={addError()}>
        <p class="text-xs text-red-500">{addError()}</p>
      </Show>

      {/* ── Row 2: status filter tabs ── */}
      <div class="flex flex-wrap gap-1.5">
        <For each={FILTER_IDS}>
          {(id) => (
            <button
              onClick={() => handleFilterChange(id)}
              class={`px-3 py-1 rounded-full text-sm transition-colors ${
                filter() === id
                  ? "bg-accent text-accent-fg"
                  : "bg-overlay text-muted hover:bg-surface"
              }`}
            >
              {t(`directory.filter_${id}` as any)}
            </button>
          )}
        </For>
        {/* Sort on mobile */}
        <select
          value={order()}
          onChange={(e) => handleOrderChange(e.currentTarget.value as ConnectionOrder)}
          class="sm:hidden ml-auto px-2 py-1 rounded-full border border-rim bg-surface
                 text-txt text-sm focus:outline-none"
        >
          <For each={ORDER_IDS}>
            {(o) => <option value={o.id}>{t(`directory.${o.key}` as any)}</option>}
          </For>
        </select>
      </div>

      {/* ── Results ── */}
      <Switch>
        <Match when={allConnections().length === 0 && connectionsData.loading}>
          <ConnectionsSkeleton />
        </Match>
        <Match when={allConnections().length === 0}>
          <p class="py-8 text-center text-sm text-muted">{t("directory.no_connections")}</p>
        </Match>
        <Match when={true}>
          <p class="text-sm text-muted">
            {meta()?.total}{" "}
            {meta()?.total !== 1 ? t("directory.connections_plural") : t("directory.connection_singular")}
            {search() ? ` ${t("directory.matching")} "${search()}"` : ""}
          </p>
          <div class="space-y-2">
            <For each={allConnections()}>
              {(conn) => <ConnectionCard conn={conn} onDeleted={onDeleted} />}
            </For>
          </div>
          <Show when={connectionsData.loading}>
            <div class="py-4 flex justify-center">
              <span class="w-5 h-5 border-2 border-muted/30 border-t-accent rounded-full animate-spin" />
            </div>
          </Show>
        </Match>
      </Switch>

      {/* Sentinel for IntersectionObserver — always in DOM */}
      <div ref={sentinelRef} class="h-1" />

      {/* ── Editor modal for newly added connection ── */}
      <Show when={newConn()}>
        <ConnectionEditorModal
          connection={newConn()!}
          authorName={newConn()!.name}
          authorAvatar={newConn()!.photo}
          onSaved={() => { setNewConn(null); onDeleted(); }}
          onClose={() => setNewConn(null)}
          onDeleted={() => { setNewConn(null); onDeleted(); }}
        />
      </Show>

      <ImportConnectionsModal open={importOpen()} onClose={() => setImportOpen(false)} />
    </div>
  );
}

