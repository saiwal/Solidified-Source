import { For, Show, Switch, Match, createSignal, createMemo, onMount, onCleanup } from "solid-js";
import {
  connections, loading, loadingMore, total,
  loadConnections, loadMoreConnections,
  setFilter, setOrder, setSearch, filter, order, search, perms, setPerms,
} from "../../connections/store";
import type { ConnectionFilter, ConnectionOrder, Connection } from "../../connections/api";
import { deleteConnection, approveConnection, fetchConnectionByAddress, fetchConnectionById } from "../../connections/api";
import { addConnection } from "../../people/api";
import { useSearchParams } from "@solidjs/router";
import ImportConnectionsModal from "../ImportConnectionsModal";
import ConnectionEditorModal from "@/shared/views/ConnectionEditorModal";
import PageActions, { useMobileActions } from "@/shared/views/layout/PageActions";
import { PlatformIcon } from "@/shared/stream/components/PlatformIcons";
import Tooltip from "@/shared/views/Tooltip";
import { openComposer } from "@/shared/views/modal-host";
import { createRoom } from "@/modules/chat/api";
import { MdOutlineChat_bubble, MdOutlineDelete, MdOutlineEdit, MdOutlineEmail, MdOutlineExpand_more, MdOutlineSearch, MdOutlineUpload_file } from "solid-icons/md";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer, useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { isAppInstalled } from "@utsukta/spa-core/module-registry";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import CardShell from "@/shared/stream/CardShell";
import { resetReveal } from "@/shared/stream/reveal";
import { Button, IconButton } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";
import { Spinner } from "@ui/Spinner";
import { Badge } from "@ui/Badge";
import { Avatar } from "@ui/Avatar";
import { EmptyState } from "@ui/EmptyState";

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

// ── Permission filter ─────────────────────────────────────────────────────────
// Chips in the toolbar filter the list (server-side ?perms=) by what contacts
// have granted us — the three keys the traffic-light dot summarises.

const PERM_ORDER: { key: string; labelKey: string }[] = [
  { key: "post_comments", labelKey: "directory.perm_comments" },
  { key: "send_stream",   labelKey: "directory.perm_stream_items" },
  { key: "post_wall",     labelKey: "directory.perm_wall_posts" },
];

// "none" is exclusive: it means "granted none of the three".
function togglePerm(key: string) {
  const cur = perms().filter((k) => k !== "none");
  setPerms(
    key === "none"
      ? (perms().includes("none") ? [] : ["none"])
      : cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
  );
  loadConnections();
}

function PermChip(props: { key: string; label: string; class?: string }) {
  const active = () => perms().includes(props.key);
  return (
    <Button
      variant="ghost"
      size="sm"
      pressed={active()}
      class={props.class}
      onClick={() => togglePerm(props.key)}
    >
      {props.label}
    </Button>
  );
}

// Classic Hubzilla's "traffic light": green = all 3 granted, yellow = some, red = none.
function PermissionDot(props: { granted: string[] }) {
  const { t } = useI18n();
  const count = () => props.granted.length;
  const color = () =>
    count() === 3 ? "bg-success" : count() > 0 ? "bg-warning" : "bg-danger";
  const tooltip = () => {
    const labels = PERM_ORDER.filter((p) => props.granted.includes(p.key)).map((p) => t(p.labelKey as any));
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
  // Details render on first expand, then stay mounted so collapsing can animate.
  const detailsMounted = createMemo((was: boolean) => was || expanded(), false);
  const [editOpen, setEditOpen] = createSignal(false);
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
    <Card class="group overflow-hidden hover:border-rim-strong transition-colors">
      {/* Phone: actions sit on their own row under the address, so the name gets
          the whole line. sm+: they take a right-hand column. */}
      <div class="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 items-start p-3 sm:p-4">
        <a href={`/chanview?f=&hash=${encodeURIComponent(props.conn.xchan_hash)}`} class="row-span-2 sm:row-span-1">
          <Avatar src={props.conn.photo} name={props.conn.name} size={10} class="ring-1 ring-rim" />
        </a>

        <div class="min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <a
              href={`/chanview?f=&hash=${encodeURIComponent(props.conn.xchan_hash)}`}
              class="min-w-0 font-medium text-sm text-txt truncate hover:underline"
            >
              {props.conn.name}
            </a>
            <PermissionDot granted={props.conn.granted_perms} />
            <PlatformIcon url={props.conn.url} network={props.conn.network} size={14} />
            <Show when={props.conn.is_forum}>
              <Badge tone="accent" size="sm" class="shrink-0 uppercase tracking-wide">
                {t("directory.forum")}
              </Badge>
            </Show>
            <Show when={props.conn.pending}>
              <Badge tone="accent" size="sm" class="shrink-0 uppercase tracking-wide">
                {t("directory.pending")}
              </Badge>
            </Show>
            <For each={props.conn.status.filter((s) => s !== "pending")}>
              {(s) => (
                <Badge tone="accent" size="sm" class="shrink-0 uppercase tracking-wide">
                  {s}
                </Badge>
              )}
            </For>
          </div>
          <p class="text-xs text-muted truncate mt-0.5">
            {props.conn.address || props.conn.url}
          </p>
        </div>

        {/* Quiet until hovered/focused on pointer devices; always shown on touch. */}
        <div class="col-start-2 flex flex-wrap items-center gap-0.5 mt-1 -ml-1.5 sm:ml-0 sm:mt-0 sm:col-start-3 sm:row-start-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <Show when={props.conn.pending}>
            <Button size="sm" onClick={handleApprove} disabled={busy()}>
              {t("directory.approve")}
            </Button>
          </Show>
          <Show when={!props.conn.pending}>
            <IconButton label={t("ui.send_dm")} size="sm" onClick={() =>
                openDm({
                  xid: props.conn.xchan_hash,
                  name: props.conn.name,
                  nick: props.conn.address,
                  photo: props.conn.photo,
                })
              }>
              <MdOutlineEmail size={14} />
            </IconButton>
            <Show when={chatroomsInstalled()}>
              <IconButton
                label={t("ui.start_chatroom")}
                size="sm"
                pressed={chatPanelOpen()}
                onClick={handleChatButtonClick}
                disabled={chatCreating()}
              >
                <Show when={!chatCreating()} fallback={<Spinner size="xs" />}>
                  <MdOutlineChat_bubble size={14} />
                </Show>
              </IconButton>
            </Show>
          </Show>
          <IconButton label={t("directory.edit")} size="sm" onClick={() => setEditOpen(true)}>
            <MdOutlineEdit size={14} />
          </IconButton>
          <IconButton label={t("directory.remove")} size="sm" onClick={handleDelete} disabled={busy()}>
            <MdOutlineDelete class="w-3.5 h-3.5" />
          </IconButton>
          <IconButton label={t("directory.details")} size="sm" onClick={() => setExpanded((e) => !e)}>
            <MdOutlineExpand_more class={`w-3.5 h-3.5 transition-transform ${expanded() ? "rotate-180" : ""}`} />
          </IconButton>
        </div>
      </div>

      <Show when={chatPanelOpen()}>
        <div class="px-3 sm:px-4 pb-3 pt-2 border-t border-rim/50 space-y-2">
          <p class="text-[0.6875rem] text-muted">{t("chat.expire_after")}</p>
          <div class="flex gap-1.5 flex-wrap items-center">
            {([
              [0,     "Never"],
              [5,     "5m"],
              [60,    "1h"],
              [1440,  "24h"],
              [10080, "1w"],
            ] as [number, string][]).map(([val, label]) => (
              <Button
                variant="ghost"
                size="sm"
                pressed={chatExpire() === val && !chatCustomMode()}
                onClick={() => { setChatExpire(val); setChatCustomMode(false); }}
              >
                {label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              pressed={chatCustomMode()}
              onClick={() => { setChatCustomMode(true); setChatExpire(parseInt(chatCustomInput()) || 60); }}
            >
              Custom
            </Button>
            <Show when={chatCustomMode()}>
              <Input size="sm" class="w-16" type="number" min="1" max="10080" value={chatCustomInput()} onInput={(e) => {
                  setChatCustomInput(e.currentTarget.value);
                  setChatExpire(parseInt(e.currentTarget.value) || 0);
                }} placeholder="min" />
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
            <Button size="sm" onClick={() => void handleStartChat()}>
              {t("chat.create")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setChatPanelOpen(false)}>
              {t("chat.cancel")}
            </Button>
          </div>
        </div>
      </Show>

      <div
        class="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ "grid-template-rows": expanded() ? "1fr" : "0fr" }}
        aria-hidden={!expanded()}
      >
        <div class="overflow-hidden">
          <Show when={detailsMounted()}>
          <div class="px-3 sm:px-4 pb-3 pt-0 border-t border-rim/50 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
            <DetailField label={t("directory.field_connected")} value={formatDate(props.conn.connected)} />
            <DetailField label={t("directory.field_closeness")} value={String(props.conn.closeness)} />
            <DetailField label={t("directory.field_role")}      value={props.conn.role} />
            <DetailField label={t("directory.field_network")}   value={props.conn.network} />
            <Show when={props.conn.address}>
              <DetailField label={t("directory.field_address")} value={props.conn.address} />
            </Show>
          </div>
          </Show>
        </div>
      </div>

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
    </Card>
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
          <div class="rounded-xl border border-rim bg-surface p-3 sm:p-4 flex items-center gap-3 animate-pulse">
            <div class="w-10 h-10 rounded-full bg-overlay shrink-0" />
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
  const mobileActions = useMobileActions();
  const { t } = useI18n();
  const [input, setInput] = createSignal("");
  const [addBusy, setAddBusy] = createSignal(false);
  const [addError, setAddError] = createSignal<string | null>(null);
  const [newConn, setNewConn] = createSignal<Connection | null>(null);
  const [importOpen, setImportOpen] = createSignal(false);
  const [searchParams, setSearchParams] = useSearchParams();

  let sentinelRef!: HTMLDivElement;

  // Runs before the cached list renders (onMount would be too late), so a
  // revisit replays the card entrance.
  resetReveal();

  onMount(() => {
    // The list and its offset both live in the store, so a remount renders what
    // is already loaded instead of resetting to page 1.
    if (connections().length === 0) loadConnections();

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

  onMount(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Same reason the feeds suspend endless scroll while arranging widgets
        // (see store/scroll-style.ts): an auto-growing list keeps pushing the
        // footer slot out of reach. This list has no scroll-style setting, so
        // the check is inline.
        if (editingWidgets()) return;
        if (entry.isIntersecting) loadMoreConnections();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinelRef);
    onCleanup(() => observer.disconnect());
  });

  function onDeleted() {
    loadConnections();
  }

  function applySearch() {
    setAddError(null);
    setSearch(input());
    loadConnections();
  }

  function handleFilterChange(f: ConnectionFilter) {
    setFilter(f);
    loadConnections();
  }

  function handleOrderChange(o: ConnectionOrder) {
    setOrder(o);
    loadConnections();
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
    <div class="px-4 md:px-6 py-6 space-y-4">

      {/* ── Search / connect ── */}
      <div class="flex flex-wrap gap-2">
        <label class="relative flex-1 min-w-[12rem]">
          <MdOutlineSearch size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <Input
            class="w-full pl-9 pr-9"
            type="search"
            placeholder={t("directory.search_connections")}
            value={input()}
            onInput={(e) => { setInput(e.currentTarget.value); setAddError(null); }}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
          />
        </label>
        <div class="flex gap-2">
          <Button
            class="shrink-0"
            onClick={handleAdd}
            disabled={addBusy() || !input().trim()}
            title={t("directory.connect")}
          >
            <Show when={addBusy()}>
              <Spinner size="xs" class="text-accent-fg" />
            </Show>
            {addBusy() ? t("directory.add_connection_connecting") : "+ " + t("directory.connect")}
          </Button>
          <Show when={!mobileActions()}>
            <IconButton
              label={t("directory.import_connections")}
              variant="outline"
              class="shrink-0"
              onClick={() => setImportOpen(true)}
            >
              <MdOutlineUpload_file size={18} />
            </IconButton>
          </Show>
          <PageActions mobileOnly label={t("directory.connections")} actions={[
            { label: t("directory.import_connections"), icon: MdOutlineUpload_file, onClick: () => setImportOpen(true) },
          ]} />
        </div>
      </div>

      <Show when={addError()}>
        <p class="text-xs text-danger-txt">{addError()}</p>
      </Show>

      {/* ── Status tabs + sort ── */}
      <div class="flex items-end gap-3 border-b border-rim">
        <div class="flex-1 min-w-0 flex gap-4 overflow-x-auto [scrollbar-width:none]">
          <For each={FILTER_IDS}>
            {(id) => (
              <Button
                variant="ghost"
                size="sm"
                pressed={filter() === id}
                class="shrink-0 -mb-px"
                onClick={() => handleFilterChange(id)}
              >
                {t(`directory.filter_${id}` as any)}
              </Button>
            )}
          </For>
        </div>
        <select
          value={order()}
          onChange={(e) => handleOrderChange(e.currentTarget.value as ConnectionOrder)}
          class="shrink-0 mb-1.5 bg-transparent text-muted text-sm focus:outline-none hover:text-txt cursor-pointer"
        >
          <For each={ORDER_IDS}>
            {(o) => <option value={o.id}>{t(`directory.${o.key}` as any)}</option>}
          </For>
        </select>
      </div>

      {/* ── Accepts filter + count ── */}
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-xs text-muted mr-0.5">{t("directory.perm_accepts")}</span>
        <For each={PERM_ORDER}>
          {(p) => <PermChip key={p.key} label={t(p.labelKey as any)} />}
        </For>
        <PermChip key="none" label={t("directory.perm_nothing")} />
        <Show when={connections().length > 0}>
          <span class="ml-auto text-xs text-muted">
            {total()}{" "}
            {total() !== 1 ? t("directory.connections_plural") : t("directory.connection_singular")}
            {search() ? ` ${t("directory.matching")} "${search()}"` : ""}
          </span>
        </Show>
      </div>

      {/* ── Results ── */}
      <Switch>
        <Match when={connections().length === 0 && loading()}>
          <ConnectionsSkeleton />
        </Match>
        <Match when={connections().length === 0}>
          <EmptyState>{t("directory.no_connections")}</EmptyState>
        </Match>
        <Match when={true}>
          <div class="space-y-2">
            <For each={connections()}>
              {(conn) => <CardShell uuid={conn.xchan_hash}><ConnectionCard conn={conn} onDeleted={onDeleted} /></CardShell>}
            </For>
          </div>
          <Show when={loadingMore()}>
            <div class="py-4 flex justify-center">
              <Spinner size="lg" tone="accent" label={t("ui.loading")} />
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

