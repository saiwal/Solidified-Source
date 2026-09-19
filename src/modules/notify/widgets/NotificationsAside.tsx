import {
  createSignal,
  createEffect,
  untrack,
  For,
  Show,
  createMemo,
  onCleanup,
  lazy,
} from "solid-js";
import { createStore, reconcile, unwrap, produce } from "solid-js/store";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  useAuth,
  updateInterval,
  notifyCountLimit,
} from "@utsukta/spa-core/store/auth-store";
import { useIsAdmin } from "@utsukta/spa-core/store/site-config";
import {
  MdFillNotifications,
  MdFillClose,
  MdFillRefresh,
  MdFillDone_all,
  MdFillForum,
  MdFillPublic,
  MdFillMail,
  MdFillHome,
  MdFillPeople,
  MdFillInsert_drive_file,
  MdFillEvent,
  MdFillApp_registration,
  MdFillWifi,
  MdFillWifi_off,
  MdFillOpen_in_new,
  MdFillCircle,
  MdOutlineCampaign,
  MdOutlineAnnouncement,
} from "solid-icons/md";
import DOMPurify from "dompurify";
import {
  DISPLAY_ORDER,
  displayKeys,
  supportsMarkRead,
  isFetchable,
  stampRows,
  prependDeduped,
  appendDeduped,
  applyFilters,
  formatCount,
  normalise,
  type HzNotification,
  type StreamBucket,
  type SseResponse,
} from "../rows";
import { fetchConnections } from "@/modules/directory/connections/api";
import { setNotifCount } from "@utsukta/spa-core/lib/notificationCount";
import { markNotifySeen, markItemSeen, markAllSeen } from "@utsukta/spa-core/lib/markSeen";
import { showDesktopNotification } from "@utsukta/spa-core/lib/desktopNotify";
import { apiFetch, apiError } from "@utsukta/spa-core/lib/fetch";

import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { resolveNotifyPath, connectionRequestId } from "@utsukta/spa-core/lib/notifyLink";
import { openConnectionRequestModal } from "@utsukta/spa-core/store/connection-request-modal";
import { relativeTime } from "@utsukta/spa-core/lib/relativeTime";
import { relativeTick } from "@utsukta/spa-core/lib/date";
import {
  fetchManageApi,
  switchChannel,
  type ManagedChannel,
} from "@/modules/manage/api";
const PostDetailModal = lazy(() => import("@/shared/views/PostDetailModal"));

// ── Constants ─────────────────────────────────────────────────────────────────

const PROBE_MS = 5_000;
const RETRY_DELAY_MS = 15_000;
type BucketMeta = { labelKey?: string; Icon: any; href?: string };
const KNOWN_META: Record<string, BucketMeta> = {
  network: { labelKey: "notify.bucket_network", Icon: MdFillWifi, href: "/network" },
  dm: { labelKey: "notify.bucket_dm", Icon: MdFillMail, href: "/hq" },
  home: { labelKey: "notify.bucket_home", Icon: MdFillHome, href: "/channel" },
  notify: { labelKey: "notify.bucket_notify", Icon: MdFillNotifications, href: "/notify" },
  intros: { labelKey: "notify.bucket_intros", Icon: MdFillPeople, href: "/directory/connections" },
  pubs: { labelKey: "notify.bucket_pubs", Icon: MdFillPublic },
  files: { labelKey: "notify.bucket_files", Icon: MdFillInsert_drive_file },
  all_events: { labelKey: "notify.bucket_all_events", Icon: MdFillEvent, href: "/cdav/calendar" },
  register: { labelKey: "notify.bucket_register", Icon: MdFillApp_registration },
};

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchCounts(): Promise<SseResponse> {
  const res = await fetch("/sse_bs", { credentials: "same-origin" });
  if (!res.ok) throw new Error("sse_bs fetch failed");
  return res.json();
}

// One page of one bucket. Core serves /sse_bs/<key>/<offset> as an early return
// carrying only that bucket, and reports the next offset — or -1 when the
// bucket is exhausted. Offset 0 is load-bearing: it is the request that rebases
// $_SESSION['sse_loadtime'], so pages can't shift under a scroll.
async function fetchBucketPage(
  key: string,
  offset = 0,
  nquery = "",
): Promise<{ rows: HzNotification[]; offset: number }> {
  const path = offset > 0 ? `/sse_bs/${key}/${offset}` : `/sse_bs/${key}`;
  const qs = nquery ? `?nquery=${encodeURIComponent(nquery)}` : "";
  const res = await fetch(path + qs, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`sse_bs/${key} failed`);
  const data: SseResponse = await res.json();
  const bucket = data[key] as StreamBucket | undefined;
  return {
    rows: stampRows(bucket?.notifications ?? []),
    offset: bucket?.offset ?? -1,
  };
}

// Forum sections are keyed forum_<abook_id> and the /sse_bs payload carries no
// label, so names come from the connections API — one request, cached, and only
// when the payload actually contains forum buckets.
async function fetchForumNames(): Promise<Record<string, string>> {
  const { connections } = await fetchConnections({
    type: "forum",
    filter: "active",
    limit: 200,
  });
  return Object.fromEntries(connections.map((c) => [`forum_${c.id}`, c.name]));
}
async function markSeenAndRefetch(
  b64mids: string[],
  afterRefetch: (raw: SseResponse) => void,
) {
  if (!b64mids.length) return;
  await fetch("/sse_bs", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ sse_rmids: b64mids.join(","), nquery: "" }),
  });
  try {
    const fresh = await fetchCounts();
    afterRefetch(fresh);
  } catch {
    /* silent */
  }
}

interface HqNoticeEntry {
  b64mid: string;
  created: string;
  summary: string;
  author_name: string;
  author_img: string;
  href: string;
}

async function fetchNotices(): Promise<HqNoticeEntry[]> {
  const res = await fetch("/hq", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      offset: "0",
      type: "notification",
      file: "",
    }).toString(),
  });
  if (!res.ok) throw await apiError(res);
  const data: { offset: number; entries: HqNoticeEntry[] } = await res.json();
  return data.entries;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  created: string;
}

async function fetchAnnouncements(): Promise<Announcement[]> {
  const res = await apiFetch("/spa/announcements");
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? []) as Announcement[];
}

const ANNOUNCEMENTS_SEEN_KEY = "hz-announcements-seen";

function getLastSeenAnnouncementId(): string | null {
  try {
    return localStorage.getItem(ANNOUNCEMENTS_SEEN_KEY);
  } catch {
    return null;
  }
}

function setLastSeenAnnouncementId(id: string): void {
  try {
    localStorage.setItem(ANNOUNCEMENTS_SEEN_KEY, id);
  } catch {
    /* ignore */
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDisplayUuid(n: HzNotification): string | null {
  if (n.b64mid) return n.b64mid;
  const href = n.notify_link;
  if (!href) return null;
  try {
    const path = href.startsWith("http") ? new URL(href).pathname : href;
    const m = path.match(/\/display\/([^/?#]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function stripHtml(html?: string): string {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = DOMPurify.sanitize(html);
  return div.textContent?.trim() ?? "";
}

function decodeHtmlEntities(str: string): string {
  const ta = document.createElement("textarea");
  ta.innerHTML = str;
  return ta.value;
}


// ── NotifRow ──────────────────────────────────────────────────────────────────

function NotifRow(props: {
  n: HzNotification;
  onDismiss: (b64mid: string) => void;
  onNotifySeen: (nid: number) => void;
  onOpenModal: (uuid: string) => void;
}) {
  const { t } = useI18n();
  const [hidden, setHidden] = createSignal(false);
  const uuid = () => getDisplayUuid(props.n);
  const navigate = useNavigate();

  const when = () => {
    relativeTick();
    return relativeTime(props.n.when, t);
  };

  const dismiss = () => {
    if (props.n.b64mid || props.n.notify_id) setHidden(true);
    if (props.n.b64mid) props.onDismiss(props.n.b64mid);
    if (props.n.notify_id) props.onNotifySeen(props.n.notify_id);
  };

  const handleClick = (e: MouseEvent) => {
    const u = uuid();
    const connId = connectionRequestId(props.n.notify_link);
    if (u) {
      e.preventDefault();
      props.onOpenModal(u);
    } else if (connId) {
      // Open the accept/reject modal in place — no navigation, works from
      // whatever page the user is currently on.
      e.preventDefault();
      openConnectionRequestModal(connId);
    } else {
      // Route internal SPA paths through the router — a raw <a href> here would
      // hit the server directly, which 404s on classic Hubzilla paths the SPA
      // doesn't route.
      const target = resolveNotifyPath(props.n.notify_link);
      if (target.startsWith("/")) {
        e.preventDefault();
        navigate(target);
      }
    }
    dismiss();
  };

  const handleDismiss = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dismiss();
  };

  return (
    <Show when={!hidden()}>
    <div class="flex items-start gap-1 group">
      <a
        href={resolveNotifyPath(props.n.notify_link)}
        onClick={handleClick}
        class="flex gap-2 items-start px-2 py-1.5 rounded-lg transition-colors
               hover:bg-elevated flex-1 min-w-0"
      >
        <Show when={props.n.photo}>
          <img
            src={props.n.photo}
            alt={props.n.name ?? ""}
            class="w-7 h-7 rounded-full shrink-0 mt-0.5 object-cover"
          />
        </Show>
        <div class="min-w-0 flex-1">
          <p class="text-xs text-txt leading-snug">
            <Show when={props.n.name}>
              <span class="font-semibold">{props.n.name} </span>
            </Show>
            <span innerHTML={DOMPurify.sanitize(props.n.message ?? "")} />
          </p>
          <div class="flex items-center gap-1.5 mt-0.5">
            <Show when={props.n.when}>
              <p class="text-[0.625rem] text-muted">{when()}</p>
            </Show>
          </div>
        </div>
      </a>

      <Show when={props.n.b64mid}>
        <button
          onClick={handleDismiss}
          title={t("notify.mark_read")}
          class="shrink-0 mt-1.5 p-0.5 rounded text-subtle
                 hover:text-muted hover:bg-elevated transition-colors
                 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
        >
          <MdFillClose class="w-3.5 h-3.5" />
        </button>
      </Show>
    </div>
    </Show>
  );
}

// ── StreamSection ─────────────────────────────────────────────────────────────

function StreamSection(props: {
  id: string;
  bucket: StreamBucket;
  label: string;
  href?: string;
  countLimit: number;
  open: boolean;
  onToggle: () => void;
  onDismiss: (b64mid: string) => void;
  onNotifySeen: (nid: number) => void;
  onClearAll: (key: string) => void;
  onOpenModal: (uuid: string) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const open = () => props.open;
  const meta = KNOWN_META[props.id] ?? { Icon: MdFillForum };
  const fetchable = () => isFetchable(props.id);

  // Rows core serves per-bucket. Buckets it sends inline (notify, intros,
  // files, all_events, register) keep using props.bucket and never page —
  // core reports offset -1 for every one of them.
  const [rows, setRows] = createSignal<HzNotification[]>([]);
  const [nextOffset, setNextOffset] = createSignal(0);
  const [loading, setLoading] = createSignal(false);
  const [nquery, setNquery] = createSignal("");
  const [startersOnly, setStartersOnly] = createSignal(false);
  const [filterText, setFilterText] = createSignal("");

  let loadToken = 0;

  // Core's auto-followup: a filter can leave a page nearly empty, so it keeps
  // pulling until enough rows survive. Bounded — a filter matching nothing
  // would otherwise walk the entire bucket one page at a time.
  const MIN_VISIBLE = 15;
  const MAX_FOLLOWUPS = 3;

  const visibleCount = (list: HzNotification[]) =>
    applyFilters(list, filterText(), startersOnly()).length;

  // "reset" reloads from offset 0 and drops what we hold; "refresh" pulls
  // offset 0 and merges it in front, which is what a rising count wants —
  // resetting would throw away every page the user scrolled to and send them
  // back to the top, the exact jump this rework exists to stop.
  type LoadMode = "reset" | "refresh" | "more";

  const load = async (mode: LoadMode) => {
    if (!fetchable()) return;
    const offset = mode === "more" ? nextOffset() : 0;
    // -1 is core's exhausted sentinel; 0 on a followup means we already have
    // everything there is.
    if (mode === "more" && offset <= 0) return;
    const token = ++loadToken;
    setLoading(true);
    try {
      let acc: HzNotification[] = mode === "reset" ? [] : rows();
      let off = offset;
      for (let i = 0; i <= MAX_FOLLOWUPS; i++) {
        const page = await fetchBucketPage(props.id, off, nquery());
        // A newer load (filter change, reopen) started while this was in
        // flight — drop the result rather than clobbering it.
        if (token !== loadToken) return;
        acc =
          mode === "refresh" && i === 0
            ? appendDeduped(page.rows, acc)
            : appendDeduped(acc, page.rows);
        off = page.offset;
        setRows(acc);
        // A refresh only re-reads the head; the paging cursor belongs to the
        // tail we already walked.
        if (mode !== "refresh") setNextOffset(off);
        if (off <= 0) break;
        if (visibleCount(acc) >= MIN_VISIBLE) break;
      }
    } catch {
      /* silent — the counts payload still drives the badge */
    } finally {
      if (token === loadToken) setLoading(false);
    }
  };

  // Latches on first open and stays latched: unloading on close meant
  // reopening always refetched and reflashed the skeleton over rows we had.
  const [hasOpened, setHasOpened] = createSignal(false);
  createEffect(() => {
    if (open() && !hasOpened()) {
      setHasOpened(true);
      void load("reset");
    }
  });

  let prevCount = props.bucket.count;
  createEffect(() => {
    const count = props.bucket.count;
    const was = prevCount;
    prevCount = count;
    if (!fetchable()) return;
    // Mark-all-read zeroes the bucket in the store, but these rows live in a
    // local signal the store can't reach — drop them too or the list stays on
    // screen under a cleared badge.
    if (count === 0 && was > 0) {
      setRows([]);
      setNextOffset(0);
      return;
    }
    if (open() && count > was) void load("refresh");
  });

  // Switching a filter on can leave almost nothing visible; core pulls more
  // pages until enough rows survive it.
  createEffect(() => {
    const enough = visibleCount(rows()) >= MIN_VISIBLE;
    if (!open() || !fetchable() || enough) return;
    if (untrack(loading) || untrack(nextOffset) <= 0) return;
    void load("more");
  });

  const allRows = (): HzNotification[] =>
    fetchable() ? rows() : props.bucket.notifications;

  const notifications = createMemo(() =>
    applyFilters(allRows(), filterText(), startersOnly()),
  );

  // Only skeleton an empty section. Blanking a populated list into three
  // pulsing bars on every refetch was a visible strobe plus a height collapse.
  const isLoading = () =>
    fetchable() && open() && loading() && allRows().length === 0;

  const dismissibleMids = () =>
    notifications()
      .map((n) => n.b64mid)
      .filter((m): m is string => !!m);

  const onScroll = (e: Event) => {
    const el = e.currentTarget as HTMLDivElement;
    if (loading() || nextOffset() <= 0) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) void load("more");
  };

  const submitFilter = (e: Event) => {
    e.preventDefault();
    // Escalate to core's server-side xchan search, which reaches rows past the
    // pages we hold; until Enter it is a local filter over what's loaded.
    setNquery(filterText().trim());
    void load("reset");
  };

  const clearFilter = () => {
    setFilterText("");
    if (nquery()) {
      setNquery("");
      void load("reset");
    }
  };

  return (
    <div class="border border-rim rounded-xl overflow-hidden">
      {/* Header — a row, not one big button: the actions in it are links and
          buttons, which are invalid inside a <button> and get hoisted out of it
          by the parser. Two toggle targets flank them instead. */}
      <div
        class="w-full flex items-center justify-between gap-1.5 px-3 py-2
               bg-surface hover:bg-elevated transition-colors"
      >
        <button
          onClick={() => props.onToggle()}
          aria-expanded={open()}
          class="flex items-center gap-1.5 min-w-0 flex-1 text-left
                 text-xs font-semibold text-txt"
        >
          <meta.Icon class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate">{props.label}</span>
        </button>

        <span class="flex items-center gap-1.5 shrink-0">
          {/* The destination used to be the section title, which sits under the
              pointer for the whole width of the row and got hit by mistake.
              It has its own small target now. */}
          <Show when={props.href}>
            <a
              href={props.href}
              title={t("hq.view_all")}
              aria-label={t("hq.view_all")}
              onClick={(e) => {
                e.preventDefault();
                navigate(props.href!);
              }}
              class="p-0.5 rounded text-subtle hover:text-txt hover:bg-elevated transition-colors"
            >
              <MdFillOpen_in_new class="w-3.5 h-3.5" />
            </a>
          </Show>
          <Show
            when={
              open() &&
              (dismissibleMids().length > 0 ||
                (supportsMarkRead(props.id) && props.bucket.count > 0))
            }
          >
            <button
              onClick={() => props.onClearAll(props.id)}
              title={t("ui.mark_all_read")}
              class="p-0.5 rounded text-subtle hover:text-txt hover:bg-elevated transition-colors"
            >
              <MdFillDone_all class="w-3.5 h-3.5" />
            </button>
          </Show>
          <button
            onClick={() => props.onToggle()}
            aria-expanded={open()}
            aria-label={props.label}
            class="flex items-center gap-1.5"
          >
            <Show when={props.bucket.count > 0}>
              <span
                class="text-[0.625rem] font-bold bg-accent text-accent-fg rounded-full
                       px-1.5 py-0.5 min-w-[18px] text-center leading-none"
              >
                {formatCount(props.bucket.count, props.countLimit)}
              </span>
            </Show>
            <svg
              class={`w-3 h-3 text-subtle transition-transform ${open() ? "" : "-rotate-90"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </span>
      </div>

      {/* Body */}
      <Show when={open()}>
        <div class="px-1 py-1 space-y-0.5 bg-elevated">
          {/* Filters — core offers these on exactly the fetchable buckets */}
          <Show when={fetchable()}>
            <div class="flex items-center gap-1 px-1 pb-1">
              <form onSubmit={submitFilter} class="flex-1 min-w-0 relative">
                <input
                  type="search"
                  value={filterText()}
                  onInput={(e) => setFilterText(e.currentTarget.value)}
                  placeholder={t("notify.filter_name")}
                  aria-label={t("notify.filter_name")}
                  class="w-full text-[0.6875rem] rounded-md bg-surface border border-rim
                         px-2 py-1 pr-6 text-txt placeholder:text-subtle
                         focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <Show when={filterText() || nquery()}>
                  <button
                    type="button"
                    onClick={clearFilter}
                    title={t("notify.clear_filter")}
                    class="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded
                           text-subtle hover:text-txt"
                  >
                    <MdFillClose class="w-3 h-3" />
                  </button>
                </Show>
              </form>
              <button
                type="button"
                onClick={() => setStartersOnly((v) => !v)}
                title={t("notify.filter_starters")}
                aria-pressed={startersOnly()}
                class={`shrink-0 p-1 rounded-md border transition-colors ${
                  startersOnly()
                    ? "bg-accent text-accent-fg border-accent"
                    : "bg-surface text-subtle border-rim hover:text-txt"
                }`}
              >
                <MdFillForum class="w-3 h-3" />
              </button>
            </div>
          </Show>

          <Show when={isLoading()}>
            <div class="space-y-1 px-2 py-1">
              <For each={[1, 2, 3]}>
                {() => <div class="h-8 rounded bg-surface animate-pulse" />}
              </For>
            </div>
          </Show>
          <Show when={!isLoading()}>
            <Show
              when={notifications().length > 0}
              fallback={
                <p class="text-[0.6875rem] text-muted text-center py-3">
                  {t("ui.nothing_new")}
                </p>
              }
            >
              <div class="max-h-80 overflow-y-auto" onScroll={onScroll}>
                <For each={notifications()}>
                  {(n) => (
                    <NotifRow
                      n={n}
                      onDismiss={props.onDismiss}
                      onNotifySeen={props.onNotifySeen}
                      onOpenModal={props.onOpenModal}
                    />
                  )}
                </For>
                <Show when={loading()}>
                  <div class="h-8 mx-2 my-1 rounded bg-surface animate-pulse" />
                </Show>
              </div>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ── NoticeRow ─────────────────────────────────────────────────────────────────

function NoticeRow(props: {
  entry: HqNoticeEntry;
  onOpen: (uuid: string) => void;
}) {
  const { t } = useI18n();
  const handleClick = (e: MouseEvent) => {
    const connId = connectionRequestId(props.entry.href);
    if (connId) {
      // Open the accept/reject modal in place — the default here previously
      // always ran the post-display path below, which no-ops for connection
      // requests (they have no b64mid) and swallows the click via preventDefault,
      // so the link underneath (dead or not) never got followed either.
      e.preventDefault();
      openConnectionRequestModal(connId);
      return;
    }
    e.preventDefault();
    markItemSeen(props.entry.b64mid);
    props.onOpen(props.entry.b64mid);
  };

  return (
    <a
      href={resolveNotifyPath(props.entry.href)}
      onClick={handleClick}
      class="flex gap-2 items-start px-2 py-1.5 rounded-lg transition-colors
             hover:bg-elevated"
    >
      <Show when={props.entry.author_img}>
        <img
          src={props.entry.author_img}
          alt={props.entry.author_name}
          class="w-7 h-7 rounded-full shrink-0 mt-0.5 object-cover"
        />
      </Show>
      <div class="min-w-0 flex-1">
        <p class="text-xs text-txt leading-snug">
          <span class="font-semibold">{props.entry.author_name} </span>
          <span>{decodeHtmlEntities(props.entry.summary)}</span>
        </p>
        <p class="text-[0.625rem] text-muted mt-0.5">
          {relativeTime(props.entry.created, t)}
        </p>
      </div>
    </a>
  );
}

// ── NoticesSection ────────────────────────────────────────────────────────────

function NoticesSection(props: {
  open: boolean;
  onOpenModal: (uuid: string) => void;
}) {
  const { t } = useI18n();
  const [entries, { refetch }] = createQueryResource(
    "hq-notices",
    () => (props.open ? true : null),
    fetchNotices,
  );

  return (
    <div class="border border-rim rounded-xl overflow-hidden">
      <div class="px-1 py-1 space-y-0.5 bg-elevated">
        <Show when={entries.loading}>
          <div class="space-y-1 px-2 py-1">
            <For each={[1, 2, 3]}>
              {() => <div class="h-8 rounded bg-surface animate-pulse" />}
            </For>
          </div>
        </Show>
        <Show when={!entries.loading && entries.error}>
          <div class="flex flex-col items-center gap-1 py-3 text-[0.6875rem] text-muted">
            <span>{entries.error?.message}</span>
            <button
              onClick={() => refetch()}
              class="text-accent hover:underline"
            >
              {t("hq.retry")}
            </button>
          </div>
        </Show>
        <Show when={!entries.loading && !entries.error}>
          <Show
            when={(entries() ?? []).length > 0}
            fallback={
              <p class="text-[0.6875rem] text-muted text-center py-3">
                {t("hq.no_messages")}
              </p>
            }
          >
            <div class="max-h-80 overflow-y-auto">
              <For each={entries()}>
                {(entry) => (
                  <NoticeRow entry={entry} onOpen={props.onOpenModal} />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
      <div class="border-t border-rim py-1.5 text-center bg-surface">
        <a href="/notifications" class="text-[0.6875rem] text-accent hover:underline">
          {t("hq.view_all")}
        </a>
      </div>
    </div>
  );
}

// ── OtherChannelsSection ──────────────────────────────────────────────────────
// Mirrors Zotlabs\Widget\Channel_activities::get_channels_activity(): the other
// channels of this account that have pending intros or unseen alerts.

function OtherChannelsSection(props: { channels: ManagedChannel[] }) {
  const { t } = useI18n();
  const [switching, setSwitching] = createSignal<number | null>(null);

  const footer = (c: ManagedChannel) => {
    const parts: string[] = [];
    if (c.intros)
      parts.push(
        `${c.intros} ${t(c.intros === 1 ? "notify.other_conn" : "notify.other_conn_plural")}`,
      );
    if (c.notices)
      parts.push(
        `${c.notices} ${t(c.notices === 1 ? "notify.other_notice" : "notify.other_notice_plural")}`,
      );
    return parts.join(", ");
  };

  // Hard nav, not router navigate: change_channel() swapped the session channel,
  // so every SPA store (auth, nav, streams) is scoped to the old one.
  const go = async (c: ManagedChannel) => {
    if (switching()) return;
    setSwitching(c.channel_id);
    try {
      const { redirect_to } = await switchChannel(c.channel_id);
      window.location.href = redirect_to;
    } catch {
      setSwitching(null);
    }
  };

  return (
    <div class="border border-rim rounded-xl overflow-hidden">
      <div class="px-1 py-1 space-y-0.5 bg-elevated max-h-80 overflow-y-auto">
        <For each={props.channels}>
          {(c) => (
            <button
              onClick={() => go(c)}
              disabled={switching() !== null}
              class="w-full flex gap-2 items-center px-2 py-1.5 rounded-lg text-left
                     transition-colors hover:bg-surface disabled:opacity-50"
            >
              <Show when={c.photo}>
                <img
                  src={c.photo}
                  alt={c.channel_name}
                  class="w-7 h-7 rounded-full shrink-0 object-cover"
                />
              </Show>
              <div class="min-w-0 flex-1">
                <p class="text-xs text-txt font-semibold truncate">
                  {c.channel_name}
                </p>
                <p class="text-[0.625rem] text-muted truncate">
                  {c.channel_address}
                </p>
              </div>
              <span class="text-[0.625rem] text-accent shrink-0">
                {footer(c)}
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

// ── AnnouncementsSection ──────────────────────────────────────────────────────

function AnnouncementsSection(props: {
  list: Announcement[];
  loading: boolean;
  isAdmin: boolean;
  onCreate: (title: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [posting, setPosting] = createSignal(false);

  const post = async () => {
    if (!title().trim() && !body().trim()) return;
    setPosting(true);
    try {
      await props.onCreate(title().trim(), body().trim());
      setTitle("");
      setBody("");
    } finally {
      setPosting(false);
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale());
  };

  return (
    <div class="border border-rim rounded-xl overflow-hidden">
      <div class="px-1 py-1 space-y-0.5 bg-elevated">
        <Show when={props.loading}>
          <div class="space-y-1 px-2 py-1">
            <For each={[1, 2, 3]}>
              {() => <div class="h-8 rounded bg-surface animate-pulse" />}
            </For>
          </div>
        </Show>
        <Show when={!props.loading}>
          <Show
            when={props.list.length > 0}
            fallback={
              <p class="text-[0.6875rem] text-muted text-center py-3">
                {t("widgets.no_announcements")}
              </p>
            }
          >
            <div class="max-h-80 overflow-y-auto">
              <For each={props.list}>
                {(a) => (
                  <div class="px-2 py-1.5 border-b border-rim last:border-0">
                    <div class="flex items-start justify-between gap-2">
                      <Show when={a.title}>
                        <p class="text-xs font-semibold text-txt">{a.title}</p>
                      </Show>
                      <Show when={props.isAdmin}>
                        <button
                          onClick={() => props.onDelete(a.id)}
                          class="shrink-0 text-[0.625rem] text-muted hover:text-txt"
                        >
                          {t("widgets.delete_announcement")}
                        </button>
                      </Show>
                    </div>
                    <Show when={a.body}>
                      <p class="text-xs text-muted mt-0.5 whitespace-pre-wrap">{a.body}</p>
                    </Show>
                    <p class="text-[0.625rem] text-subtle mt-1">{fmtDate(a.created)}</p>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
      <Show when={props.isAdmin}>
        <div class="border-t border-rim p-2 flex flex-col gap-1.5 bg-surface">
          <input
            type="text"
            value={title()}
            maxLength={120}
            placeholder={t("widgets.cfg_announcement_title")}
            onInput={(e) => setTitle(e.currentTarget.value)}
            class="w-full bg-elevated border border-rim rounded-lg px-2 py-1.5 text-xs text-txt"
          />
          <textarea
            value={body()}
            maxLength={1000}
            rows={2}
            placeholder={t("widgets.cfg_announcement_body")}
            onInput={(e) => setBody(e.currentTarget.value)}
            class="w-full bg-elevated border border-rim rounded-lg px-2 py-1.5 text-xs text-txt resize-y"
          />
          <button
            onClick={post}
            disabled={posting() || (!title().trim() && !body().trim())}
            class="self-end px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium
                   hover:brightness-110 transition-all disabled:opacity-40"
          >
            {t("widgets.post_announcement")}
          </button>
        </div>
      </Show>
    </div>
  );
}

// ── Connection dot ────────────────────────────────────────────────────────────

type ConnStatus = "connecting" | "live" | "polling" | "error";

function StatusDot(props: { status: ConnStatus }) {
  const { t } = useI18n();
  const cls = () =>
    ({
      connecting: "text-yellow-400 animate-pulse",
      live: "text-green-400",
      polling: "text-accent animate-pulse",
      error: "text-red-400",
    })[props.status];
  const title = () =>
    ({
      connecting: t("notify.conn_connecting"),
      live: t("notify.conn_live"),
      polling: t("notify.conn_polling"),
      error: t("notify.conn_disconnected"),
    })[props.status];

  const IconComponent =
    props.status === "error" ? MdFillWifi_off : MdFillCircle;
  return <IconComponent class={`w-2 h-2 shrink-0 ${cls()}`} title={title()} />;
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function NotificationsAside() {
  const { t } = useI18n();
  const auth = useAuth();
  const isAdmin = useIsAdmin();

  // A store, not a signal: snapshots are merged with reconcile() keyed on _k so
  // rows that didn't change keep their identity. Replacing the array wholesale
  // (which is what this used to do) made <For> rebuild every row on every poll,
  // resetting the scroll position and un-dismissing rows.
  const [buckets, setBuckets] = createStore<Record<string, StreamBucket>>(
    Object.fromEntries(
      DISPLAY_ORDER.map((k) => [k, { count: 0, notifications: [], offset: -1 }]),
    ),
  );
  const [forumKeys, setForumKeys] = createSignal<string[]>([]);

  // Per-forum sections need labels the /sse_bs payload doesn't carry.
  const [forumNames] = createQueryResource(
    "notify-forum-names",
    () => (forumKeys().length ? true : null),
    fetchForumNames,
  );

  // The fixed buckets with each forum spliced in where core's widget puts it.
  const panelKeys = createMemo(() => displayKeys(forumKeys()));

  const sectionLabel = (key: string): string => {
    const meta = KNOWN_META[key];
    if (meta?.labelKey) return t(meta.labelKey as any);
    return forumNames()?.[key] ?? t("notify.bucket_forums");
  };

  const sectionHref = (key: string): string | undefined =>
    key.startsWith("forum_")
      ? `/network?pf=1&cid=${key.slice("forum_".length)}`
      : KNOWN_META[key]?.href;
  const [notices, setNotices] = createSignal<HzNotification[]>([]);
  const [connStatus, setConnStatus] = createSignal<ConnStatus>("connecting");
  const [booted, setBooted] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [modalUuid, setModalUuid] = createSignal<string | null>(null);
  const [showNotices, setShowNotices] = createSignal(false);
  const [showAnnouncements, setShowAnnouncements] = createSignal(false);
  const [showOtherChannels, setShowOtherChannels] = createSignal(false);
  const [openSection, setOpenSection] = createSignal<string | null>(null);

  const [announcements, { refetch: refetchAnnouncements, mutate: mutateAnnouncements }] =
    createQueryResource(
      "site-announcements",
      () => (booted() && auth()?.isLocal ? true : null),
      fetchAnnouncements,
    );

  const [seenAnnouncementId, setSeenAnnouncementId] = createSignal(getLastSeenAnnouncementId());

  // Other channels of this account needing attention. /spa/manage 403s for
  // delegated sessions — the error just means "no section", never a toast.
  const [manageData, { refetch: refetchManage }] = createQueryResource(
    "manage-channels",
    () => (booted() && auth()?.isLoggedIn ? true : null),
    fetchManageApi,
  );

  const otherChannels = createMemo(() =>
    (manageData()?.channels ?? []).filter(
      (c) => !c.is_current && (c.intros > 0 || c.notices > 0),
    ),
  );

  const hasNewAnnouncements = createMemo(() => {
    const list = announcements();
    return !!list?.length && list[0].id !== seenAnnouncementId();
  });

  const toggleAnnouncements = () => {
    setShowAnnouncements((v) => {
      const next = !v;
      if (next) {
        const list = announcements();
        if (list?.length) {
          setLastSeenAnnouncementId(list[0].id);
          setSeenAnnouncementId(list[0].id);
        }
      }
      return next;
    });
  };

  const createAnnouncement = async (title: string, body: string) => {
    const res = await apiFetch("/spa/announcements", {
      method: "POST",
      body: JSON.stringify({ action: "create", title, body }),
    });
    if (res.ok) {
      const json = await res.json();
      mutateAnnouncements(json.data as Announcement[]);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    const res = await apiFetch("/spa/announcements", {
      method: "POST",
      body: JSON.stringify({ action: "delete", id }),
    });
    if (res.ok) refetchAnnouncements();
  };

  // True once the boot snapshot has landed. The first payload turns an empty
  // panel into the user's whole backlog — every row reads as "fresh", so
  // alerting on it would fire one desktop notification per unread item.
  let bootApplied = false;

  // Every key ever announced this session. A row can reappear in a later
  // payload — an optimistic dismissal the server hasn't committed, a bucket
  // re-sent on reconnect — and "not in the previous list" alone would announce
  // it again each time. Trimmed FIFO so a long session can't grow unbounded.
  const alerted = new Set<string>();
  const ALERTED_MAX = 500;
  const announceOnce = (k: string): boolean => {
    if (alerted.has(k)) return false;
    alerted.add(k);
    if (alerted.size > ALERTED_MAX) {
      alerted.delete(alerted.values().next().value as string);
    }
    return true;
  };

  const applyRaw = (raw: SseResponse, fromSsePush = false) => {
    const { buckets: incoming, forumKeys: fk, present } = normalise(raw);
    if (fk.length) setForumKeys(fk);
    const freshNotifs: { key: string; n: HzNotification }[] = [];
    // unwrap() reads through the proxy without subscribing — applyRaw runs from
    // timers and promise callbacks, and tracking here would be a feedback loop.
    const prev = unwrap(buckets);

    // A snapshot replaces every bucket; a push only speaks for the keys it
    // carried. Walking all of them on a push zeroed everything the delta left
    // out, which is the counts bouncing on every SSE event.
    for (const key of fromSsePush ? present : Object.keys(incoming)) {
      const inc = incoming[key];
      if (!inc) continue;
      const prevList = prev[key]?.notifications ?? [];
      const seen = new Set(prevList.map((n) => n._k));
      for (const n of inc.notifications) {
        if (!seen.has(n._k)) freshNotifs.push({ key, n });
      }
      let next: StreamBucket;
      if (!fromSsePush) {
        next = inc;
      } else if (!inc.count) {
        // A push reporting zero clears the bucket outright, as core does.
        next = { count: 0, notifications: [], offset: -1 };
      } else {
        next = {
          // Push counts are deltas — core's client adds them to what's on
          // screen rather than replacing (notifications_widget.tpl:469).
          count: (prev[key]?.count ?? 0) + inc.count,
          notifications: inc.notifications.length
            ? prependDeduped(prevList, inc.notifications)
            : prevList,
          offset: prev[key]?.offset ?? inc.offset,
        };
      }
      setBuckets(key, reconcile(next, { key: "_k" }));
    }

    // Alert on both transports: polling users used to get nothing at all,
    // because this only ran on the SSE branch. announceOnce() still runs on the
    // boot payload so the backlog is marked announced without being announced.
    for (const { key, n } of freshNotifs) {
      if (!announceOnce(n._k ?? `${key}-${n.notify_id ?? ""}`)) continue;
      if (bootApplied) {
        const meta = KNOWN_META[key];
        showDesktopNotification(n.name || (meta?.labelKey ? t(meta.labelKey as any) : "") || t("notify.fallback_sender"), {
          body: stripHtml(n.message),
          icon: n.photo,
          tag: n._k ?? `${key}-${n.notify_id ?? ""}`,
          onClick: () => {
            const uuid = getDisplayUuid(n);
            const connId = connectionRequestId(n.notify_link);
            if (uuid) setModalUuid(uuid);
            else if (connId) openConnectionRequestModal(connId);
            else window.location.assign(resolveNotifyPath(n.notify_link ?? meta?.href));
          },
        });
      }
    }
    bootApplied = true;
    const nn = raw["notice"] as { notifications: HzNotification[] } | undefined;
    const ni = raw["info"] as { notifications: HzNotification[] } | undefined;
    setNotices([...(nn?.notifications ?? []), ...(ni?.notifications ?? [])]);
  };

  const doFetchCounts = async () => {
    applyRaw(await fetchCounts(), false);
  };

  const markSeen = async (b64mids: string[]) => {
    if (!b64mids.length) return;
    const midSet = new Set(b64mids);
    const prev = unwrap(buckets);
    for (const key of Object.keys(prev)) {
      const b = prev[key];
      if (!b) continue;
      const filtered = b.notifications.filter(
        (n) => !n.b64mid || !midSet.has(n.b64mid),
      );
      if (filtered.length === b.notifications.length) continue;
      setBuckets(key, {
        count: Math.max(0, b.count - (b.notifications.length - filtered.length)),
        notifications: filtered,
      });
    }
    await markSeenAndRefetch(b64mids, (raw) => applyRaw(raw, false));
  };

  let es: EventSource | null = null;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let sseConfirmed = false;
  let usePolling = false;

  const clearAllTimers = () => {
    if (probeTimer) {
      clearTimeout(probeTimer);
      probeTimer = null;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const startPollMode = () => {
    if (usePolling) return;
    usePolling = true;
    setConnStatus("polling");
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await doFetchCounts();
      } catch {
        setConnStatus("error");
      }
    }, updateInterval());
  };

  const connectSSE = () => {
    if (usePolling) return;
    if (es) {
      es.close();
      es = null;
    }
    es = new EventSource("/sse", { withCredentials: true });

    const onEvent = (data: SseResponse) => {
      if (!sseConfirmed) {
        sseConfirmed = true;
        if (probeTimer) {
          clearTimeout(probeTimer);
          probeTimer = null;
        }
        // A live push stream makes the interval redundant, and its full
        // snapshot is what used to clobber the SSE-accumulated list every
        // minute. Core does the same: the fallback interval only exists in
        // the `else` branch of `if (sse_enabled)`.
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }
      setConnStatus("live");
      if (data && Object.keys(data).length) applyRaw(data, true);
    };

    es.addEventListener("notifications", (e: MessageEvent) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("heartbeat", () => onEvent({}));
    es.onopen = () => {
      if (!sseConfirmed) setConnStatus("connecting");
    };
    es.onerror = () => {
      es?.close();
      es = null;
      if (!sseConfirmed) {
        if (probeTimer) {
          clearTimeout(probeTimer);
          probeTimer = null;
        }
        startPollMode();
      } else {
        setConnStatus("error");
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (!usePolling) connectSSE();
        }, RETRY_DELAY_MS);
      }
    };

    probeTimer = setTimeout(() => {
      probeTimer = null;
      if (!sseConfirmed) {
        es?.close();
        es = null;
        startPollMode();
      }
    }, PROBE_MS);
  };

  let started = false;
  createEffect(() => {
    const uid = auth()?.uid;
    if (auth.loading) return;
    if (started) return;
    started = true;
    if (!uid) {
      setConnStatus("error");
      setBooted(true);
      return;
    }
    doFetchCounts()
      .then(() => {
        setBooted(true);
        // Bridges the gap until the SSE probe resolves; onEvent() clears it the
        // moment a push lands, and startPollMode() owns it from then on.
        connectSSE();
        pollTimer = setInterval(async () => {
          if (document.visibilityState !== "visible") return;
          try {
            await doFetchCounts();
          } catch {
            /* silent */
          }
        }, updateInterval());
      })
      .catch(() => {
        setBooted(true);
        setConnStatus("error");
      });
  });

  onCleanup(() => {
    es?.close();
    clearAllTimers();
  });

  const manualRefresh = async () => {
    if (refreshing()) return;
    setRefreshing(true);
    try {
      await doFetchCounts();
      refetchManage();
    } finally {
      setRefreshing(false);
    }
  };

  const markAllRead = async () => {
    const currentBuckets = unwrap(buckets);
    const promises: Promise<unknown>[] = [];
    // Only buckets a server call actually clears may be zeroed optimistically.
    // `intros` and `register` have no markRead branch in core's
    // Zotlabs\Module\Notifications switch, so zeroing them just made the badge
    // bounce N -> 0 -> N as soon as doFetchCounts() came back.
    const cleared: string[] = [];

    // Use server-side markRead for all supported item/event/notify buckets
    for (const key of ["network", "dm", "home", "notify", "all_events", "pubs"] as const) {
      if ((currentBuckets[key]?.count ?? 0) > 0) {
        promises.push(markAllSeen(key));
        cleared.push(key);
      }
    }
    // Forums are ordinary markRead keys — core matches them by prefix.
    for (const fk of forumKeys()) {
      if ((currentBuckets[fk]?.count ?? 0) > 0) {
        promises.push(markAllSeen(fk));
        cleared.push(fk);
      }
    }
    // Files have no markRead endpoint — use b64mids from loaded notifications
    const fileMids = (currentBuckets["files"]?.notifications ?? [])
      .map((n) => n.b64mid)
      .filter((m): m is string => !!m);
    if (fileMids.length) {
      promises.push(
        fetch("/sse_bs", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ sse_rmids: fileMids.join(","), nquery: "" }),
        }),
      );
    }

    // Optimistic clear
    setBuckets(
      produce((s) => {
        for (const key of cleared) s[key] = { count: 0, notifications: [], offset: -1 };
        // Files clear only the rows that were loaded, so decrement rather than
        // claiming the whole bucket is gone.
        const files = s["files"];
        if (files && fileMids.length) {
          const mids = new Set(fileMids);
          files.notifications = files.notifications.filter(
            (n) => !n.b64mid || !mids.has(n.b64mid),
          );
          files.count = Math.max(0, files.count - fileMids.length);
        }
      }),
    );

    try {
      await Promise.all(promises);
      await doFetchCounts();
    } catch {
      /* silent */
    }
  };

  const activeBuckets = createMemo(() =>
    panelKeys().filter((key) => {
      const b = buckets[key];
      return b && (b.count > 0 || b.notifications.length > 0);
    }),
  );

  const hasAnyCount = createMemo(() =>
    panelKeys().some((k) => (buckets[k]?.count ?? 0) > 0),
  );
  createEffect(() => {
    const total = panelKeys().reduce(
      (sum, k) => sum + (buckets[k]?.count ?? 0),
      0,
    );
    setNotifCount(total);
  });

  return (
    <>
      <Show when={modalUuid()}>
        <PostDetailModal
          uuid={modalUuid()!}
          onClose={() => setModalUuid(null)}
        />
      </Show>

      <div class="space-y-3">
        {/* Header */}
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-txt flex items-center gap-1.5">
            <StatusDot status={connStatus()} />
            {t("ui.notifications_title")}
          </h3>
          <div class="flex items-center gap-1.5">
            <Show when={booted() && auth()?.isLoggedIn}>
              <button
                onClick={() => setShowNotices((v) => !v)}
                title={t("hq.msg_tab_notices")}
                class="p-1 rounded transition-colors"
                classList={{
                  "text-accent bg-accent-muted": showNotices(),
                  "text-subtle hover:text-txt hover:bg-elevated": !showNotices(),
                }}
              >
                <MdOutlineCampaign class="w-4 h-4" />
              </button>
            </Show>
            <Show when={otherChannels().length > 0}>
              <button
                onClick={() => setShowOtherChannels((v) => !v)}
                title={t("notify.other_channels")}
                class="relative p-1 rounded transition-colors"
                classList={{
                  "text-accent bg-accent-muted": showOtherChannels(),
                  "text-subtle hover:text-txt hover:bg-elevated":
                    !showOtherChannels(),
                }}
              >
                <MdFillHome class="w-4 h-4" />
                <Show when={!showOtherChannels()}>
                  <span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-accent" />
                </Show>
              </button>
            </Show>
            <Show
              when={
                booted() &&
                auth()?.isLocal &&
                (hasNewAnnouncements() || showAnnouncements() || isAdmin())
              }
            >
              <button
                onClick={toggleAnnouncements}
                title={t("widgets.site_announcements")}
                class="relative p-1 rounded transition-colors"
                classList={{
                  "text-accent bg-accent-muted": showAnnouncements(),
                  "text-subtle hover:text-txt hover:bg-elevated": !showAnnouncements(),
                }}
              >
                <MdOutlineAnnouncement class="w-4 h-4" />
                <Show when={!showAnnouncements() && hasNewAnnouncements()}>
                  <span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-accent" />
                </Show>
              </button>
            </Show>
            <Show when={booted() && hasAnyCount()}>
              <button
                onClick={markAllRead}
                title={t("ui.mark_all_read")}
                class="p-1 rounded text-subtle hover:text-txt hover:bg-elevated transition-colors"
              >
                <MdFillDone_all class="w-4 h-4" />
              </button>
            </Show>
            <button
              onClick={manualRefresh}
              disabled={refreshing()}
              title={t("ui.refresh")}
              class="p-1 rounded text-subtle hover:text-txt hover:bg-elevated
                     transition-colors disabled:opacity-40"
            >
              <MdFillRefresh
                class={`w-4 h-4 ${refreshing() ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        <Show when={showNotices()}>
          <NoticesSection open={showNotices()} onOpenModal={setModalUuid} />
        </Show>

        <Show when={showOtherChannels() && otherChannels().length > 0}>
          <OtherChannelsSection channels={otherChannels()} />
        </Show>

        <Show when={showAnnouncements()}>
          <AnnouncementsSection
            list={announcements() ?? []}
            loading={announcements.loading}
            isAdmin={isAdmin()}
            onCreate={createAnnouncement}
            onDelete={deleteAnnouncement}
          />
        </Show>

        <Show when={!auth.loading && !auth()?.isLoggedIn}>
          <p class="text-xs text-muted text-center py-4">
            {t("ui.sign_in_notifs")}
          </p>
        </Show>

        <Show when={!booted()}>
          <div class="space-y-2">
            <For each={[1, 2, 3]}>
              {() => <div class="h-10 rounded-xl bg-elevated animate-pulse" />}
            </For>
          </div>
        </Show>

        <Show when={notices().length > 0}>
          <div class="space-y-1">
            <For each={notices()}>
              {(n) => (
                <div class="text-xs text-accent-txt bg-accent-muted rounded-lg px-3 py-2">
                  {n.message}
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={booted() && activeBuckets().length > 0}>
          <div class="space-y-2">
            <For each={activeBuckets()}>
              {(key) => (
                <StreamSection
                  id={key}
                  bucket={buckets[key]}
                  label={sectionLabel(key)}
                  href={sectionHref(key)}
                  countLimit={notifyCountLimit()}
                  open={openSection() === key}
                  onToggle={() =>
                    setOpenSection((cur) => (cur === key ? null : key))
                  }
                  onDismiss={(mid) => markSeen([mid])}
                  onNotifySeen={async (nid) => {
                    await markNotifySeen(nid);
                    try {
                      await doFetchCounts();
                    } catch {
                      /* silent */
                    }
                  }}
                  onClearAll={async (key) => {
                    // Buckets core has no markRead branch for (files, intros,
                    // register) fall through its switch and clear nothing, so
                    // route those through sse_rmids on the rows we hold instead
                    // of zeroing a count the server will hand straight back.
                    if (!supportsMarkRead(key)) {
                      const mids = (unwrap(buckets)[key]?.notifications ?? [])
                        .map((n) => n.b64mid)
                        .filter((m): m is string => !!m);
                      await markSeen(mids);
                      return;
                    }
                    setBuckets(key, { count: 0, notifications: [], offset: -1 });
                    try {
                      await markAllSeen(key);
                      await doFetchCounts();
                    } catch {
                      /* silent */
                    }
                  }}
                  onOpenModal={(uuid) => setModalUuid(uuid)}
                />
              )}
            </For>
          </div>
        </Show>

        <Show
          when={
            booted() &&
            auth()?.isLoggedIn &&
            activeBuckets().length === 0 &&
            notices().length === 0 &&
            otherChannels().length === 0
          }
        >
          <p class="flex items-center justify-center gap-1.5 py-1.5 text-[0.6875rem] text-subtle">
            <MdFillNotifications class="w-3.5 h-3.5 shrink-0" />
            {t("ui.no_notifications")}
          </p>
        </Show>

      </div>
    </>
  );
}
