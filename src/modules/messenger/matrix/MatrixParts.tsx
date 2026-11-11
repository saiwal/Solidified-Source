// Messenger's Matrix tab: the list column (login, room list, recovery) and the
// conversation pane. MessengerView lazy-loads this file, so matrix-js-sdk and
// its crypto wasm load only when the tab is opened.
// Urls, under /messenger/:nick/matrix:
//   (none)        list only
//   /<roomId>     a room
//   /dm/<mxid>    open the DM with them, or /new prefilled if there is none (chat buttons link here)
//   /new          start a DM
//   /login        SSO return leg (?loginToken=)
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onMount } from "solid-js";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useQuery } from "@utsukta/spa-core/lib/query";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { normalizeChat } from "@utsukta/spa-core/lib/chat-links";
import { toast } from "@utsukta/spa-core/store/toast";
import { Avatar } from "@ui/Avatar";
import { CountBadge } from "@ui/Badge";
import { Banner } from "@ui/Banner";
import { Button, IconButton } from "@ui/Button";
import { EmptyState } from "@ui/EmptyState";
import { Field, Input } from "@ui/Field";
import { Menu, MenuItem } from "@ui/Menu";
import { Modal, ModalPanel } from "@ui/Modal";
import { Spinner } from "@ui/Spinner";
import { MdOutlineAdd, MdOutlineDevices, MdOutlineHome, MdOutlineKey, MdOutlineLogout } from "solid-icons/md";
import { Chip } from "@ui/Chip";
import { MxcAvatar } from "./MatrixMedia";
import {
  client, directRoomIds, discover, findDirect, finishSso, loginFlows, loginWithPassword, logout, needsRecovery,
  openDirect, recover, resume, sdk, serverOf, startSelfVerification, startSso, tick, verification,
} from "./client";
import Verification from "./Verification";
import { hasMatrixSession } from "../matrix-session";
import Timeline from "./Timeline";
import ComposerModal from "@/shared/editor/components/ComposerModal";

const [booting, setBooting] = createSignal(true);
function boot() {
  void resume()
    .catch((e) => toast.error((e as Error).message))
    .finally(() => setBooting(false));
}

const SPACE_KEY = "hz-matrix-space";
const readSpace = () => { try { return localStorage.getItem(SPACE_KEY); } catch { return null; } };
type Filter = "all" | "unreads" | "people" | "rooms";
const FILTERS: Filter[] = ["all", "unreads", "people", "rooms"];

/** Every room under a space, through subspaces (m.space.child with a `via`). */
function spaceDescendants(c: sdk.MatrixClient, spaceId: string): Set<string> {
  const out = new Set<string>();
  const stack = [spaceId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const state = c.getRoom(id)?.getLiveTimeline().getState(sdk.EventTimeline.FORWARDS);
    for (const ev of state?.getStateEvents("m.space.child") ?? []) {
      const child = ev.getStateKey();
      if (!child || !Array.isArray(ev.getContent()?.via)) continue; // no via = removed
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}

const section = (text: string) => (
  <p class="px-3 pt-2 pb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-muted">{text}</p>
);

// ── List column ───────────────────────────────────────────────────────────────

export function MatrixList(props: { base: string; query: string; activeRoom?: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  onMount(boot);

  // Space rail: null = Home (everything). Remembered per browser.
  const [space, setSpaceRaw] = createSignal<string | null>(readSpace());
  const setSpace = (id: string | null) => {
    setSpaceRaw(id);
    try { id ? localStorage.setItem(SPACE_KEY, id) : localStorage.removeItem(SPACE_KEY); } catch { /* per-tab only */ }
  };
  const [filter, setFilter] = createSignal<Filter>("all");

  const spaces = createMemo(() => {
    tick();
    return (client()?.getRooms() ?? [])
      .filter((r) => r.isSpaceRoom() && r.getMyMembership() === sdk.KnownMembership.Join)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  const currentSpace = () => spaces().find((r) => r.roomId === space()) ?? null;

  const rooms = createMemo(() => {
    tick();
    const c = client();
    if (!c) return { invites: [] as sdk.Room[], list: [] as sdk.Room[] };
    const direct = directRoomIds(c);
    const inSpace = currentSpace() ? spaceDescendants(c, currentSpace()!.roomId) : null;
    const q = props.query.toLowerCase();
    const all = c.getRooms()
      .filter((r) => {
        const m = r.getMyMembership();
        return (m === sdk.KnownMembership.Join || m === sdk.KnownMembership.Invite)
          && r.name.toLowerCase().includes(q)
          && (!inSpace || inSpace.has(r.roomId));
      })
      .sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp());
    const f = filter();
    return {
      invites: all.filter((r) => r.getMyMembership() === sdk.KnownMembership.Invite),
      list: all.filter((r) =>
        r.getMyMembership() === sdk.KnownMembership.Join && !r.isSpaceRoom()
        && (f === "all" || (f === "unreads" ? unread(r) > 0 : f === "people" ? direct.has(r.roomId) : !direct.has(r.roomId)))),
    };
  });
  const nothing = () => !rooms().invites.length && !rooms().list.length;

  const syncedOnce = createMemo((was: boolean) => { tick(); return was || !!client()?.isInitialSyncComplete(); }, false);
  const [unverified, setUnverified] = createSignal(false);
  // Re-checked whenever a verification dialog closes.
  createEffect(() => { if (client() && syncedOnce() && !verification()) void needsRecovery().then(setUnverified); });
  const verify = () => void startSelfVerification().catch((e) => toast.error((e as Error).message));
  const [recovering, setRecovering] = createSignal(false);

  const unread = (r: sdk.Room) => { tick(); return r.getUnreadNotificationCount(sdk.NotificationCountType.Total); };
  const row = (r: sdk.Room) => (
    <A
      href={`${props.base}/${encodeURIComponent(r.roomId)}`}
      class="flex items-center gap-3 mx-2 px-2 py-2 rounded-lg transition-colors"
      classList={{ "bg-elevated": props.activeRoom === r.roomId, "hover:bg-elevated/60": props.activeRoom !== r.roomId }}
    >
      <MxcAvatar mxc={r.getMxcAvatarUrl() ?? r.getAvatarFallbackMember()?.getMxcAvatarUrl()} name={r.name} size={9} />
      <span class="flex-1 min-w-0 text-sm text-txt truncate" classList={{ "font-semibold": unread(r) > 0 }}>{r.name}</span>
      <CountBadge n={unread(r)} />
    </A>
  );
  const railBtn = (active: boolean) =>
    `w-10 h-10 shrink-0 flex items-center justify-center rounded-xl transition-shadow ${
      active ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : "hover:ring-2 hover:ring-rim"}`;

  return (
    <Switch>
      <Match when={booting() && hasMatrixSession()}>
        <div class="flex-1 flex flex-col items-center justify-center gap-2 text-muted text-sm">
          <Spinner />{t("matrix.connecting")}
        </div>
      </Match>
      <Match when={!client()}>
        <Login base={props.base} />
      </Match>
      <Match when={client()}>
        <div class="flex flex-1 min-h-0 border-t border-rim">
          {/* Space rail, as in Element: Home, then each joined space. */}
          <Show when={spaces().length}>
            <nav class="w-16 shrink-0 flex flex-col items-center gap-3 py-3 border-r border-rim overflow-y-auto" aria-label={t("matrix.spaces") as string}>
              <button type="button" class={`${railBtn(!currentSpace())} bg-elevated text-txt`} title={t("matrix.home") as string}
                aria-label={t("matrix.home") as string} aria-pressed={!currentSpace()} onClick={() => setSpace(null)}>
                <MdOutlineHome size={22} />
              </button>
              <For each={spaces()}>
                {(sp) => (
                  <button type="button" class={railBtn(currentSpace()?.roomId === sp.roomId)} title={sp.name}
                    aria-label={sp.name} aria-pressed={currentSpace()?.roomId === sp.roomId} onClick={() => setSpace(sp.roomId)}>
                    <MxcAvatar mxc={sp.getMxcAvatarUrl()} name={sp.name} size={10} class="rounded-xl" />
                  </button>
                )}
              </For>
            </nav>
          </Show>

          <div class="flex-1 min-w-0 flex flex-col min-h-0">
            <div class="flex items-center gap-2 px-3 pt-3 shrink-0">
              <div class="flex-1 min-w-0">
                <h2 class="text-base font-semibold text-txt truncate">{currentSpace()?.name ?? t("matrix.home")}</h2>
                <p class="text-[0.6875rem] text-muted truncate">{client()!.getUserId()}</p>
              </div>
              <IconButton label={t("matrix.new_dm") as string} size="sm" onClick={() => navigate(`${props.base}/new`)}>
                <MdOutlineAdd size={18} />
              </IconButton>
              <Menu label={t("matrix.title") as string} class="w-60">
                <MenuItem icon={<MdOutlineDevices size={16} />} onClick={verify}>{t("matrix.verify_start")}</MenuItem>
                <MenuItem icon={<MdOutlineKey size={16} />} onClick={() => setRecovering(true)}>{t("matrix.recovery_title")}</MenuItem>
                <MenuItem danger icon={<MdOutlineLogout size={16} />} onClick={() => void logout().then(() => navigate(props.base))}>
                  {t("matrix.sign_out")}
                </MenuItem>
              </Menu>
            </div>
            <div class="flex flex-wrap gap-1.5 px-3 py-2 shrink-0" role="group" aria-label={t("matrix.filters") as string}>
              <For each={FILTERS}>
                {(f) => (
                  <Chip size="sm" selected={filter() === f} onClick={() => setFilter(filter() === f && f !== "all" ? "all" : f)}>
                    {t(`matrix.filter_${f}`)}
                  </Chip>
                )}
              </For>
            </div>
            <Show when={unverified()}>
              <Banner tone="warning" class="mx-3 mb-2">
                <p class="text-xs">{t("matrix.verify_banner")}</p>
                <div class="flex flex-wrap gap-x-3">
                  <button type="button" class="text-xs font-medium underline" onClick={verify}>
                    {t("matrix.verify_start")}
                  </button>
                  <button type="button" class="text-xs font-medium underline" onClick={() => setRecovering(true)}>
                    {t("matrix.recovery_title")}
                  </button>
                </div>
              </Banner>
            </Show>
            <div class="flex-1 overflow-y-auto min-h-0 pb-2">
              <Show when={!syncedOnce()}>
                <div class="flex justify-center py-6"><Spinner /></div>
              </Show>
              <Show when={rooms().invites.length}>
                {section(t("matrix.invites") as string)}
                <For each={rooms().invites}>{row}</For>
                <Show when={rooms().list.length}><div class="h-2" /></Show>
              </Show>
              <For each={rooms().list}>{row}</For>
              <Show when={syncedOnce() && nothing()}>
                <EmptyState class="px-4">{t("matrix.empty")}</EmptyState>
              </Show>
            </div>
          </div>
        </div>
        <Show when={verification()} keyed>
          {(req) => <Verification request={req} />}
        </Show>
        <Show when={recovering()}>
          <RecoveryModal onClose={() => { setRecovering(false); void needsRecovery().then(setUnverified); }} />
        </Show>
      </Match>
    </Switch>
  );
}

function Login(props: { base: string }) {
  const { t } = useI18n();
  const [mxid, setMxid] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [ssoOnly, setSsoOnly] = createSignal<string | null>(null); // base url when the server has no password login
  const valid = () => !!normalizeChat("matrix", mxid());

  async function submit(e: Event) {
    e.preventDefault();
    const id = normalizeChat("matrix", mxid())?.value;
    if (!id) return;
    setBusy(true);
    try {
      const baseUrl = await discover(serverOf(id));
      const flows = await loginFlows(baseUrl);
      if (!flows.password && flows.sso) return void setSsoOnly(baseUrl);
      await loginWithPassword(baseUrl, id, password());
    } catch (err) {
      toast.error(t("matrix.login_failed", { error: (err as Error).message }) as string);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="flex-1 overflow-y-auto p-4 flex flex-col gap-4" onSubmit={submit}>
      <div>
        <h2 class="text-base font-semibold text-txt">{t("matrix.login_title")}</h2>
        <p class="text-xs text-muted mt-1">{t("matrix.login_hint")}</p>
      </div>
      <Field label={t("matrix.mxid")}>
        <Input value={mxid()} onInput={(e) => setMxid(e.currentTarget.value)} placeholder="@name:matrix.org" autocomplete="username" />
      </Field>
      <Show when={!ssoOnly()}>
        <Field label={t("matrix.password")}>
          <Input type="password" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} autocomplete="current-password" />
        </Field>
        <Button type="submit" disabled={busy() || !valid()}>
          {busy() ? <Spinner size="sm" /> : t("matrix.sign_in")}
        </Button>
      </Show>
      <Show when={ssoOnly()}>
        <p class="text-xs text-muted">{t("matrix.sso_only")}</p>
        <Button type="button" onClick={() => startSso(ssoOnly()!, `${location.origin}${props.base}/login`)}>
          {t("matrix.sign_in_sso")}
        </Button>
      </Show>
    </form>
  );
}

function RecoveryModal(props: { onClose: () => void }) {
  const { t } = useI18n();
  const [secret, setSecret] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      const n = await recover(secret());
      toast.success(t("matrix.recovery_done", { n: String(n) }) as string);
      props.onClose();
    } catch (err) {
      toast.error(t("matrix.recovery_failed", { error: (err as Error).message }) as string);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal onClose={props.onClose} dismissOnBackdrop={false}>
      <ModalPanel size="md" title={t("matrix.recovery_title")} description={t("matrix.recovery_hint")} onClose={props.onClose}>
        <form class="p-4 flex flex-col gap-4" onSubmit={submit}>
          <Field label={t("matrix.recovery_key")}>
            <Input type="password" value={secret()} onInput={(e) => setSecret(e.currentTarget.value)} autocomplete="off" />
          </Field>
          <div class="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={props.onClose}>{t("matrix.cancel")}</Button>
            <Button type="submit" disabled={busy() || !secret().trim()}>
              {busy() ? <Spinner size="sm" /> : t("matrix.recovery_submit")}
            </Button>
          </div>
        </form>
      </ModalPanel>
    </Modal>
  );
}

// ── Conversation pane ─────────────────────────────────────────────────────────

/** `segs` are the url parts after /matrix. */
export function MatrixPane(props: { base: string; segs: string[] }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  onMount(boot);
  const ready = () => !booting() && !!client();

  // SSO return leg.
  onMount(() => {
    if (props.segs[0] !== "login") return;
    const token = params.loginToken;
    if (typeof token !== "string") return navigate(props.base, { replace: true });
    void finishSso(token)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => navigate(props.base, { replace: true }));
  });

  // /dm/<mxid>: show the existing DM. A url must never create a room and
  // invite someone by itself (any link in a post could), so a new one goes to
  // the prefilled /new form, where the user presses Start.
  createEffect(() => {
    if (props.segs[0] !== "dm" || !ready()) return;
    const mxid = normalizeChat("matrix", props.segs[1] ?? "")?.value;
    if (!mxid) return navigate(props.base, { replace: true });
    const existing = findDirect(mxid);
    navigate(existing ? `${props.base}/${encodeURIComponent(existing)}` : `${props.base}/new?mxid=${encodeURIComponent(mxid)}`, { replace: true });
  });
  // Not signed in: the list column shows the login form.
  createEffect(() => { if (!booting() && !client() && props.segs[0] !== "login") navigate(props.base, { replace: true }); });

  return (
    <Switch fallback={<div class="flex-1 flex items-center justify-center"><Spinner /></div>}>
      <Match when={ready() && props.segs[0] === "new"}>
        <NewDm base={props.base} />
      </Match>
      <Match when={ready() && props.segs[0] && !["dm", "login", "new"].includes(props.segs[0]) && props.segs[0]} keyed>
        {(roomId) => <Timeline roomId={roomId} back={props.base} />}
      </Match>
    </Switch>
  );
}

function NewDm(props: { base: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mxid, setMxid] = createSignal(typeof params.mxid === "string" ? params.mxid : "");
  const [busy, setBusy] = createSignal(false);
  const suggestions = useQuery(() => ({
    queryKey: ["chatids", "matrix-connections"],
    queryFn: async () => {
      const r = await apiFetch("/spa/chatids?type=matrix");
      return r.ok ? ((await r.json()).data as { xchan: string; value: string; name: string; photo: string }[]) : [];
    },
    staleTime: 10 * 60_000,
  }));
  const filtered = () => {
    const q = mxid().toLowerCase();
    return (suggestions.data ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || s.value.toLowerCase().includes(q));
  };

  async function start(id: string) {
    setBusy(true);
    try {
      const roomId = await openDirect(id);
      navigate(`${props.base}/${encodeURIComponent(roomId)}`, { replace: true });
    } catch (e) {
      toast.error(t("matrix.open_failed", { error: (e as Error).message }) as string);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      <h2 class="text-base font-semibold text-txt">{t("matrix.new_dm")}</h2>
      <form
        class="flex flex-wrap items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); const id = normalizeChat("matrix", mxid())?.value; if (id) void start(id); }}
      >
        <Field label={t("matrix.mxid")} class="flex-1 min-w-48">
          <Input value={mxid()} onInput={(e) => setMxid(e.currentTarget.value)} placeholder={t("matrix.new_dm_placeholder") as string} />
        </Field>
        <Button type="submit" disabled={busy() || !normalizeChat("matrix", mxid())}>
          {busy() ? <Spinner size="sm" /> : t("matrix.start")}
        </Button>
      </form>
      <Show when={filtered().length}>
        <div>
          {section(t("matrix.from_connections") as string)}
          <For each={filtered()}>
            {(s) => (
              <button
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-elevated text-left disabled:opacity-50"
                disabled={busy()}
                onClick={() => void start(s.value)}
              >
                <Avatar src={s.photo} name={s.name} size={8} />
                <span class="flex-1 min-w-0">
                  <span class="block text-sm text-txt truncate">{s.name}</span>
                  <span class="block text-xs text-muted truncate">{s.value}</span>
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

// ── Docked window ─────────────────────────────────────────────────────────────

/** A room in a ModalHost window (kind "matrix", opened via openMatrix): docked,
 *  modal, page or minimized, and it stays open across navigation. */
export function MatrixWindow(props: { roomId: string; onClose: () => void }) {
  onMount(boot);
  const name = () => { tick(); return client()?.getRoom(props.roomId)?.name ?? ""; };
  // Signed out (or the app switched off) elsewhere: nothing left to show.
  createEffect(() => { if (!booting() && !client()) props.onClose(); });
  return (
    <ComposerModal title={name()} onClose={props.onClose} widthClass="max-w-3xl">
      <Show when={client()} fallback={<div class="flex-1 flex items-center justify-center"><Spinner /></div>}>
        <Timeline roomId={props.roomId} />
      </Show>
    </ComposerModal>
  );
}
