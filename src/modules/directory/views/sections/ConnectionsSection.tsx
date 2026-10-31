import { For, Show, Switch, Match, createSignal, createMemo, onMount, onCleanup } from "solid-js";
import {
  connections, loading, loadingMore, total,
  loadConnections, loadMoreConnections,
  setFilter, setOrder, setSearch, filter, order, search, perms, setPerms,
} from "../../connections/store";
import type { ConnectionFilter, ConnectionOrder, Connection } from "../../connections/api";
import { deleteConnection, approveConnection, fetchConnectionByAddress, fetchConnectionById } from "../../connections/api";
import { addConnection } from "../../people/api";
import { useSearchParams, useNavigate } from "@solidjs/router";
import ImportConnectionsModal from "../ImportConnectionsModal";
import ConnectionEditorModal from "@/shared/views/ConnectionEditorModal";
import PageActions, { useMobileActions } from "@/shared/views/layout/PageActions";
import { PlatformIcon } from "@/shared/stream/components/PlatformIcons";
import Tooltip from "@/shared/views/Tooltip";
import { openComposer } from "@/shared/views/modal-host";
import { createRoom } from "@/modules/chat/api";
import {
  MdOutlineChat_bubble, MdOutlineDelete, MdOutlineEdit, MdOutlineEmail,
  MdOutlineInfo, MdOutlinePerson_add, MdOutlineUpload_file,
} from "solid-icons/md";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer, useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { isAppInstalled } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import CardShell from "@/shared/stream/CardShell";
import { resetReveal } from "@/shared/stream/reveal";
import { Section, SearchToggle, ROW } from "../Section";
import { Button, IconButton } from "@ui/Button";
import { Input, Select } from "@ui/Field";
import { Spinner } from "@ui/Spinner";
import { Badge } from "@ui/Badge";
import { Avatar } from "@ui/Avatar";
import { Chip } from "@ui/Chip";
import { EmptyState } from "@ui/EmptyState";
import { ListRow } from "@ui/ListRow";
import { Menu, MenuItem, MenuSeparator } from "@ui/Menu";
import { Modal, ModalPanel } from "@ui/Modal";
import { Toggle } from "@ui/Toggle";
import { Skeleton } from "@ui/Skeleton";

// ── Constants ─────────────────────────────────────────────────────────────────

const FILTER_IDS: ConnectionFilter[] = ["active", "pending", "blocked", "ignored", "hidden", "archived", "unreachable", "inactive", "all"];
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
// Chips filter the list (server-side ?perms=) by what contacts have granted
// us — the three keys the traffic-light dot summarises.

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
      <span class={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${color()}`} />
    </Tooltip>
  );
}

// ── Start-a-chat dialog ───────────────────────────────────────────────────────

const EXPIRY: [number, string][] = [[5, "5m"], [60, "1h"], [1440, "24h"], [10080, "1w"]];

function ChatDialog(props: { conn: Connection; onClose: () => void }) {
  const { t } = useI18n();
  const auth = useAuth();
  const navViewer = useNavViewer();
  const navigate = useNavigate();
  const [expire, setExpire] = createSignal(0);
  const [custom, setCustom] = createSignal(false);
  const [customMin, setCustomMin] = createSignal("60");
  const [notify, setNotify] = createSignal(true);
  const [busy, setBusy] = createSignal(false);

  async function start() {
    const nick = auth()?.nick;
    const uid  = auth()?.uid;
    if (!nick || !uid) return;
    setBusy(true);
    try {
      const names = [props.conn.name, navViewer()?.name].filter(Boolean) as string[];
      const name = names.length >= 2
        ? `Chat with ${names[0]} and ${names[1]}`
        : `Chat with ${names[0]}`;
      const room = await createRoom(nick, {
        name,
        expire: expire(),
        visibility: "custom",
        allow_cid: [props.conn.xchan_hash],
      });

      if (notify()) {
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

      props.onClose();
      navigate(`/chat/${nick}/${room.id}`);
    } catch {
      // ignore — chat app may not be installed
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={props.onClose}>
      <ModalPanel
        size="sm"
        title={t("ui.start_chatroom")}
        description={props.conn.name}
        onClose={props.onClose}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={props.onClose}>{t("chat.cancel")}</Button>
            <Button size="sm" onClick={() => void start()} disabled={busy()}>
              <Show when={busy()}><Spinner size="xs" /></Show>
              {t("chat.create")}
            </Button>
          </>
        }
      >
        <div class="p-4 space-y-4">
          <div class="space-y-2">
            <p class="text-xs text-muted">{t("chat.expire_after")}</p>
            <div class="flex flex-wrap items-center gap-1.5">
              <Chip selected={expire() === 0 && !custom()} onClick={() => { setExpire(0); setCustom(false); }}>
                {t("directory.chat_never")}
              </Chip>
              <For each={EXPIRY}>
                {([val, label]) => (
                  <Chip selected={expire() === val && !custom()} onClick={() => { setExpire(val); setCustom(false); }}>
                    {label}
                  </Chip>
                )}
              </For>
              <Chip selected={custom()} onClick={() => { setCustom(true); setExpire(parseInt(customMin()) || 60); }}>
                {t("directory.chat_custom")}
              </Chip>
              <Show when={custom()}>
                <Input
                  size="sm"
                  class="w-20"
                  type="number"
                  min="1"
                  max="10080"
                  aria-label={t("directory.chat_minutes")}
                  placeholder={t("directory.chat_minutes")}
                  value={customMin()}
                  onInput={(e) => {
                    setCustomMin(e.currentTarget.value);
                    setExpire(parseInt(e.currentTarget.value) || 0);
                  }}
                />
              </Show>
            </div>
          </div>
          <Toggle
            label={t("directory.chat_notify", { name: props.conn.name })}
            checked={notify()}
            onChange={setNotify}
          />
        </div>
      </ModalPanel>
    </Modal>
  );
}

// ── ConnectionRow ─────────────────────────────────────────────────────────────

function ConnectionRow(props: { conn: Connection; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const auth = useAuth();
  const installedApps = useInstalledApps();
  const chatroomsInstalled = () => isAppInstalled(installedApps(), "/chat/");
  const [busy, setBusy] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  // Details render on first expand, then stay mounted so collapsing can animate.
  const detailsMounted = createMemo((was: boolean) => was || expanded(), false);
  const [editOpen, setEditOpen] = createSignal(false);
  const [chatOpen, setChatOpen] = createSignal(false);
  const profileHref = () => `/chanview?f=&hash=${encodeURIComponent(props.conn.xchan_hash)}`;

  // Handed to ModalHost so a half-written DM survives navigation. The scope
  // carries the recipient, so DMs to two different people are two composers
  // with two drafts rather than one that overwrites the other.
  const openDm = () =>
    openComposer({
      kind: "dm",
      scope: `dm:new:${props.conn.xchan_hash}`,
      title: t("editor.dm_new_message"),
      props: {
        profileUid: auth()!.uid,
        scopeKey: `dm:new:${props.conn.xchan_hash}`,
        initialRecipients: [{
          type: "c",
          xid: props.conn.xchan_hash,
          id: props.conn.xchan_hash,
          name: props.conn.name,
          nick: props.conn.address,
          link: props.conn.address,
          photo: props.conn.photo,
        }],
      },
    });

  async function handleApprove() {
    setBusy(true);
    await approveConnection(props.conn.id);
    props.onChanged();
  }

  async function handleDelete() {
    if (!confirm(t("directory.confirm_remove", { name: props.conn.name }))) return;
    setBusy(true);
    await deleteConnection(props.conn.id);
    props.onChanged();
  }

  const lastPost = () => props.conn.last_post
    ? t("directory.last_post", {
        date: new Date(props.conn.last_post.replace(" ", "T") + "Z")
          .toLocaleDateString(locale(), { month: "short", year: "numeric" }),
      })
    : "";

  return (
    <div>
      <ListRow
        class={ROW}
        leading={
          <a href={profileHref()}>
            <Avatar src={props.conn.photo} name={props.conn.name} size={10} />
          </a>
        }
        title={
          <span class="flex items-center gap-1.5 flex-wrap">
            <a href={profileHref()} class="min-w-0 font-medium truncate hover:underline">
              {props.conn.name}
            </a>
            <PermissionDot granted={props.conn.granted_perms} />
            <PlatformIcon url={props.conn.url} network={props.conn.network} size={14} />
            <Show when={props.conn.is_forum}>
              <Badge size="sm">{t("directory.forum")}</Badge>
            </Show>
            <Show when={props.conn.pending}>
              <Badge tone="accent" size="sm">{t("directory.pending")}</Badge>
            </Show>
            <Show when={props.conn.unreachable}>
              <Badge tone="warning" size="sm" title={t("directory.unreachable_hint")}>
                {t("directory.unreachable")}
              </Badge>
            </Show>
            <For each={props.conn.status.filter((s) => s !== "pending")}>
              {(s) => <Badge size="sm">{s}</Badge>}
            </For>
          </span>
        }
        subtitle={
          <span class="block truncate">
            {props.conn.address || props.conn.url}
          </span>
        }
        meta={lastPost() || undefined}
        trailing={
          <span class="flex items-center gap-0.5">
            <Show
              when={!props.conn.pending}
              fallback={
                <Button size="sm" onClick={handleApprove} disabled={busy()}>
                  {t("directory.approve")}
                </Button>
              }
            >
              <IconButton label={t("ui.send_dm")} size="sm" onClick={openDm}>
                <MdOutlineEmail size={15} />
              </IconButton>
            </Show>
            <Menu label={t("directory.more_actions")} placement="bottom-end" class="w-52">
              <Show when={!props.conn.pending && chatroomsInstalled()}>
                <MenuItem icon={<MdOutlineChat_bubble size={16} />} onClick={() => setChatOpen(true)}>
                  {t("ui.start_chatroom")}
                </MenuItem>
              </Show>
              <MenuItem icon={<MdOutlineEdit size={16} />} onClick={() => setEditOpen(true)}>
                {t("directory.edit")}
              </MenuItem>
              <MenuItem icon={<MdOutlineInfo size={16} />} onClick={() => setExpanded((e) => !e)}>
                {t("directory.details")}
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<MdOutlineDelete size={16} />} onClick={handleDelete} disabled={busy()}>
                {t("directory.remove")}
              </MenuItem>
            </Menu>
          </span>
        }
      />

      <div
        class="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ "grid-template-rows": expanded() ? "1fr" : "0fr" }}
        aria-hidden={!expanded()}
      >
        <div class="overflow-hidden">
          <Show when={detailsMounted()}>
            <dl class="pl-16 pr-3 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
              <DetailField label={t("directory.field_connected")} value={formatDate(props.conn.connected)} />
              <DetailField label={t("directory.field_closeness")} value={String(props.conn.closeness)} />
              <DetailField label={t("directory.field_role")}      value={props.conn.role} />
              <DetailField label={t("directory.field_network")}   value={props.conn.network} />
              <Show when={props.conn.address}>
                <DetailField label={t("directory.field_address")} value={props.conn.address} />
              </Show>
            </dl>
          </Show>
        </div>
      </div>

      <Show when={chatOpen()}>
        <ChatDialog conn={props.conn} onClose={() => setChatOpen(false)} />
      </Show>

      <Show when={editOpen()}>
        <ConnectionEditorModal
          connection={props.conn}
          authorName={props.conn.name}
          authorAvatar={props.conn.photo}
          onSaved={() => props.onChanged()}
          onClose={() => setEditOpen(false)}
          onDeleted={() => {
            setEditOpen(false);
            props.onChanged();
          }}
        />
      </Show>
    </div>
  );
}

function DetailField(props: { label: string; value: string }) {
  return (
    <div>
      <dt class="text-muted">{props.label}</dt>
      <dd class="text-txt mt-0.5 break-all">{props.value}</dd>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div class="space-y-0.5">
      <For each={Array(8).fill(0)}>
        {() => (
          <div class="flex items-center gap-3 px-3 py-2">
            <Skeleton rounded="full" tone="overlay" class="w-10 h-10 shrink-0" />
            <div class="flex-1 space-y-2">
              <Skeleton tone="overlay" class="h-3.5 w-1/3" />
              <Skeleton tone="overlay" class="h-3 w-1/2" />
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
  const [addBusy, setAddBusy] = createSignal(false);
  const [addError, setAddError] = createSignal<string | null>(null);
  const [newConn, setNewConn] = createSignal<Connection | null>(null);
  const [importOpen, setImportOpen] = createSignal(false);
  const [permsOpen, setPermsOpen] = createSignal(perms().length > 0);
  const [searchParams, setSearchParams] = useSearchParams();

  let sentinelRef!: HTMLDivElement;

  // Runs before the cached list renders (onMount would be too late), so a
  // revisit replays the row entrance.
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

  function applySearch(q: string) {
    setAddError(null);
    setSearch(q);
    loadConnections();
  }

  async function handleAdd(addr: string, clear: () => void) {
    if (!addr) return;
    setAddBusy(true);
    setAddError(null);
    try {
      await addConnection(addr);
      const conn = await fetchConnectionByAddress(addr);
      if (conn) setNewConn(conn);
      loadConnections();
      clear();
    } catch {
      setAddError(t("directory.add_connection_error"));
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <Section
      title={t("directory.connections")}
      tools={
        <>
          <SearchToggle
            applied={search()}
            onSearch={applySearch}
            onInput={() => setAddError(null)}
            placeholder={t("directory.search_connections")}
            extra={(input, clear) => (
              <IconButton
                label={addBusy() ? t("directory.add_connection_connecting") : t("directory.connect")}
                variant="outline"
                onClick={() => handleAdd(input().trim(), clear)}
                disabled={addBusy() || !input().trim()}
              >
                <Show when={!addBusy()} fallback={<Spinner size="xs" />}>
                  <MdOutlinePerson_add size={15} />
                </Show>
              </IconButton>
            )}
          />
          <Show when={!mobileActions()}>
            <IconButton
              label={t("directory.import_connections")}
              variant="outline"
              onClick={() => setImportOpen(true)}
            >
              <MdOutlineUpload_file size={15} />
            </IconButton>
          </Show>
          <PageActions mobileOnly label={t("directory.connections")} actions={[
            { label: t("directory.import_connections"), icon: MdOutlineUpload_file, onClick: () => setImportOpen(true) },
          ]} />
        </>
      }
    >
      <Show when={addError()}>
        <p class="text-xs text-danger-txt">{addError()}</p>
      </Show>

      {/* ── Status + permission filter + sort ── */}
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <Select
            class="w-40"
            aria-label={t("directory.filter_status")}
            value={filter()}
            onChange={(e) => { setFilter(e.currentTarget.value as ConnectionFilter); loadConnections(); }}
          >
            <For each={FILTER_IDS}>
              {(id) => <option value={id}>{t(`directory.filter_${id}` as any)}</option>}
            </For>
          </Select>
          <Chip
            selected={permsOpen() || perms().length > 0}
            count={perms().length}
            aria-expanded={permsOpen()}
            onClick={() => setPermsOpen((v) => !v)}
          >
            {t("directory.filters")}
          </Chip>
          <select
            aria-label={t("directory.sort_by")}
            value={order()}
            onChange={(e) => { setOrder(e.currentTarget.value as ConnectionOrder); loadConnections(); }}
            class="shrink-0 ml-auto bg-transparent text-muted text-sm focus:outline-none hover:text-txt cursor-pointer"
          >
            <For each={ORDER_IDS}>
              {(o) => <option value={o.id}>{t(`directory.${o.key}` as any)}</option>}
            </For>
          </select>
        </div>

        <Show when={permsOpen()}>
          <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("directory.perm_accepts")}>
            <span class="text-xs text-muted mr-0.5">{t("directory.perm_accepts")}</span>
            <For each={[...PERM_ORDER, { key: "none", labelKey: "directory.perm_nothing" }]}>
              {(p) => (
                <Chip size="sm" selected={perms().includes(p.key)} onClick={() => togglePerm(p.key)}>
                  {t(p.labelKey as any)}
                </Chip>
              )}
            </For>
          </div>
        </Show>

        <Show when={connections().length > 0}>
          <p class="text-xs text-muted tabular-nums">
            {total()}{" "}
            {total() !== 1 ? t("directory.connections_plural") : t("directory.connection_singular")}
            {search() ? ` ${t("directory.matching")} "${search()}"` : ""}
          </p>
        </Show>
      </div>

      {/* ── Results ── */}
      <Switch>
        <Match when={connections().length === 0 && loading()}>
          <RowsSkeleton />
        </Match>
        <Match when={connections().length === 0}>
          <EmptyState>{t("directory.no_connections")}</EmptyState>
        </Match>
        <Match when={true}>
          <div class="space-y-0.5 -mx-3">
            <For each={connections()}>
              {(conn) => <CardShell uuid={conn.xchan_hash}><ConnectionRow conn={conn} onChanged={loadConnections} /></CardShell>}
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

      {/* ── Editor modal for a newly added / deep-linked connection ── */}
      <Show when={newConn()}>
        <ConnectionEditorModal
          connection={newConn()!}
          authorName={newConn()!.name}
          authorAvatar={newConn()!.photo}
          onSaved={() => { setNewConn(null); loadConnections(); }}
          onClose={() => setNewConn(null)}
          onDeleted={() => { setNewConn(null); loadConnections(); }}
        />
      </Show>

      <ImportConnectionsModal open={importOpen()} onClose={() => setImportOpen(false)} />
    </Section>
  );
}
