import {
  createSignal,
  createEffect,
  createUniqueId,
  untrack,
  For,
  Show,
  createMemo,
  onCleanup,
  type JSX,
} from "solid-js";
import { createStore, reconcile, unwrap, produce } from "solid-js/store";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  useAuth,
  updateInterval,
  notifyCountLimit,
  channelKey,
} from "@utsukta/spa-core/store/auth-store";
import { useIsAdmin } from "@utsukta/spa-core/store/site-config";
import { MdFillApp_registration, MdFillClose, MdFillEvent, MdFillForum, MdFillHome, MdFillInsert_drive_file, MdFillMail, MdFillNotifications, MdFillPeople, MdFillPublic, MdFillRefresh, MdFillWifi, MdOutlineAnnouncement, MdOutlineCampaign, MdOutlineDelete, MdOutlineExpand_more } from "solid-icons/md";
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
import { openPost } from "@/shared/views/modal-host";
import { Button, IconButton } from "@ui/Button";
import { Card } from "@ui/Card";
import { Badge } from "@ui/Badge";
import { EmptyState } from "@ui/EmptyState";
import { ErrorState } from "@ui/ErrorState";
import { Field, Input, Textarea } from "@ui/Field";
import { SearchField } from "@ui/SearchField";
import { Skeleton } from "@ui/Skeleton";
import { LoadMore } from "@ui/LoadMore";
import { Banner } from "@ui/Banner";
import { Modal, ModalPanel } from "@ui/Modal";
import { Avatar } from "@ui/Avatar";
import { Collapsible } from "@ui/Collapsible";
import { ListRow } from "@ui/ListRow";
import type { CollapsibleTriggerProps } from "@utsukta/spa-core/types/ui.types";

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
    return localStorage.getItem(channelKey(ANNOUNCEMENTS_SEEN_KEY));
  } catch {
    return null;
  }
}

function setLastSeenAnnouncementId(id: string): void {
  try {
    localStorage.setItem(channelKey(ANNOUNCEMENTS_SEEN_KEY), id);
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

// ── Shared group chrome ───────────────────────────────────────────────────────
// One flat header row for every group (buckets and the fixed panels alike), so
// the panel reads as a single list instead of a stack of bordered cards.
const GROUP_HEADER =
  "hz-notify-group w-full flex items-center gap-2 px-2 py-2 rounded-lg " +
  "text-left text-txt hover:bg-elevated/50 transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const GROUP_CHEVRON = "w-4 h-4 shrink-0 text-subtle transition-transform duration-200";

function RowSkeletons(props: { count?: number }) {
  return (
    <div class="space-y-1 px-2 py-1.5" aria-hidden="true">
      <For each={Array.from({ length: props.count ?? 3 })}>
        {() => <Skeleton class="h-9 w-full" rounded="lg" />}
      </For>
    </div>
  );
}

function GroupHeader(props: {
  trigger: CollapsibleTriggerProps;
  icon: JSX.Element;
  label: string;
  /** Pre-formatted unread count; omitted at zero. */
  count?: string;
  /** Accent dot for "something here" without a count (announcements). */
  dot?: boolean;
  open: boolean;
}) {
  return (
    <button type="button" {...props.trigger} class={GROUP_HEADER}>
      <span class="shrink-0 text-muted" aria-hidden="true">{props.icon}</span>
      <span class="flex-1 min-w-0 truncate text-xs font-semibold">{props.label}</span>
      <Show when={props.dot}>
        <span class="w-1.5 h-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      </Show>
      <Show when={props.count}>
        <Badge tone="accent" size="sm" class="tabular-nums">{props.count}</Badge>
      </Show>
      <MdOutlineExpand_more
        aria-hidden="true"
        class={`${GROUP_CHEVRON} ${props.open ? "" : "-rotate-90"}`}
      />
    </button>
  );
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
    <div class="flex items-start gap-0.5 pr-2 group">
      <a
        href={resolveNotifyPath(props.n.notify_link)}
        onClick={handleClick}
        class="flex gap-2.5 items-start px-2 py-2 rounded-lg transition-colors
               hover:bg-elevated/50 flex-1 min-w-0"
      >
        <Show when={props.n.photo}>
          <Avatar src={props.n.photo} name={props.n.name ?? ""} size={7} class="mt-0.5 shrink-0" />
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
              <p class="text-[0.6875rem] text-muted tabular-nums">{when()}</p>
            </Show>
          </div>
        </div>
      </a>

      <Show when={props.n.b64mid}>
        <IconButton
          label={t("notify.mark_read")}
          size="sm"
          class="shrink-0 mt-1 opacity-60 hover:opacity-100"
          onClick={handleDismiss}
        >
          <MdFillClose class="w-3.5 h-3.5" />
        </IconButton>
      </Show>
    </div>
    </Show>
  );
}

// ── StreamGroup ───────────────────────────────────────────────────────────────

function StreamGroup(props: {
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
  // `!hasOpened()` covers the first open, where the load effect has not run yet.
  const isLoading = () =>
    fetchable() &&
    open() &&
    allRows().length === 0 &&
    (loading() || !hasOpened());

  const dismissibleMids = () =>
    notifications()
      .map((n) => n.b64mid)
      .filter((m): m is string => !!m);

  // Escalate to core's server-side xchan search, which reaches rows past the
  // pages we hold; until Enter it is a local filter over what's loaded.
  const submitFilter = () => {
    setNquery(filterText().trim());
    void load("reset");
  };

  // Clearing the field (the SearchField's × or deleting the text) also drops
  // the server-side query, so the list returns to everything we had paged.
  createEffect(() => {
    if (filterText() !== "" || !nquery()) return;
    setNquery("");
    void load("reset");
  });

  return (
    <Collapsible
      open={open()}
      onOpenChange={() => props.onToggle()}
      panelClass="pb-1"
      header={(trigger) => (
        <GroupHeader
          trigger={trigger}
          icon={<meta.Icon class="w-4 h-4" />}
          label={props.label}
          count={
            props.bucket.count > 0
              ? formatCount(props.bucket.count, props.countLimit)
              : undefined
          }
          open={open()}
        />
      )}
    >
      {/* Filters — core offers these on exactly the fetchable buckets */}
      <Show when={fetchable()}>
        <div class="flex items-center gap-1 px-2 pb-1.5">
          <SearchField
            class="flex-1 min-w-0"
            size="sm"
            value={filterText()}
            onInput={setFilterText}
            label={t("notify.filter_name")}
            clearLabel={t("notify.clear_filter")}
            onSearch={() => submitFilter()}
          />
          <IconButton
            label={t("notify.filter_starters")}
            size="sm"
            pressed={startersOnly()}
            class="shrink-0"
            onClick={() => setStartersOnly((v) => !v)}
          >
            <MdFillForum class="w-3.5 h-3.5" />
          </IconButton>
        </div>
      </Show>

      <Show when={isLoading()}>
        <RowSkeletons />
      </Show>
      <Show when={!isLoading()}>
        <Show
          when={notifications().length > 0}
          fallback={
            <EmptyState size="sm" class="py-2">
              {t("ui.nothing_new")}
            </EmptyState>
          }
        >
          <div class="space-y-0.5">
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
              <div class="px-2 py-1">
                <Skeleton class="h-9 w-full" rounded="lg" />
              </div>
            </Show>
            <LoadMore
              auto
              hasMore={nextOffset() > 0}
              loading={loading()}
              onClick={() => void load("more")}
              label={t("ui.show_more")}
            />
          </div>
        </Show>
      </Show>

      <div class="flex items-center gap-2 px-2 pt-1">
        <Show when={props.href}>
          <a
            href={props.href}
            onClick={(e) => {
              e.preventDefault();
              navigate(props.href!);
            }}
            class="text-[0.6875rem] text-accent-txt hover:underline"
          >
            {t("hq.view_all")}
          </a>
        </Show>
        <Show
          when={
            notifications().length > 0 &&
            (dismissibleMids().length > 0 ||
              (supportsMarkRead(props.id) && props.bucket.count > 0))
          }
        >
          <button
            type="button"
            onClick={() => props.onClearAll(props.id)}
            class="ml-auto text-[0.6875rem] text-muted hover:text-txt transition-colors"
          >
            {t("ui.mark_all_read")}
          </button>
        </Show>
      </div>
    </Collapsible>
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
      class="flex gap-2.5 items-start px-2 py-2 rounded-lg transition-colors
             hover:bg-elevated/50"
    >
      <Show when={props.entry.author_img}>
        <Avatar src={props.entry.author_img} name={props.entry.author_name} size={7} class="mt-0.5 shrink-0" />
      </Show>
      <div class="min-w-0 flex-1">
        <p class="text-xs text-txt leading-snug">
          <span class="font-semibold">{props.entry.author_name} </span>
          <span>{decodeHtmlEntities(props.entry.summary)}</span>
        </p>
        <p class="text-[0.6875rem] text-muted mt-0.5 tabular-nums">
          {relativeTime(props.entry.created, t)}
        </p>
      </div>
    </a>
  );
}

// ── NoticesGroup ─────────────────────────────────────────────────────────────
// HQ's notice feed. It keeps its own group rather than a header tab: it is
// loaded lazily the first time the group is opened (no extra request on boot),
// and it closes like every other group so only one list is on screen at a time.

function NoticesGroup(props: {
  open: boolean;
  onToggle: () => void;
  entries: HqNoticeEntry[] | undefined;
  loading: boolean;
  error: Error | undefined;
  onRetry: () => void;
  onOpenModal: (uuid: string) => void;
}) {
  const { t } = useI18n();

  return (
    <Collapsible
      open={props.open}
      onOpenChange={() => props.onToggle()}
      panelClass="pb-1"
      header={(trigger) => (
        <GroupHeader
          trigger={trigger}
          icon={<MdOutlineCampaign class="w-4 h-4" />}
          label={t("hq.msg_tab_notices")}
          open={props.open}
        />
      )}
    >
      <Show when={props.loading || (!props.entries && !props.error)}>
        <RowSkeletons />
      </Show>
      <Show when={!props.loading && props.error}>
        <ErrorState
          class="py-4"
          message={props.error!.message}
          retry={props.onRetry}
          retryLabel={t("hq.retry")}
        />
      </Show>
      <Show when={!props.loading && !props.error && props.entries}>
        <Show
          when={(props.entries ?? []).length > 0}
          fallback={
            <EmptyState size="sm" class="py-2">
              {t("ui.nothing_new")}
            </EmptyState>
          }
        >
          <div class="space-y-0.5">
            <For each={props.entries}>
              {(entry) => <NoticeRow entry={entry} onOpen={props.onOpenModal} />}
            </For>
          </div>
        </Show>
      </Show>
    </Collapsible>
  );
}

// ── OtherChannelsGroup ────────────────────────────────────────────────────────
// Mirrors Zotlabs\Widget\Channel_activities::get_channels_activity(): the other
// channels of this account that have pending intros or unseen alerts.

function OtherChannelsGroup(props: {
  channels: ManagedChannel[];
  open: boolean;
  onToggle: () => void;
}) {
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

  const total = () => props.channels.reduce((n, c) => n + c.intros + c.notices, 0);

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
    <Collapsible
      open={props.open}
      onOpenChange={() => props.onToggle()}
      panelClass="pb-1"
      header={(trigger) => (
        <GroupHeader
          trigger={trigger}
          icon={<MdFillPeople class="w-4 h-4" />}
          label={t("notify.other_channels")}
          count={total() > 0 ? String(total()) : undefined}
          open={props.open}
        />
      )}
    >
      <div class="space-y-0.5">
        <For each={props.channels}>
          {(c) => (
            <ListRow
              leading={
                <Show when={c.photo}>
                  <Avatar src={c.photo} name={c.channel_name} size={7} />
                </Show>
              }
              title={c.channel_name}
              subtitle={c.channel_address}
              trailing={<span class="text-[0.6875rem] text-accent-txt tabular-nums">{footer(c)}</span>}
              onClick={() => switching() === null && go(c)}
              class={`rounded-lg ${switching() !== null ? "opacity-50 pointer-events-none" : ""}`}
            />
          )}
        </For>
      </div>
    </Collapsible>
  );
}

// ── AnnouncementsGroup ────────────────────────────────────────────────────────

function AnnouncementsGroup(props: {
  list: Announcement[];
  loading: boolean;
  isAdmin: boolean;
  open: boolean;
  onToggle: () => void;
  hasNew: boolean;
  onCreate: (title: string, body: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const formId = createUniqueId();
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [posting, setPosting] = createSignal(false);
  const [composerOpen, setComposerOpen] = createSignal(false);

  const closeComposer = () => setComposerOpen(false);

  const post = async () => {
    if (posting() || (!title().trim() && !body().trim())) return;
    setPosting(true);
    try {
      const ok = await props.onCreate(title().trim(), body().trim());
      if (ok) {
        setTitle("");
        setBody("");
        setComposerOpen(false);
      }
    } finally {
      setPosting(false);
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale());
  };

  return (
    <Collapsible
      open={props.open}
      onOpenChange={() => props.onToggle()}
      panelClass="pb-1"
      header={(trigger) => (
        <GroupHeader
          trigger={trigger}
          icon={<MdOutlineAnnouncement class="w-4 h-4" />}
          label={t("widgets.site_announcements")}
          dot={props.hasNew}
          open={props.open}
        />
      )}
    >
      <Show when={props.loading}>
        <RowSkeletons />
      </Show>
      <Show when={!props.loading}>
        <Show
          when={props.list.length > 0}
          fallback={
            <EmptyState size="sm" class="py-2">
              {t("widgets.no_announcements")}
            </EmptyState>
          }
        >
          <div class="space-y-0.5">
            <For each={props.list}>
              {(a) => (
                <div class="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-elevated/50">
                  <div class="min-w-0 flex-1">
                    <Show when={a.title}>
                      <p class="text-xs font-semibold text-txt">{a.title}</p>
                    </Show>
                    <Show when={a.body}>
                      <p class="text-xs text-muted mt-0.5 whitespace-pre-wrap">{a.body}</p>
                    </Show>
                    <p class="text-[0.6875rem] text-subtle mt-1 tabular-nums">{fmtDate(a.created)}</p>
                  </div>
                  <Show when={props.isAdmin}>
                    <IconButton
                      label={t("widgets.delete_announcement")}
                      size="sm"
                      variant="danger"
                      class="shrink-0 opacity-60 hover:opacity-100"
                      onClick={() => void props.onDelete(a.id)}
                    >
                      <MdOutlineDelete class="w-3.5 h-3.5" />
                    </IconButton>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={props.isAdmin}>
        <div class="px-2 pt-1">
          <Button variant="ghost" size="sm" class="w-full" onClick={() => setComposerOpen(true)}>
            {t("widgets.post_announcement")}
          </Button>
        </div>
      </Show>

      <Show when={composerOpen()}>
        <Modal onClose={closeComposer}>
          <ModalPanel
            size="md"
            title={t("widgets.site_announcements")}
            onClose={closeComposer}
            footer={
              <>
                <Button variant="ghost" size="sm" onClick={closeComposer}>
                  {t("layout.close")}
                </Button>
                <Button
                  type="submit"
                  form={formId}
                  size="sm"
                  disabled={posting() || (!title().trim() && !body().trim())}
                >
                  {t("widgets.post_announcement")}
                </Button>
              </>
            }
          >
            <form
              id={formId}
              class="px-4 py-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void post();
              }}
            >
              <Field label={t("widgets.cfg_announcement_title")}>
                <Input
                  class="w-full"
                  type="text"
                  autofocus
                  value={title()}
                  maxLength={120}
                  onInput={(e) => setTitle(e.currentTarget.value)}
                />
              </Field>
              <Field
                label={t("widgets.cfg_announcement_body")}
                hint={`${body().length}/1000`}
              >
                <Textarea
                  class="w-full resize-y"
                  value={body()}
                  maxLength={1000}
                  rows={5}
                  onInput={(e) => setBody(e.currentTarget.value)}
                />
              </Field>
            </form>
          </ModalPanel>
        </Modal>
      </Show>
    </Collapsible>
  );
}

// ── Connection status ─────────────────────────────────────────────────────────

type ConnStatus = "connecting" | "live" | "polling" | "error";

// ── Main widget ───────────────────────────────────────────────────────────────

export default function NotificationsAside() {
  const { t } = useI18n();
  const connLabel = () =>
    ({
      connecting: t("notify.conn_connecting"),
      live: t("notify.conn_live"),
      polling: t("notify.conn_polling"),
      error: t("notify.conn_disconnected"),
    })[connStatus()];
  const auth = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();

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
  // Transient notice/info rows carried on the counts payload — rendered as
  // status banners above the groups, not as a notification category.
  const [systemNotices, setSystemNotices] = createSignal<HzNotification[]>([]);
  const [connStatus, setConnStatus] = createSignal<ConnStatus>("connecting");
  const [booted, setBooted] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  // One group open at a time, shared by the buckets and the fixed panels, so
  // the sidebar never grows a second scroll context.
  const [openGroup, setOpenGroup] = createSignal<string | null>(null);
  // Names the widget's region and visible heading; one id per instance.
  const titleId = createUniqueId();

  const [announcements, { refetch: refetchAnnouncements, mutate: mutateAnnouncements }] =
    createQueryResource(
      "site-announcements",
      () => (booted() && auth()?.isLocal ? true : null),
      fetchAnnouncements,
    );

  // HQ's notice feed. Disabled until its group is opened, so a user who never
  // looks at notices pays no /hq request on boot; the cached result makes
  // reopening free for staleTime.
  const [noticesFeed, { refetch: refetchNotices }] = createQueryResource(
    "hq-notices",
    () => (booted() && auth()?.isLoggedIn && openGroup() === "notices" ? true : null),
    fetchNotices,
  );

  const [seenAnnouncementId, setSeenAnnouncementId] = createSignal(getLastSeenAnnouncementId());

  // Other channels of this account needing attention. /spa/manage 403s for
  // delegated sessions — the error just means "no section", never a toast.
  // Local only: a remote visitor has no account here and would just 403.
  const [manageData, { refetch: refetchManage }] = createQueryResource(
    "manage-channels",
    () => (booted() && auth()?.isLocal ? true : null),
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

  const toggleGroup = (key: string) =>
    setOpenGroup((cur) => (cur === key ? null : key));

  // Opening the announcements group is what marks them seen, as the old toggle
  // did on its "open" half. An effect rather than an onClick because the list
  // can land after the group is already open.
  createEffect(() => {
    if (openGroup() !== "announcements") return;
    const list = announcements();
    if (!list?.length || list[0].id === seenAnnouncementId()) return;
    setLastSeenAnnouncementId(list[0].id);
    setSeenAnnouncementId(list[0].id);
  });

  const createAnnouncement = async (title: string, body: string): Promise<boolean> => {
    const res = await apiFetch("/spa/announcements", {
      method: "POST",
      body: JSON.stringify({ action: "create", title, body }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    mutateAnnouncements(json.data as Announcement[]);
    return true;
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
            if (uuid) openPost(uuid);
            else if (connId) openConnectionRequestModal(connId);
            else window.location.assign(resolveNotifyPath(n.notify_link ?? meta?.href));
          },
        });
      }
    }
    bootApplied = true;
    const nn = raw["notice"] as { notifications: HzNotification[] } | undefined;
    const ni = raw["info"] as { notifications: HzNotification[] } | undefined;
    setSystemNotices([...(nn?.notifications ?? []), ...(ni?.notifications ?? [])]);
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
      // Refresh whatever group is on screen, not just the counts.
      if (openGroup() === "notices") refetchNotices();
      if (openGroup() === "announcements") refetchAnnouncements();
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

  // One total feeds the shell's own badge (sidebar toggle / mobile nav); the
  // panel header leaves it out on purpose — a 14px title plus a bubble cannot
  // fit the 256px sidebar once a locale like German spells it out, and the
  // per-group counts already say where the unread rows are.
  const totalUnread = createMemo(() =>
    panelKeys().reduce((sum, k) => sum + (buckets[k]?.count ?? 0), 0),
  );
  createEffect(() => setNotifCount(totalUnread()));

  const statusDotClass = () =>
    connStatus() === "live"
      ? "bg-success"
      : connStatus() === "polling"
        ? "bg-warning"
        : connStatus() === "error"
          ? "bg-danger"
          : "bg-subtle";

  return (
    <Card raised role="region" aria-labelledby={titleId} class="overflow-hidden">
      <div class="px-3.5 pt-3.5 pb-2.5 flex items-center gap-2">
        {/* Status leads the heading, the way the other sidebar widgets label
            themselves: quiet uppercase, dot first, one action at the far right. */}
        <Show when={booted() && auth()?.isLoggedIn}>
          <span
            class={`w-1.5 h-1.5 shrink-0 rounded-full ${statusDotClass()}`}
            title={connLabel()}
            aria-hidden="true"
          />
        </Show>
        <h3
          id={titleId}
          title={t("ui.notifications_title")}
          class="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wider text-muted"
        >
          {t("ui.notifications_title")}
        </h3>
        <Show when={booted() && auth()?.isLoggedIn}>
          <IconButton
            label={`${t("ui.refresh")} · ${connLabel()}`}
            size="sm"
            onClick={manualRefresh}
            disabled={refreshing()}
          >
            <MdFillRefresh class={`w-4 h-4 ${refreshing() ? "animate-spin" : ""}`} />
          </IconButton>
        </Show>
      </div>

      <Show when={!booted()}>
        <div class="p-2 space-y-1.5" role="status" aria-label={t("ui.loading")}>
          <For each={[1, 2, 3]}>
            {() => <Skeleton class="h-9 w-full" rounded="lg" />}
          </For>
        </div>
      </Show>

      <Show when={!auth.loading && !auth()?.isLoggedIn}>
        <EmptyState size="sm" icon={<MdFillNotifications />}>
          {t("ui.sign_in_notifs")}
        </EmptyState>
      </Show>

      <Show when={booted() && auth()?.isLoggedIn}>
        <div class="px-1.5 pb-1.5">
          <Show when={systemNotices().length > 0}>
            <div class="space-y-1 px-1 pb-1.5">
              <For each={systemNotices()}>
                {(n) => <Banner tone="info">{n.message}</Banner>}
              </For>
            </div>
          </Show>

          <Show
            when={activeBuckets().length > 0}
            fallback={
              <EmptyState size="sm" class="py-2">
                {t("ui.no_notifications")}
              </EmptyState>
            }
          >
            <For each={activeBuckets()}>
              {(key) => (
                <StreamGroup
                  id={key}
                  bucket={buckets[key]}
                  label={sectionLabel(key)}
                  href={sectionHref(key)}
                  countLimit={notifyCountLimit()}
                  open={openGroup() === key}
                  onToggle={() => toggleGroup(key)}
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
                    // Buckets core has no markRead branch for (files,
                    // intros, register) fall through its switch and
                    // clear nothing, so route those through sse_rmids
                    // on the rows we hold instead of zeroing a count
                    // the server will hand straight back.
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
                  onOpenModal={(uuid) => openPost(uuid)}
                />
              )}
            </For>
          </Show>

          <NoticesGroup
            open={openGroup() === "notices"}
            onToggle={() => toggleGroup("notices")}
            entries={noticesFeed()}
            loading={noticesFeed.loading}
            error={noticesFeed.error}
            onRetry={() => refetchNotices()}
            onOpenModal={openPost}
          />

          <Show when={otherChannels().length > 0}>
            <OtherChannelsGroup
              channels={otherChannels()}
              open={openGroup() === "channels"}
              onToggle={() => toggleGroup("channels")}
            />
          </Show>

          <Show
            when={
              auth()?.isLocal &&
              (isAdmin() || (announcements()?.length ?? 0) > 0)
            }
          >
            <AnnouncementsGroup
              list={announcements() ?? []}
              loading={announcements.loading}
              isAdmin={isAdmin()}
              open={openGroup() === "announcements"}
              onToggle={() => toggleGroup("announcements")}
              hasNew={hasNewAnnouncements()}
              onCreate={createAnnouncement}
              onDelete={deleteAnnouncement}
            />
          </Show>

          <div class="mt-1 border-t border-rim/60 px-2 pb-0.5 pt-2 flex items-center gap-2">
            <a
              href="/notifications"
              onClick={(e) => {
                e.preventDefault();
                navigate("/notifications");
              }}
              class="text-[0.6875rem] text-accent-txt hover:underline"
            >
              {t("hq.view_all")}
            </a>
            {/* The header keeps one action (refresh); the global clear lives
                here so the title can spell itself out in every locale at the
                sidebar's 256px, and next to "View all" it is where a reader
                already looks to leave the panel. */}
            <Show when={hasAnyCount()}>
              <button
                type="button"
                onClick={markAllRead}
                class="ml-auto text-[0.6875rem] text-muted hover:text-txt transition-colors"
              >
                {t("ui.mark_all_read")}
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </Card>
  );
}
