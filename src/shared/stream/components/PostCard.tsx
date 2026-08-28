// src/shared/stream/components/PostCard.tsx
import {
  createSignal,
  createEffect,
  untrack,
  onMount,
  onCleanup,
  lazy,
  Show,
  For,
  type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import { openShare } from "@utsukta/spa-core/store/share";
import { shareTargetForPost } from "@/shared/lib/shareLinks";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";
import AuthorPopover from "./AuthorPopover";
import { PlatformIcon, networkBadge } from "./PlatformIcons";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import { countAllComments, isRootPost } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "../types";
import CommentThread from "@/shared/views/CommentThread";
import formatPostDate from "@utsukta/spa-core/lib/date";
import { markItemSeen } from "@utsukta/spa-core/lib/markSeen";
import { scrollHighlightIntoView } from "@utsukta/spa-core/lib/scrollHighlightIntoView";
import { useCommentOrder } from "@utsukta/spa-core/store/comment-order";
import {
  MdFillBar_chart,
  MdFillChat,
  MdFillKeyboard_arrow_down,
  MdFillKeyboard_arrow_up,
  MdFillShare,
  MdFillThumb_down,
  MdFillThumb_up,
  MdOutlineShare,
  MdOutlineThumb_down,
  MdOutlineThumb_up,
  MdFillStar,
  MdFillStar_border,
  MdOutlineDelete,
  MdOutlineRefresh,
  MdOutlineCloud_download,
  MdFillNotifications,
  MdOutlineNotifications_none,
  MdOutlineCode,
  MdOutlineEdit,
  MdOutlineReply,
  MdFillFolder,
  MdFillFolder_open,
  MdFillAdd,
  MdFillUnfold_more,
  MdFillMore_vert,
  MdOutlineSend,
  MdOutlineLocation_on,
  MdOutlineTimer,
  MdOutlineSchedule,
  MdOutlineCheck,
  MdOutlineClose,
  MdOutlineFlag,
  MdFillPush_pin,
  MdOutlinePush_pin,
  MdOutlineVisibility,
  MdOutlineEvent,
} from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { BiRegularLinkExternal, BiSolidShareAlt } from "solid-icons/bi";
import { isDirectMessage as isDM, DmBadge, DmRecipientsPC, DmRecipients } from "./DmMeta";
import LockviewPopover from "./LockviewPopover";
const CommentComposer = lazy(
  () => import("@/shared/editor/composers/CommentComposer"),
);
import RichEditor from "@/shared/editor/core/RichEditor";
import SourceToggleButton from "@/shared/editor/components/SourceToggleButton";
import { CAPABILITIES } from "@/shared/editor/types/editor.types";
import type { EditorTab, MimeType } from "@/shared/editor/types/editor.types";
const PostComposer = lazy(
  () => import("@/shared/editor/composers/PostComposer"),
);
import DOMPurify from "dompurify";
import { handleNsfwToggleClick } from "@utsukta/spa-core/lib/nsfw";
import { handleDecryptClick } from "@utsukta/spa-core/lib/decrypt-click";
import { fetchPendingReactions, type PendingItem } from "@/modules/moderate/api";
import {
  ensurePendingModeration,
  pendingReactionMids,
  refreshPendingModeration,
} from "@/modules/moderate/store";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import {
  apiFollowPost,
  apiUnfollowPost,
  apiFetchItemFolders,
  apiSaveToFolder,
  apiFetchComposeSource,
  apiAddToCalendar,
} from "@utsukta/spa-core/lib/item-api";
import { fetchFolders } from "@/modules/network/api";
import EventCard from "./EventCard";
import PollCard from "./PollCard";
import { parseEventData } from "@utsukta/spa-core/lib/activity.mapper";
import type { EventData } from "@utsukta/spa-core/types/post.types";
import AttachmentList from "./AttachmentList";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { usePlyr } from "@utsukta/spa-core/lib/usePlyr";
import { useNavData } from "@utsukta/spa-core/store/nav-store";
import { useOsmMap } from "@utsukta/spa-core/lib/useOsmMap";
import { DEFAULT_TMS, osmLink, osmSearchLink, parseCoord } from "@utsukta/spa-core/lib/osm";
import { fetchEvents, type CalEvent } from "@/modules/calendar/api";
import { toast } from "@utsukta/spa-core/store/toast";
import { postHeightPx } from "@utsukta/spa-core/store/post-height";
const PostDetailModal = lazy(() => import("@/shared/views/PostDetailModal"));
const EventCreatorModal = lazy(() => import("@/modules/calendar/widgets/EventCreatorModal"));

export type { StreamHandlers as PostActions };

function subtreeContainsUuid(nodes: ThreadNode[], uuid: string): boolean {
  for (const node of nodes) {
    if (node.uuid === uuid) return true;
    if (subtreeContainsUuid(node.children, uuid)) return true;
  }
  return false;
}

// Persists across remounts caused by setNodeChildren updating the post reference.
const openedByMid = new Set<string>();

function InlineEditForm(props: {
  body: string;
  onBodyChange: (v: string) => void;
  title?: string;
  onTitleChange?: (v: string) => void;
  showTitle: boolean;
  tab: EditorTab;
  onTabChange: (t: EditorTab) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  minHeight: string;
}) {
  const { t } = useI18n();
  return (
    <div class="mt-2 space-y-2">
      <Show when={props.showTitle}>
        <input
          type="text"
          value={props.title ?? ""}
          onInput={(e) => props.onTitleChange?.(e.currentTarget.value)}
          placeholder={t("editor.title_placeholder")}
          class="w-full px-2 py-1.5 text-sm font-medium rounded-lg border border-rim bg-surface text-txt outline-none focus:border-rim-strong"
        />
      </Show>
      <RichEditor
        body={props.body}
        onInput={props.onBodyChange}
        capabilities={CAPABILITIES.comment}
        tab={props.tab}
        onTabChange={props.onTabChange}
        onCtrlEnter={props.onSave}
        minHeight={props.minHeight}
      />
      <div class="flex justify-end">
        <SourceToggleButton
          tab={props.tab}
          onToggle={() => props.onTabChange(props.tab === "wysiwyg" ? "source" : "wysiwyg")}
        />
      </div>
      <Show when={props.error}>
        <div class="text-xs text-red-500">{props.error}</div>
      </Show>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          class="px-3 py-1 text-xs rounded-lg border border-rim text-muted hover:bg-elevated transition-colors"
        >
          {t("editor.cancel_btn")}
        </button>
        <button
          type="button"
          onClick={props.onSave}
          disabled={props.saving || !props.body.trim()}
          class="px-3 py-1 text-xs font-medium rounded-lg bg-accent text-accent-fg
                 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {props.saving ? t("editor.saving") : t("editor.save_changes")}
        </button>
      </div>
    </div>
  );
}

export default function PostCard(props: {
  post: ThreadNode;
  handlers: StreamHandlers;
  onSeen?: (uuid: string) => void;
  compact?: boolean;
  highlighted?: boolean;
  highlightUuid?: string;
  postAuthorAddress?: string;
  initiallyExpanded?: boolean;
  seamless?: boolean;
  expandAll?: boolean;
  onViewContext?: () => void;
  // Thread root's uuid, threaded down through nested CommentThread → PostCard
  // instances. Unset means THIS card is the root (top-level post); set means
  // this card is a comment, and (threaded mode only) "load more" on it pages
  // that comment's own reply branch rather than the thread's root comments.
  rootUuid?: string;
  // Rendered right after the comment thread (and its "load more" button, if
  // shown) — e.g. PostDetailModal's "viewing a comment in context" banner,
  // which needs to sit where the viewer's scroll position actually is (past
  // the comments) rather than at the top of the post, off-screen once
  // they've scrolled down to the highlighted comment. Only meaningful on the
  // root (full, non-compact) layout.
  contextBanner?: JSX.Element;
}) {
  const [replyOpen, setReplyOpen] = createSignal(false);
  const [replyQuote, setReplyQuote] = createSignal("");
  const [reshareOpen, setReshareOpen] = createSignal(false);
  const [showComments, setShowComments] = createSignal(
    !!props.initiallyExpanded ||
      openedByMid.has(props.post.mid) ||
      (!props.compact && !!props.highlightUuid) ||
      (!!props.compact &&
        !!props.highlightUuid &&
        subtreeContainsUuid(props.post.children, props.highlightUuid)),
  );
  const [commentsLoaded, setCommentsLoaded] = createSignal(
    props.post.children.length > 0,
  );
  const [commentsLoading, setCommentsLoading] = createSignal(false);
  // Derived, not local state: only ever meaningful on the thread root (only
  // top-level comments are paginated — see actions-store's appendNodeChildren).
  const commentsOffset = () => props.post.commentsOffset ?? 0;
  const [loadingMoreComments, setLoadingMoreComments] = createSignal(false);
  const commentOrder = useCommentOrder();
  const [deleteConfirming, setDeleteConfirming] = createSignal(false);
  // A card with no rootUuid IS the thread root; comments always get one
  // threaded down to them (see the rootUuid prop docs above).
  const isComment = () => !!props.rootUuid;
  // Non-null while the edit composer is open, holding its seed fields.
  const [editSeed, setEditSeed] = createSignal<{
    body: string;
    title: string;
    summary: string;
    /** undefined = the item's categories could not be loaded, so the composer must
     *  not claim authority over them on save. Distinct from "" (genuinely none). */
    category: string | undefined;
    mimetype: MimeType;
  } | null>(null);
  const [editSourceLoading, setEditSourceLoading] = createSignal(false);
  const [isEditing, setIsEditing] = createSignal(false);
  const [editBody, setEditBody] = createSignal("");
  const [editTitle, setEditTitle] = createSignal("");
  const [editTab, setEditTab] = createSignal<EditorTab>("wysiwyg");
  const [editSaving, setEditSaving] = createSignal(false);
  const [editError, setEditError] = createSignal<string | null>(null);
  const [editingEvent, setEditingEvent] = createSignal<CalEvent | null>(null);
  const [eventEditLoading, setEventEditLoading] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [following, setFollowing] = createSignal(
    props.post.viewerFollowing ?? false,
  );
  const [followPending, setFollowPending] = createSignal(false);
  const {
    open: repeatDropdownOpen,
    setOpen: setRepeatDropdownOpen,
    toggle: toggleRepeatDropdown,
    floatStyle: repeatDropdownStyle,
    setTriggerRef: setRepeatDropdownRef,
    setPanelRef: setRepeatDropdownPanelRef,
  } = useDropdown({ placement: "bottom-start", offset: 4 });
  const {
    open: moreDropdownOpen,
    setOpen: setMoreDropdownOpen,
    toggle: openMoreDropdown,
    floatStyle: moreDropdownStyle,
    setTriggerRef: setMoreDropdownRef,
    setPanelRef: setMoreDropdownPanelRef,
  } = useDropdown({ placement: "bottom-end", offset: 4 });
  const [showStats, setShowStats] = createSignal(false);
  const [statsLoading, setStatsLoading] = createSignal(false);
  const [statsData, setStatsData] = createSignal<{
    likes: StatActor[];
    dislikes: StatActor[];
    repeats: StatActor[];
  } | null>(null);
  const [showSource, setShowSource] = createSignal(false);
  const [sourceLoading, setSourceLoading] = createSignal(false);
  const [sourceData, setSourceData] = createSignal<unknown>(null);
  const [rssImporting, setRssImporting] = createSignal(false);
  const [rssImportedUuid, setRssImportedUuid] = createSignal<string | null>(
    null,
  );
  const [showFolderPicker, setShowFolderPicker] = createSignal(false);
  const [itemFolders, setItemFolders] = createSignal<string[]>([]);
  const [allFolders, setAllFolders] = createSignal<string[]>([]);
  const [folderPickerLoading, setFolderPickerLoading] = createSignal(false);
  const [folderSaving, setFolderSaving] = createSignal<string | null>(null);
  const [newFolderInput, setNewFolderInput] = createSignal("");
  const [showDeliveryReport, setShowDeliveryReport] = createSignal(false);
  const [deliveryReportLoading, setDeliveryReportLoading] = createSignal(false);
  const [deliveryReportData, setDeliveryReportData] = createSignal<
    DeliveryEntry[] | null
  >(null);
  let deleteTimer: ReturnType<typeof setTimeout> | null = null;
  const { locale, t } = useI18n();
  const auth = useAuth();
  let cardRef!: HTMLDivElement;
  const [bodyRef, setBodyRef] = createSignal<HTMLElement>();
  const navData = useNavData();
  usePlyr(bodyRef, () => props.post.body);
  useOsmMap(bodyRef, () => props.post.body, () => props.post.coord);
  const [bodyExpanded, setBodyExpanded] = createSignal(false);
  const [bodyOverflows, setBodyOverflows] = createSignal(false);
  // Read-only on purpose: bodyRef is the *inner* body div — the collapse
  // max-height lives on its parent — so its scrollHeight is already the
  // natural height. Writing max-height here just to read it back invalidated
  // layout on every call, and this runs per card on mount plus once per image
  // load, turning a feed scroll into a burst of forced synchronous reflows.
  const checkBodyOverflow = () => {
    const el = bodyRef();
    if (!el) return;
    const max = postHeightPx();
    setBodyOverflows(max > 0 && el.scrollHeight > max);
  };
  // Captured on mouseup (while the selection still exists) rather than on the
  // Reply click itself — clicking the Reply button collapses the selection
  // before its own click handler runs.
  let lastSelectedText = "";
  function handleBodyMouseUp() {
    const text = window.getSelection()?.toString().trim();
    if (text) lastSelectedText = text;
  }
  function openReply() {
    const opening = !replyOpen();
    if (opening) {
      setReplyQuote(
        lastSelectedText
          ? `[quote=${props.post.authorName}]${lastSelectedText}[/quote]\n`
          : "",
      );
      lastSelectedText = "";
    }
    setReplyOpen(opening);
  }

  // Detect event posts: prefer pre-parsed eventData from mapper, fall back to
  // parsing the body directly (handles cases where obj_type wasn't "Event").
  const isUnseen = () => props.post.flags.includes("unseen");
  // Scheduling and expiry are the author's own housekeeping — nobody else's business.
  const isOwn = () => {
    const a = auth();
    if (!a?.isLocal || !a.nick) return false;
    return props.post.authorAddress === `${a.nick}@${window.location.hostname}`;
  };
  const isExpired = () => isOwn() && props.post.flags.includes("expired");
  // Expiry set and still in the future — the post will self-destruct.
  const isExpiring = () =>
    isOwn() &&
    !isExpired() &&
    !!props.post.expires &&
    new Date(props.post.expires + "Z").getTime() > Date.now();
  const expiresTitle = () =>
    `${t("post.expires")}: ${new Date(props.post.expires! + "Z").toLocaleString(locale())}`;
  // Delayed publish — created holds the future publish time until the cron fires.
  const isScheduled = () => isOwn() && props.post.flags.includes("scheduled");
  const scheduledTitle = () =>
    `${t("post.scheduled_title")}: ${new Date(props.post.created + "Z").toLocaleString(locale())}`;
  // item_private === 2 — a direct message between individuals (classic Hubzilla's
  // bi-envelope lock icon), distinct from a merely-private post (item_private === 1).
  const isDirectMessage = () => isDM(props.post);
  // Core's openstreetmap addon (render_location hook) links a post's
  // coordinates to the map and a bare place name to a Nominatim search;
  // mirror that, against whatever tile server the addon is configured with.
  const locationHref = () => {
    const c = props.post.coord ? parseCoord(props.post.coord) : null;
    if (c) return osmLink(c, navData()?.osm?.zoom ?? 16, navData()?.osm?.tmsserver || DEFAULT_TMS);
    return props.post.location ? osmSearchLink(props.post.location) : undefined;
  };
  const isRepeat = () => props.post.verb === "Announce";
  const authorAddressLabel = () =>
    props.post.authorAddress || networkBadge(props.post.authorNetwork)?.label;
  const editedAt = () =>
    props.post.edited && props.post.edited !== props.post.created
      ? props.post.edited
      : undefined;

  const eventData = () =>
    props.post.eventData ??
    (props.post.body.includes("[event-summary]")
      ? parseEventData(props.post.body)
      : undefined);

  // While more comment pages remain unfetched, trust a stable total rather
  // than counting only what's loaded so far — otherwise the badge visibly
  // shrinks (e.g. "20" instead of "150") the moment the first page loads.
  // That stable total is commentsTotal (this comment's own branch size) for
  // a nested comment, or commentCount (the server aggregate) for the thread
  // root — commentCount alone is NOT enough here, since it's structurally
  // unreliable for non-root rows (see Post.commentCount's doc comment) and
  // reads as 0 for a nested comment with pending replies, which used to hide
  // its entire reply-count/expand toggle (and the "load more" chain under it)
  // until "expand all" was used instead. Once fully loaded, recount locally
  // so optimistically-added comments (handleComment's temp node) show up
  // instantly.
  const totalComments = () =>
    props.post.hasMoreComments
      ? (props.post.commentsTotal ?? props.post.commentCount ?? 0)
      : props.post.children.length > 0
        ? countAllComments(props.post.children)
        : (props.post.commentsTotal ?? props.post.commentCount ?? 0);

  // Folder: local users only, post must be in their stream (iid present)
  const canFolder = () => auth()?.isLocal === true && !!props.post.iid;
  const hasFolders = () => itemFolders().length > 0;

  // Star: only meaningful for local authenticated users
  const canStar = () => !!props.handlers.onStar && auth()?.isLocal === true;

  // Add to calendar: any local authenticated viewer of an event post — mirrors
  // EventCard's canRsvp() gate, independent of RSVPing.
  const canAddToCalendar = () =>
    auth()?.isLocal === true && !!props.post.uuid && !!eventData();
  const [addingToCal, setAddingToCal] = createSignal(false);
  async function addToCalendar() {
    if (addingToCal() || !props.post.uuid) return;
    setMoreDropdownOpen(false);
    setAddingToCal(true);
    try {
      await apiAddToCalendar(props.post.uuid);
      toast.success(t("post.added_to_calendar"));
    } catch {
      toast.error(t("post.add_to_calendar_failed"));
    } finally {
      setAddingToCal(false);
    }
  }

  // Pin: channel wall owner only, top-level non-private posts (backend
  // re-validates this — these are UI-visibility gates, not the source of truth).
  const canPin = () =>
    !!props.handlers.onPin &&
    ownsStreamCopy() &&
    props.post.item_thread_top === 1 &&
    !isPrivate();
  const isPinned = () => props.post.pinned ?? false;
  // Only meaningful for top-level array entries: buildThreadTree() already nests
  // real comments as .children, so a non-root node only reaches here in a flat
  // (nouveau/unthreaded) listing where it was surfaced as a standalone item.
  const isFlatReply = () => !props.compact && !isRootPost(props.post);
  function onPinClick() {
    props.handlers.onPin?.(props.post.mid);
    setMoreDropdownOpen(false);
  }

  // Follow: local users on thread-top posts only — core attaches the
  // Follow/Ignore state to the thread top (mirrors thread_action_menu()).
  const canFollow = () =>
    auth()?.isLocal === true &&
    !!props.post.uuid &&
    (props.post.item_thread_top === 1 || props.post.mid === props.post.top_mid);

  // Reshare: only local users can reshare posts that have a local iid.
  // Private posts can't be reshared at all (the server refuses to embed or
  // announce them), so their reshare controls are hidden entirely.
  const isPrivate = () => props.post.flags?.includes("private") ?? false;
  const canReshare = () => auth()?.isLocal === true && !!props.post.iid;

  // Like/dislike/plain-repeat/reply all federate against the existing item
  // (backend accepts local_channel() or remote_channel()) — any logged-in
  // viewer can use them, not just native local users.
  const canInteract = () => auth()?.isLoggedIn === true;

  const canViewSource = () => auth()?.isLocal === true && !!props.post.iid;

  const canDeliveryReport = () => {
    const a = auth();
    if (!a?.isLocal || !a.nick) return false;
    const viewerAddr = `${a.nick}@${window.location.hostname}`;
    return (
      !!props.post.authorAddress && props.post.authorAddress === viewerAddr
    );
  };

  // True authorship: viewer's own channel address matches the post's author.
  const isTrueAuthor = () => {
    const a = auth();
    if (!a?.isLocal || !a.nick) return false;
    const viewerAddr = `${a.nick}@${window.location.hostname}`;
    return (
      !!props.post.authorAddress && props.post.authorAddress === viewerAddr
    );
  };

  // Own stream copy: this row lives under the viewer's own uid (their own
  // Network stream or wall), even if they didn't author it. The backend
  // removes it locally only in this case, never federating the delete.
  const ownsStreamCopy = () => {
    const a = auth();
    return !!a && a.uid > 0 && props.post.profileUid === a.uid;
  };

  // Delete: viewer must be a local user, and either the true author/owner,
  // merely own this stream copy, or a site admin (see isLocalOnlyDelete /
  // isAdminOnlyDelete for the label split).
  const canDelete = () => {
    if (!props.handlers.onDelete) return false;
    return isTrueAuthor() || ownsStreamCopy() || auth()?.isAdmin === true;
  };

  const isLocalOnlyDelete = () => ownsStreamCopy() && !isTrueAuthor();
  const isAdminOnlyDelete = () =>
    !isTrueAuthor() && !ownsStreamCopy() && auth()?.isAdmin === true;

  const deleteLabel = () =>
    isAdminOnlyDelete()
      ? t("post.admin_delete")
      : isLocalOnlyDelete()
        ? t("post.remove_from_feed")
        : t("post.delete");

  const deleteConfirmLabel = () =>
    isAdminOnlyDelete()
      ? t("post.confirm_admin_delete")
      : isLocalOnlyDelete()
        ? t("post.confirm_remove_from_feed")
        : t("post.confirm_delete");

  // Moderate: this row is stuck pending approval (item_blocked = ITEM_MODERATED
  // — see Api/Handlers/Moderate.php) on a channel the viewer owns.
  const canModerate = () =>
    (!!props.handlers.onApprove || !!props.handlers.onReject) &&
    ownsStreamCopy() &&
    props.post.flags.includes("pending_moderation");
  const [moderating, setModerating] = createSignal(false);
  async function onApproveClick() {
    setMoreDropdownOpen(false);
    if (!props.post.iid || moderating()) return;
    setModerating(true);
    try {
      await props.handlers.onApprove?.(props.post.iid);
    } finally {
      setModerating(false);
    }
  }
  async function onRejectClick() {
    setMoreDropdownOpen(false);
    if (!props.post.iid || moderating()) return;
    setModerating(true);
    try {
      await props.handlers.onReject?.(props.post.iid);
    } finally {
      setModerating(false);
    }
  }

  // Pending reactions (Like/Dislike/Announce): unlike comments, these never
  // render as their own thread row (core only ever surfaces reaction counts,
  // not individual reaction items) — so instead of an inline badge, the
  // owner gets a folder-picker-style panel listing whatever's queued. The
  // channel-wide queue (moderate/store) says which rows have anything pending,
  // so the flag stays hidden rather than opening an empty panel.
  const mayModerateReactions = () =>
    (!!props.handlers.onApprove || !!props.handlers.onReject) && ownsStreamCopy();
  createEffect(() => {
    if (mayModerateReactions()) ensurePendingModeration();
  });
  const canReactionQueue = () =>
    mayModerateReactions() && pendingReactionMids().has(props.post.mid);
  const [showReactionQueue, setShowReactionQueue] = createSignal(false);
  const [reactionQueueLoading, setReactionQueueLoading] = createSignal(false);
  const [reactionQueue, setReactionQueue] = createSignal<PendingItem[]>([]);
  const [reactionQueueBusy, setReactionQueueBusy] = createSignal<number | null>(null);

  async function toggleReactionQueue() {
    const next = !showReactionQueue();
    setShowReactionQueue(next);
    if (!next) return;
    setReactionQueueLoading(true);
    try {
      setReactionQueue(await fetchPendingReactions(props.post.mid));
    } finally {
      setReactionQueueLoading(false);
    }
  }

  async function resolveQueuedReaction(iid: number, approve: boolean) {
    if (reactionQueueBusy()) return;
    setReactionQueueBusy(iid);
    try {
      await (approve ? props.handlers.onApprove : props.handlers.onReject)?.(iid);
      setReactionQueue((prev) => prev.filter((r) => r.iid !== iid));
      refreshPendingModeration();
    } finally {
      setReactionQueueBusy(null);
    }
  }

  // Edit: same author-address gate as delete
  const canEdit = () => {
    return !!props.handlers.onEdit && !!props.post.authorAddress && isOwn();
  };

  async function startEdit() {
    setMoreDropdownOpen(false);
    // Event posts carry structured date/time/location in the `event` table,
    // which the generic body/title editor below never touches — route to
    // the calendar's real edit form instead so those fields stay in sync.
    const evData = eventData();
    if (evData) {
      startEventEdit(evData);
      return;
    }

    const initialBody = props.post.rawBody ?? "";

    // Top-level posts reopen in the full composer, seeded from the server's
    // compose source so every field it shows (categories especially) round-
    // trips instead of being wiped on save. Comments keep the inline form —
    // categories and privacy belong to the thread, not to a reply.
    if (!isComment()) {
      if (editSourceLoading()) return;
      setEditSourceLoading(true);
      // A failed fetch still opens the composer, just seeded from what the
      // card already rendered — degraded, but the user isn't stuck.
      const src = await apiFetchComposeSource(props.post.uuid).catch(() => null);
      setEditSourceLoading(false);
      // Categories only exist in the compose source, so without it we don't know
      // them. Seed `undefined` rather than "" so the composer omits the key on save
      // and the server keeps whatever is stored — seeding "" would delete them all.
      if (!src) toast.error(t("post.edit_source_degraded"));
      setEditSeed({
        body: src?.body || initialBody,
        title: src?.title ?? props.post.title ?? "",
        summary: src?.summary ?? props.post.summary ?? "",
        category: src?.category,
        mimetype: (src?.mimetype as MimeType) ?? "text/bbcode",
      });
      return;
    }

    setEditTitle(props.post.title ?? "");
    setEditBody(initialBody);
    setEditTab("wysiwyg");
    setEditError(null);
    setIsEditing(true);
    // Upgrade to the server's compose source, which collapses [share …]
    // blocks to compact [share=<id>] tags the editor can round-trip. Skip
    // if the user already started typing meanwhile.
    // Body-only upgrade: the inline editor never sends `category`, so a failed
    // fetch here is harmless — it just leaves the already-rendered body in place.
    apiFetchComposeSource(props.post.uuid)
      .then((src) => {
        if (src?.body && editBody() === initialBody) {
          setEditBody(src.body);
        }
      })
      .catch(() => {});
  }

  // Event posts only expose the event_hash (`[event-id]`) in the feed body —
  // the calendar edit endpoint needs the numeric event.id, so resolve it via
  // a lookup scoped to the event's own start/finish (parsed from the same
  // post body). fetchEvents()'s no-range default is "now → +60 days", which
  // misses any event that already ended — asking for the event's own known
  // window instead works for past and future events alike.
  async function startEventEdit(evData: EventData) {
    if (eventEditLoading()) return;
    const nick = auth()?.nick;
    if (!nick) return;
    setEventEditLoading(true);
    try {
      const toDay = (iso: string, deltaDays: number) => {
        const d = new Date(iso.replace(" ", "T") + "Z");
        if (isNaN(d.getTime())) return undefined;
        d.setUTCDate(d.getUTCDate() + deltaDays);
        return d.toISOString().slice(0, 10);
      };
      const start = toDay(evData.start, -1);
      const end = toDay(evData.finish || evData.start, 1);
      const range = start && end ? { start, end } : undefined;
      const events = await fetchEvents(nick, range);
      const found = events.find((e) => e.uri === evData.id);
      if (!found) {
        toast.error(t("post.event_edit_unavailable"));
        return;
      }
      setEditingEvent(found);
    } catch {
      toast.error(t("post.event_edit_failed"));
    } finally {
      setEventEditLoading(false);
    }
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditError(null);
  }

  async function saveEdit() {
    const body = editBody().trim();
    if (!body) return;
    setEditSaving(true);
    setEditError(null);
    try {
      // No `category` key — the inline editor doesn't show categories, and
      // omitting it tells the server to leave the item's own untouched.
      await props.handlers.onEdit?.(props.post.mid, {
        body,
        title: editTitle().trim(),
      });
      setIsEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Edit failed");
    } finally {
      setEditSaving(false);
    }
  }

  function persistShow(v: boolean) {
    if (v) openedByMid.add(props.post.mid);
    else openedByMid.delete(props.post.mid);
    setShowComments(v);
  }

  async function toggleComments() {
    if (!showComments() && !commentsLoaded() && totalComments() > 0) {
      persistShow(true);
      setCommentsLoading(true);
      try {
        await props.handlers.onLoadComments(props.post.mid, props.post.uuid);
        setCommentsLoaded(true);
      } finally {
        setCommentsLoading(false);
      }
    } else {
      persistShow(!showComments());
    }
  }

  async function loadMoreComments() {
    if (!props.handlers.onLoadMoreComments || loadingMoreComments()) return;
    setLoadingMoreComments(true);
    try {
      const isRoot = props.rootUuid === undefined;
      const rootUuid = props.rootUuid ?? props.post.uuid;
      await props.handlers.onLoadMoreComments(
        rootUuid, props.post.mid, isRoot, commentsOffset(), commentOrder(),
      );
    } finally {
      setLoadingMoreComments(false);
    }
  }

  function handleBodyClick(e: MouseEvent) {
    if (handleNsfwToggleClick(e)) return;
    if (handleDecryptClick(e)) return;
  }

  onMount(() => {
    if (props.highlighted && props.compact) {
      onCleanup(scrollHighlightIntoView(cardRef));
    }

    const uuid = props.post.uuid;
    if (!uuid) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          markItemSeen(uuid);
          props.onSeen?.(uuid);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(cardRef);
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    if (props.compact || props.seamless) return;
    postHeightPx(); // re-measure when the user changes the setting
    checkBodyOverflow();
    const imgs = bodyRef()?.querySelectorAll("img");
    imgs?.forEach((img) => {
      if (!img.complete)
        img.addEventListener("load", checkBodyOverflow, { once: true });
    });
  });

  onCleanup(() => {
    if (deleteTimer) clearTimeout(deleteTimer);
  });

  function openRepeatDropdown(e: MouseEvent) {
    e.stopPropagation();
    toggleRepeatDropdown();
  }

  const isRss = () =>
    props.post.authorNetwork === "rss" && !!props.post.permalink;

  async function handleRssImport() {
    if (rssImporting()) return;
    setRssImporting(true);
    try {
      const res = await apiFetch(
        `/spa/search/import?url=${encodeURIComponent(props.post.permalink)}`,
      );
      const body = await res.json();
      if (res.ok && body?.data?.uuid) {
        setRssImportedUuid(body.data.uuid);
      }
    } finally {
      setRssImporting(false);
    }
  }

  async function toggleFolderPicker() {
    const next = !showFolderPicker();
    setShowFolderPicker(next);
    if (!next) return;
    setFolderPickerLoading(true);
    try {
      const [item, all] = await Promise.all([
        apiFetchItemFolders(props.post.uuid),
        fetchFolders(),
      ]);
      setItemFolders(item);
      setAllFolders(all);
    } finally {
      setFolderPickerLoading(false);
    }
  }

  async function toggleFolder(name: string) {
    if (folderSaving()) return;
    const isIn = itemFolders().includes(name);
    setFolderSaving(name);
    try {
      const updated = await apiSaveToFolder(props.post.uuid, name, isIn);
      setItemFolders(updated);
      // Add newly created folder to the all-folders list if not present
      if (!isIn && !allFolders().includes(name)) {
        setAllFolders((prev) => [...prev, name].sort());
      }
    } finally {
      setFolderSaving(null);
    }
  }

  async function addNewFolder() {
    const name = newFolderInput().trim();
    if (!name) return;
    setNewFolderInput("");
    await toggleFolder(name);
  }

  function onLike() {
    props.handlers.onLike(props.post.mid);
  }
  function onDislike() {
    props.handlers.onDislike(props.post.mid);
  }
  function onRepeat() {
    props.handlers.onRepeat(props.post.mid);
  }
  function onStar() {
    props.handlers.onStar?.(props.post.mid);
  }

  async function onRefresh() {
    if (refreshing() || !props.handlers.onRefresh) return;
    setRefreshing(true);
    try {
      await props.handlers.onRefresh(props.post.mid, props.post.uuid);
    } finally {
      setRefreshing(false);
    }
  }

  async function onFollowToggle() {
    if (!props.post.uuid || followPending()) return;
    const next = !following();
    setFollowing(next);
    setFollowPending(true);
    try {
      await (next
        ? apiFollowPost(props.post.uuid)
        : apiUnfollowPost(props.post.uuid));
    } catch {
      setFollowing(!next);
    } finally {
      setFollowPending(false);
    }
  }

  async function toggleStats() {
    if (showStats()) {
      setShowStats(false);
      return;
    }
    setShowStats(true);
    if (statsData()) return;
    setStatsLoading(true);
    try {
      const uuid = encodeURIComponent(props.post.uuid);
      const base = `/spa/item/${uuid}`;
      const [likesRes, dislikesRes, repeatsRes] = await Promise.all([
        fetch(`${base}/likes`, { credentials: "include" }),
        fetch(`${base}/dislikes`, { credentials: "include" }),
        fetch(`${base}/repeats`, { credentials: "include" }),
      ]);
      const parse = async (res: Response): Promise<StatActor[]> => {
        if (!res.ok) return [];
        const data = await res.json();
        const arr = Array.isArray(data)
          ? data
          : (data?.reactions ?? data?.result ?? []);
        return arr.map((a: any) => ({
          name: a.name ?? t("post.unknown"),
          avatar: a.photo ?? undefined,
          url: a.url ?? undefined,
        }));
      };
      const [likes, dislikes, repeats] = await Promise.all([
        parse(likesRes),
        parse(dislikesRes),
        parse(repeatsRes),
      ]);
      setStatsData({ likes, dislikes, repeats });
    } finally {
      setStatsLoading(false);
    }
  }

  async function toggleSource() {
    if (showSource()) {
      setShowSource(false);
      return;
    }
    setShowSource(true);
    if (sourceData()) return;
    setSourceLoading(true);
    try {
      const res = await fetch(`/spa/item-source/${props.post.iid}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setSourceData(await res.json());
    } catch (e) {
      setSourceData({ error: String(e) });
    } finally {
      setSourceLoading(false);
    }
  }

  async function toggleDeliveryReport() {
    if (showDeliveryReport()) {
      setShowDeliveryReport(false);
      return;
    }
    setShowDeliveryReport(true);
    if (deliveryReportData()) return;
    setDeliveryReportLoading(true);
    try {
      const res = await fetch(
        `/spa/item/${encodeURIComponent(props.post.uuid)}/delivery`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setDeliveryReportData(json?.data ?? []);
    } catch {
      setDeliveryReportData([]);
    } finally {
      setDeliveryReportLoading(false);
    }
  }

  function onDeleteClick() {
    if (!deleteConfirming()) {
      setDeleteConfirming(true);
      deleteTimer = setTimeout(() => setDeleteConfirming(false), 3000);
    } else {
      if (deleteTimer) clearTimeout(deleteTimer);
      setDeleteConfirming(false);
      props.handlers.onDelete?.(props.post.mid);
    }
  }

  // No runtime re-shaping needed: threaded mode fetches a real tree, list
  // mode fetches already-flat comments (children: [] on every node) — see
  // actions-store.ts's loadComments/loadMoreComments.
  const visibleComments = () => props.post.children;

  // When a parent post requests expanding all nested threads, open this one.
  // Uses untrack so manual closes aren't overridden by a re-run of the effect.
  createEffect(() => {
    if (props.expandAll && !untrack(showComments)) {
      toggleComments();
    }
  });

  // ── Full layout expand-all state ─────────────────────────────────────────
  // Initialised from props.expandAll so callers (e.g. PostDetailModal) can
  // pre-expand all nested threads on mount.
  const [expandAll, setExpandAll] = createSignal(props.expandAll ?? false);

  async function handleExpandAll() {
    if (!showComments()) {
      await toggleComments();
    }
    setExpandAll(true);
  }

  // ── Compact (comment) layout ──────────────────────────────────────────────
  if (props.compact) {
    return (
      <div
        ref={cardRef}
        class={`relative border-l-2 pl-2 md:pl-3 py-2 md:py-2.5 mb-1 transition-colors duration-500
               ${props.highlighted ? "border-accent bg-accent/5" :  "border-rim/60"}`}
      >
        <Show when={isPinned()}>
          <span
            class="absolute top-1 right-1 z-10 flex items-center justify-center w-4 h-4 rounded-full bg-accent text-accent-fg leading-none"
            title={t("post.pinned_indicator")}
          >
            <MdFillPush_pin size={9} />
          </span>
        </Show>
        <Show when={canModerate()}>
          <div class="absolute top-1 right-1 z-10 flex items-center gap-0.5">
            <button
              onClick={onApproveClick}
              disabled={moderating()}
              title={t("directory.approve")}
              class="flex items-center justify-center w-4 h-4 rounded-full bg-accent text-accent-fg leading-none disabled:opacity-50"
            >
              <MdOutlineCheck size={10} />
            </button>
            <button
              onClick={onRejectClick}
              disabled={moderating()}
              title={t("moderate.reject")}
              class="flex items-center justify-center w-4 h-4 rounded-full bg-overlay text-red-500 leading-none disabled:opacity-50"
            >
              <MdOutlineClose size={10} />
            </button>
          </div>
        </Show>
        {/* Compact author header */}
        <div class="flex items-start gap-2 min-w-0">
          <AuthorPopover
            name={props.post.authorName}
            avatar={props.post.authorAvatar}
            url={props.post.authorUrl}
            hash={props.post.authorHash}
            address={props.post.authorAddress}
            network={props.post.authorNetwork}
          >
            <Show
              when={props.post.authorAvatar}
              fallback={
                <div
                  class="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-accent-txt
                            shrink-0 flex items-center justify-center text-accent-fg text-[0.625rem] font-bold cursor-pointer"
                >
                  {props.post.authorName?.[0]?.toUpperCase() ?? "?"}
                </div>
              }
            >
              <img
                src={props.post.authorAvatar}
                width="24"
                height="24"
                class="rounded-full object-cover shrink-0 cursor-pointer"
              />
            </Show>
          </AuthorPopover>
          <div class="flex flex-col min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <Show
                when={
                  props.postAuthorAddress &&
                  props.post.authorAddress === props.postAuthorAddress
                }
              >
                <span
                  class="shrink-0 px-1 py-px rounded text-[0.625rem] font-bold leading-none bg-accent text-accent-fg"
                  title={t("post.op_title")}
                >
                  {t("post.op")}
                </span>
              </Show>
              <a
                href={`/chanview?f=&hash=${encodeURIComponent(props.post.authorHash || props.post.authorUrl)}`}
                class="font-medium text-sm text-txt hover:underline truncate"
              >
                {props.post.authorName}
              </a>
              <Show
                when={
                  props.post.verb && props.post.verb !== "Create" && !isRepeat()
                }
              >
                <span class="text-xs text-muted italic shrink-0">
                  {props.post.verb?.toLowerCase()}
                </span>
              </Show>
              <Show when={isExpired()}>
                <span
                  class="shrink-0 px-1 py-px rounded text-[0.625rem] font-bold leading-none bg-muted/30 text-muted"
                  title={t("post.expired_title")}
                >
                  {t("post.expired_badge")}
                </span>
              </Show>
              <Show when={isExpiring()}>
                <span
                  class="flex items-center gap-0.5 shrink-0 px-1 py-px rounded text-[0.625rem] font-medium leading-none bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  title={expiresTitle()}
                >
                  <MdOutlineTimer size={10} />
                  <span class="hidden sm:inline">{formatPostDate(props.post.expires!, locale(), "narrow")}</span>
                </span>
              </Show>
              <Show when={isScheduled()}>
                <span
                  class="flex items-center gap-0.5 shrink-0 px-1 py-px rounded text-[0.625rem] font-medium leading-none bg-sky-500/15 text-sky-600 dark:text-sky-400"
                  title={scheduledTitle()}
                >
                  <MdOutlineSchedule size={10} />
                  <span class="hidden sm:inline">{t("post.scheduled_badge")} · {formatPostDate(props.post.created, locale(), "narrow")}</span>
                </span>
              </Show>
              <Show when={isDirectMessage()}>
                <DmBadge />
              </Show>
              <Show when={props.post.location}>
                <span class="flex items-center gap-0.5 min-w-0 text-[0.625rem] text-muted">
                  <MdOutlineLocation_on size={10} class="shrink-0" />
                  <a
                    href={locationHref()}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="truncate max-w-[8rem] hover:underline"
                    innerHTML={props.post.location}
                  />
                </span>
              </Show>
              <span class="flex items-center gap-1 shrink-0 ml-auto">
                <Show when={editedAt()}>
                  {(edited) => (
                    <MdOutlineEdit
                      size={11}
                      class="text-muted shrink-0"
                      title={`${t("post.edited")}: ${new Date(edited() + "Z").toLocaleString(locale())}`}
                    />
                  )}
                </Show>
                <span
                  class="text-xs text-muted whitespace-nowrap"
                  title={new Date(props.post.created + "Z").toLocaleString(locale())}
                >
                  <span class="sm:hidden">{formatPostDate(props.post.created, locale(), "narrow")}</span>
                  <span class="hidden sm:inline">{formatPostDate(props.post.created, locale())}</span>
                </span>
              </span>
            </div>
          </div>
        </div>

        <DmRecipients
          recipients={isDirectMessage() ? props.post.recipients : undefined}
          class="text-xs text-muted pl-8 -mt-0.5 mb-1 truncate"
        />

        {/* Event card (compact) */}
        <Show when={eventData()}>
          {(ev) => <EventCard post={props.post} event={ev()} />}
        </Show>

        {/* Body — no title rendered for comments */}
        <Show
          when={!isEditing()}
          fallback={
            <InlineEditForm
              body={editBody()}
              onBodyChange={setEditBody}
              showTitle={false}
              tab={editTab()}
              onTabChange={setEditTab}
              onSave={saveEdit}
              onCancel={cancelEdit}
              saving={editSaving()}
              error={editError()}
              minHeight="60px"
            />
          }
        >
          <Show when={!eventData()}>
            <div
              ref={setBodyRef}
              class="mt-1.5 prose prose-sm dark:prose-invert max-w-none text-muted
                     prose-a:text-accent prose-a:no-underline prose-a:hover:underline
                     prose-blockquote:not-italic prose-blockquote:border-accent
                     prose-code:bg-overlay prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:text-txt
                     prose-code:before:content-none prose-code:after:content-none
                     prose-img:rounded-lg prose-img:my-1 break-words
                     prose-p:my-1 prose-p:leading-snug"
              innerHTML={props.post.body}
              onClick={handleBodyClick}
              onMouseUp={handleBodyMouseUp}
            />
          </Show>
        </Show>

        {/* Poll card (compact) — below the body, which holds the question text */}
        <Show when={props.post.poll}>
          {(poll) => <PollCard uuid={props.post.uuid} poll={poll()} />}
        </Show>

        <Show when={(props.post.attachments?.length ?? 0) > 0}>
          <AttachmentList attachments={props.post.attachments!} compact />
        </Show>

        {/* Compact action bar */}
        <div class="mt-2 flex items-center gap-0.5 flex-wrap">
          <Show when={canInteract()}>
            <CompactActionBtn
              icon={
                props.post.viewerLiked ? (
                  <MdFillThumb_up size={14} />
                ) : (
                  <MdOutlineThumb_up size={14} />
                )
              }
              count={props.post.likeCount}
              label={t("post.like")}
              onClick={onLike}
              active={props.post.viewerLiked}
            />
            <CompactActionBtn
              icon={
                props.post.viewerDisliked ? (
                  <MdFillThumb_down size={14} />
                ) : (
                  <MdOutlineThumb_down size={14} />
                )
              }
              count={props.post.dislikeCount}
              label={t("post.dislike")}
              onClick={onDislike}
              active={props.post.viewerDisliked}
            />
          </Show>
          <Show when={canStar()}>
            <button
              onClick={onStar}
              title={
                props.post.viewerStarred ? t("post.unstar") : t("post.star")
              }
              class={`flex items-center gap-1 px-2 py-1 rounded-md text-xs
                     transition-colors select-none hover:bg-overlay
                     ${props.post.viewerStarred ? "text-yellow-500" : "text-subtle hover:text-txt"}`}
            >
              <Show
                when={props.post.viewerStarred}
                fallback={<MdFillStar_border size={14} />}
              >
                <MdFillStar size={14} />
              </Show>
            </button>
          </Show>
          <Show when={!isPrivate() && canInteract()}>
          <Show
            when={canReshare()}
            fallback={
              <CompactActionBtn
                icon={
                  props.post.viewerRepeated ? (
                    <MdFillShare size={14} />
                  ) : (
                    <MdOutlineShare size={14} />
                  )
                }
                count={props.post.repeatCount}
                label={t("post.repeat")}
                onClick={onRepeat}
                active={props.post.viewerRepeated}
              />
            }
          >
            <div ref={setRepeatDropdownRef} class="relative flex items-center">
              <button
                onClick={onRepeat}
                title={t("post.repeat")}
                class={`flex items-center gap-1 pl-2 pr-1 py-1 rounded-l-md text-xs
                       transition-colors select-none hover:bg-overlay
                       ${props.post.viewerRepeated ? "text-accent" : "text-subtle"}`}
              >
                {props.post.viewerRepeated ? (
                  <MdFillShare size={14} />
                ) : (
                  <MdOutlineShare size={14} />
                )}
                <span>{props.post.repeatCount}</span>
              </button>
              <button
                onClick={openRepeatDropdown}
                title={t("post.more_sharing")}
                class={`flex items-center px-0.5 py-1 rounded-r-md text-xs border-l border-rim/50
                       transition-colors select-none hover:bg-overlay
                       ${repeatDropdownOpen() ? "text-accent" : "text-subtle hover:text-txt"}`}
              >
                <MdFillKeyboard_arrow_down size={12} />
              </button>
            </div>
          </Show>
          </Show>

          <Show when={canFolder()}>
            <button
              onClick={toggleFolderPicker}
              title={t("post.save_to_folder")}
              class={`flex items-center gap-1 px-2 py-1 rounded-md text-xs
                     transition-colors select-none hover:bg-overlay
                     ${showFolderPicker() || hasFolders() ? "text-accent" : "text-subtle hover:text-txt"}`}
            >
              <Show
                when={hasFolders()}
                fallback={<MdFillFolder_open size={14} />}
              >
                <MdFillFolder size={14} />
              </Show>
            </button>
          </Show>

          <Show when={canReactionQueue()}>
            <button
              onClick={toggleReactionQueue}
              title={t("moderate.pending_reactions")}
              class={`flex items-center gap-1 px-2 py-1 rounded-md text-xs
                     transition-colors select-none hover:bg-overlay
                     ${showReactionQueue() ? "text-accent" : "text-subtle hover:text-txt"}`}
            >
              <MdOutlineFlag size={14} />
            </button>
          </Show>

          <Show when={isRss()}>
            <button
              onClick={handleRssImport}
              disabled={rssImporting()}
              title={t("post.import_post")}
              class="flex items-center gap-1 px-2 py-1 rounded-md text-xs
                     text-subtle hover:bg-overlay hover:text-accent transition-colors
                     disabled:opacity-50"
            >
              <MdOutlineCloud_download
                size={14}
                classList={{ "animate-spin": rssImporting() }}
              />
            </button>
          </Show>

          <Show when={totalComments() > 0}>
            <button
              onClick={toggleComments}
              class="flex items-center gap-1 px-2 py-1 rounded-md text-xs
                     text-subtle hover:bg-overlay hover:text-txt transition-colors"
            >
              <Show
                when={showComments()}
                fallback={<MdFillKeyboard_arrow_down size={14} />}
              >
                <MdFillKeyboard_arrow_up size={14} />
              </Show>
              <span>{totalComments()}</span>
            </button>
          </Show>

          {/* spacer keeps the trailing controls right-aligned even when the
              reply button is hidden (comments not allowed) */}
          <span class="ml-auto" />
          <Show when={canInteract() && props.post.canComment !== false}>
            <button
              onClick={openReply}
              class="flex items-center gap-1 px-2 py-1 rounded-md text-xs
                     text-subtle hover:bg-overlay hover:text-txt transition-colors"
              title={t("post.reply")}
            >
              <MdOutlineReply size={14} />
            </button>
          </Show>

          <div ref={setMoreDropdownRef} class="relative">
            <button
              onClick={openMoreDropdown}
              title={t("post.more_actions")}
              class={`flex items-center px-1 py-1 rounded-md text-xs
                     transition-colors hover:bg-overlay
                     ${moreDropdownOpen() ? "text-accent" : "text-subtle"}`}
            >
              <MdFillMore_vert size={14} />
            </button>
          </div>
          <Portal>
            <Show when={moreDropdownOpen()}>
              <div
                ref={setMoreDropdownPanelRef}
                class="z-[9999] min-w-[9rem] bg-surface border border-rim rounded-lg shadow-lg py-1"
                style={moreDropdownStyle()}
              >
                {/* Share — the only entry every viewer gets; reshare below is local-only */}
                <button
                  onClick={() => {
                    openShare(shareTargetForPost(props.post));
                    setMoreDropdownOpen(false);
                  }}
                  class="w-full flex items-center gap-2 px-3 py-2 text-xs text-txt hover:bg-overlay transition-colors text-left"
                >
                  <MdOutlineShare size={13} />
                  <span>{t("share.action")}</span>
                </button>
                <Show when={canFollow()}>
                  <button
                    onClick={() => {
                      onFollowToggle();
                      setMoreDropdownOpen(false);
                    }}
                    disabled={followPending()}
                    class={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-overlay transition-colors text-left disabled:opacity-50
                           ${following() ? "text-accent" : "text-txt"}`}
                  >
                    <Show
                      when={following()}
                      fallback={<MdOutlineNotifications_none size={13} />}
                    >
                      <MdFillNotifications size={13} />
                    </Show>
                    <span>
                      {following() ? t("post.unfollow") : t("post.follow")}
                    </span>
                  </button>
                </Show>
                <Show
                  when={
                    props.post.likeCount > 0 ||
                    props.post.dislikeCount > 0 ||
                    props.post.repeatCount > 0
                  }
                >
                  <button
                    onClick={() => {
                      toggleStats();
                      setMoreDropdownOpen(false);
                    }}
                    class={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-overlay transition-colors text-left
                           ${showStats() ? "text-accent" : "text-txt"}`}
                  >
                    <MdFillBar_chart size={13} />
                    <span>{t("post.statistics")}</span>
                  </button>
                </Show>
                <Show when={canViewSource()}>
                  <button
                    onClick={() => {
                      toggleSource();
                      setMoreDropdownOpen(false);
                    }}
                    class={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-overlay transition-colors text-left
                           ${showSource() ? "text-accent" : "text-txt"}`}
                  >
                    <MdOutlineCode size={13} />
                    <span>{t("post.view_source")}</span>
                  </button>
                </Show>
                <Show when={!!props.post.permalink}>
                  <a
                    href={props.post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="w-full flex items-center gap-2 px-3 py-2 text-xs text-txt hover:bg-overlay transition-colors"
                  >
                    <BiRegularLinkExternal size={13} />
                    <span>{t("post.original")}</span>
                  </a>
                </Show>
                <Show when={canDeliveryReport()}>
                  <button
                    onClick={() => {
                      toggleDeliveryReport();
                      setMoreDropdownOpen(false);
                    }}
                    class={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-overlay transition-colors text-left
                           ${showDeliveryReport() ? "text-accent" : "text-txt"}`}
                  >
                    <MdOutlineSend size={13} />
                    <span>{t("post.delivery_report")}</span>
                  </button>
                </Show>
                <Show when={canAddToCalendar()}>
                  <button
                    onClick={addToCalendar}
                    disabled={addingToCal()}
                    class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-overlay transition-colors text-left text-txt disabled:opacity-60"
                  >
                    <MdOutlineEvent size={13} />
                    <span>{t("post.add_to_calendar")}</span>
                  </button>
                </Show>
                <Show when={canPin()}>
                  <button
                    onClick={onPinClick}
                    class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-overlay transition-colors text-left text-txt"
                  >
                    <Show when={isPinned()} fallback={<MdOutlinePush_pin size={13} />}>
                      <MdFillPush_pin size={13} />
                    </Show>
                    <span>{isPinned() ? t("post.unpin") : t("post.pin")}</span>
                  </button>
                </Show>
                <Show when={canEdit()}>
                  <button
                    onClick={startEdit}
                    class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-overlay transition-colors text-left text-txt"
                  >
                    <MdOutlineEdit size={13} />
                    <span>{t("post.edit")}</span>
                  </button>
                </Show>
                <Show when={canDelete()}>
                  <button
                    onClick={onDeleteClick}
                    class={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-overlay transition-colors text-left
                           ${deleteConfirming() ? "text-red-500" : "text-txt"}`}
                  >
                    <MdOutlineDelete size={13} />
                    <span>
                      {deleteConfirming() ? deleteConfirmLabel() : deleteLabel()}
                    </span>
                  </button>
                </Show>
              </div>
            </Show>
          </Portal>
        </div>

        <Show when={replyOpen() && props.post.iid && props.post.profileUid}>
          <CommentComposer
            parentUuid={props.post.uuid}
            profileUid={props.post.profileUid!}
            initialBody={replyQuote() || undefined}
            onSubmitted={(body) => {
              props.handlers.onComment(
                props.post.mid,
                body,
                props.post.authorName,
                props.post.authorAvatar,
              );
              setReplyOpen(false);
              setShowComments(true);
            }}
          />
        </Show>
        <Portal>
          <Show when={repeatDropdownOpen()}>
            <div
              ref={setRepeatDropdownPanelRef}
              class="z-[9999] min-w-[10rem] bg-surface border border-rim rounded-lg shadow-lg py-1"
              style={repeatDropdownStyle()}
            >
              <div class="w-full flex items-center gap-2 px-3 py-2 text-xs text-txt hover:bg-overlay transition-colors">
                <button
                  onClick={() => {
                    setRepeatDropdownOpen(false);
                    setReshareOpen(true);
                  }}
                  class="flex items-center gap-2 flex-1 text-left"
                >
                  <BiSolidShareAlt size={13} />
                  <span>{t("post.reshare_with_comment")} #{props.post.iid}</span>
                </button>
              </div>
            </div>
          </Show>
        </Portal>
        <Show when={reshareOpen() && props.post.iid && auth()?.uid}>
          <PostComposer
            open={true}
            onClose={() => setReshareOpen(false)}
            profileUid={auth()!.uid}
            initialBody={`\n[share=${props.post.iid}][/share]\n`}
            scopeKey={`post:reshare:${props.post.iid}`}
          />
        </Show>
        <Show when={showStats()}>
          <PostStats loading={statsLoading()} data={statsData()} />
        </Show>
        <Show when={showSource()}>
          <PostSource loading={sourceLoading()} data={sourceData()} />
        </Show>
        <Show when={showDeliveryReport()}>
          <DeliveryReport
            loading={deliveryReportLoading()}
            data={deliveryReportData()}
          />
        </Show>
        <Show when={showFolderPicker()}>
          <FolderPicker
            loading={folderPickerLoading()}
            itemFolders={itemFolders()}
            allFolders={allFolders()}
            saving={folderSaving()}
            newInput={newFolderInput()}
            onSetInput={setNewFolderInput}
            onToggle={toggleFolder}
            onAdd={addNewFolder}
          />
        </Show>
        <Show when={showReactionQueue()}>
          <PendingReactionsPanel
            loading={reactionQueueLoading()}
            items={reactionQueue()}
            busy={reactionQueueBusy()}
            onApprove={(iid) => resolveQueuedReaction(iid, true)}
            onReject={(iid) => resolveQueuedReaction(iid, false)}
          />
        </Show>
        <Show when={commentsLoading()}>
          <div class="mt-2 ml-2 text-xs text-muted animate-pulse">
            {t("post.loading_comments")}
          </div>
        </Show>
        <CommentThread
          comments={visibleComments()}
          show={showComments() && !commentsLoading()}
          handlers={props.handlers}
          highlightUuid={props.highlightUuid}
          postAuthorAddress={
            props.postAuthorAddress ?? props.post.authorAddress
          }
          expandAll={props.expandAll}
          rootUuid={props.rootUuid ?? props.post.uuid}
        />
        <Show when={showComments() && props.post.hasMoreComments && props.handlers.onLoadMoreComments}>
          <div class="flex justify-center mt-2">
            <button
              type="button"
              onClick={loadMoreComments}
              disabled={loadingMoreComments()}
              class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium
                     rounded-full border border-rim bg-surface text-muted
                     hover:bg-overlay hover:text-txt transition-colors
                     disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Show when={!loadingMoreComments()} fallback={<MdOutlineRefresh size={13} class="animate-spin" />}>
                <MdFillKeyboard_arrow_down size={13} />
              </Show>
              {loadingMoreComments() ? t("post.loading") : t("post.load_more_comments")}
            </button>
          </div>
        </Show>
      </div>
    );
  }

  // ── Full (main post) layout ───────────────────────────────────────────────
  return (
    <div
      ref={cardRef}
      class={
        (props.seamless
          ? "relative bg-surface p-3 md:p-5"
          : "relative bg-surface border border-rim rounded-2xl p-3 md:p-5 mb-4 shadow-sm hover:shadow-md transition-shadow duration-200")
      }
    >
      {/* Header */}
      <div class="flex items-start gap-3">
        <AuthorPopover
          name={props.post.authorName}
          avatar={props.post.authorAvatar}
          url={props.post.authorUrl}
          address={props.post.authorAddress}
          network={props.post.authorNetwork}
        >
          <Show
            when={props.post.authorAvatar}
            fallback={
              <div
                class="w-11 h-11 rounded-full bg-gradient-to-br from-accent to-accent-txt
                          shrink-0 flex items-center justify-center text-accent-fg text-sm font-bold ring-1 ring-rim
                          cursor-pointer"
              >
                {props.post.authorName?.[0]?.toUpperCase() ?? "?"}
              </div>
            }
          >
            <img
              src={props.post.authorAvatar}
              width="44"
              height="44"
              class="rounded-full object-cover ring-1 ring-rim cursor-pointer"
            />
          </Show>
        </AuthorPopover>
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            {/* Padlock on private items — classic's lockview (conv_item.tpl:83) */}
            <Show when={isPrivate() && props.post.iid && auth()?.isLocal}>
              <LockviewPopover type="item" id={props.post.iid!} size={12} />
            </Show>
            <a
              href={`/chanview?f=&hash=${encodeURIComponent(props.post.authorHash || props.post.authorUrl)}`}
              class="font-semibold text-txt hover:underline truncate"
            >
              {props.post.authorName}
            </a>
            <Show when={props.post.via}>
              <div class="flex items-center gap-1">
                <MdFillShare size={12} class="text-muted shrink-0" />
                <span class="text-xs text-muted">via</span>
                <a
                  href={`/chanview?f=&hash=${encodeURIComponent(props.post.via!.hash || props.post.via!.url)}`}
                  class="text-xs text-muted hover:underline font-medium"
                >
                  {props.post.via!.name}
                </a>
              </div>
            </Show>
          </div>
          <Show when={authorAddressLabel()}>
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-muted truncate">{authorAddressLabel()}</span>
              <PlatformIcon url={props.post.authorUrl} network={props.post.authorNetwork} size={12} />
            </div>
          </Show>
          <DmRecipientsPC recipients={isDirectMessage() ? props.post.recipients : undefined} />
          <Show when={props.post.location}>
            <div class="flex items-center gap-1.5">
              <span class="flex items-center gap-0.5 min-w-0 text-sm text-muted">
                <MdOutlineLocation_on size={14} class="shrink-0" />
                <Show
                  when={locationHref()}
                  fallback={
                    <span
                      class="truncate max-w-[12rem] [&_a]:hover:underline"
                      innerHTML={props.post.location}
                    />
                  }
                >
                  <a
                    href={locationHref()}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="truncate max-w-[12rem] hover:underline"
                    innerHTML={props.post.location}
                  />
                </Show>
              </span>
            </div>
          </Show>
        </div>

        <div class="ml-auto flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Show when={isPinned()}>
            <span
              class="flex items-center justify-center w-6 h-6 rounded-full bg-accent text-accent-fg leading-none"
              title={t("post.pinned_indicator")}
            >
              <MdFillPush_pin size={13} />
            </span>
          </Show>
          <Show when={isFlatReply()}>
            <span
              class="flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.625rem] font-bold bg-accent-muted/40 text-muted leading-none"
              title={t("post.reply_indicator")}
            >
              <MdOutlineReply size={11} />
              <span class="hidden sm:inline">{t("post.reply_badge")}</span>
            </span>
          </Show>
          <Show when={isExpired()}>
            <span
              class="px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-muted/30 text-muted leading-none"
              title={t("post.expired_title")}
            >
              {t("post.expired_badge")}
            </span>
          </Show>
          <Show when={isExpiring()}>
            <span
              class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 leading-none"
              title={expiresTitle()}
            >
              <MdOutlineTimer size={11} />
              <span class="hidden sm:inline">{formatPostDate(props.post.expires!, locale(), "narrow")}</span>
            </span>
          </Show>
          <Show when={isScheduled()}>
            <span
              class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 leading-none"
              title={scheduledTitle()}
            >
              <MdOutlineSchedule size={11} />
              <span class="hidden sm:inline">{t("post.scheduled_badge")} · {formatPostDate(props.post.created, locale(), "narrow")}</span>
            </span>
          </Show>
          <Show when={isDirectMessage()}>
            <DmBadge size="md" />
          </Show>
          <Show when={isUnseen()}>
            <span class="px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold bg-accent text-accent-fg leading-none"
              title={t("post.new_badge")}>
              <span class="hidden sm:inline">{t("post.new_badge")}</span>
              <span class="sm:hidden block w-1.5 h-1.5 rounded-full bg-accent-fg" />
            </span>
          </Show>
          <span class="flex items-center gap-1">
            <Show when={editedAt()}>
              {(edited) => (
                <MdOutlineEdit
                  size={12}
                  class="text-muted shrink-0"
                  title={`${t("post.edited")}: ${new Date(
                    edited() + "Z",
                  ).toLocaleString(locale())}`}
                />
              )}
            </Show>
            <span
              class="text-sm text-muted whitespace-nowrap"
              title={new Date(props.post.created + "Z").toLocaleString(locale())}
            >
              <span class="sm:hidden">{formatPostDate(props.post.created, locale(), "narrow")}</span>
              <span class="hidden sm:inline">{formatPostDate(props.post.created, locale())}</span>
            </span>
          </span>
        </div>
      </div>

      <Show
        when={!isEditing()}
        fallback={
          <InlineEditForm
            body={editBody()}
            onBodyChange={setEditBody}
            title={editTitle()}
            onTitleChange={setEditTitle}
            showTitle={!!props.post.title}
            tab={editTab()}
            onTabChange={setEditTab}
            onSave={saveEdit}
            onCancel={cancelEdit}
            saving={editSaving()}
            error={editError()}
            minHeight="100px"
          />
        }
      >
        {/* Title */}
        <Show when={props.post.title}>
          <div
            class="mt-6 prose prose-sm dark:prose-invert max-w-none
                   [&>*]:font-bold [&>*]:tracking-tight [&>*]:text-lg [&>*]:text-txt"
            innerHTML={DOMPurify.sanitize(props.post.title!)}
            onClick={handleBodyClick}
          />
        </Show>

        {/* Event card */}
        <Show when={eventData()}>
          {(ev) => <EventCard post={props.post} event={ev()} />}
        </Show>

        {/* Body — hidden for pure event posts (body is just BBCode tags).
            Polls keep theirs: it's the question text the author typed. */}
        <Show when={!eventData()}>
          <div class="relative mt-4">
            <div
              class="overflow-hidden transition-[max-height] duration-300 ease-in-out"
              style={{
                "max-height":
                  props.seamless || bodyExpanded() || !bodyOverflows()
                    ? "none"
                    : `${postHeightPx()}px`,
              }}
            >
              <div
                ref={setBodyRef}
                class="prose-code:break-all prose prose-sm dark:prose-invert max-w-none
                       prose-a:text-accent prose-a:no-underline prose-a:hover:underline
                       prose-blockquote:not-italic prose-blockquote:border-accent
                       prose-code:bg-overlay prose-code:px-1 prose-code:rounded prose-code:text-sm prose-code:text-txt
                       prose-code:before:content-none prose-code:after:content-none
                       prose-img:rounded-lg prose-img:my-2 break-words text-muted"
                innerHTML={props.post.body}
                onClick={handleBodyClick}
                onMouseUp={handleBodyMouseUp}
              />
            </div>
            <Show when={!props.seamless && bodyOverflows() && !bodyExpanded()}>
              <div
                class="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-surface to-transparent flex items-end justify-center pb-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setBodyExpanded(true);
                }}
              >
                <button
                  class="flex items-center gap-1 text-xs text-accent hover:text-accent-txt
                         bg-overlay/90 px-2 py-0.5 rounded-full border border-accent/50 transition-colors"
                >
                  <svg
                    class="w-3 h-3"
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
                  {t("ui.show_more")}
                </button>
              </div>
            </Show>
          </div>
          <Show when={!props.seamless && bodyOverflows() && bodyExpanded()}>
            <button
              class="flex items-center justify-center gap-1 text-xs text-accent hover:text-accent-txt mt-1 w-full transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setBodyExpanded(false);
              }}
            >
              <svg
                class="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 15l7-7 7 7"
                />
              </svg>
              {t("ui.show_less")}
            </button>
          </Show>
        </Show>
      </Show>

      {/* Poll card — below the body, which holds the question text */}
      <Show when={props.post.poll}>
        {(poll) => <PollCard uuid={props.post.uuid} poll={poll()} />}
      </Show>

      <Show when={(props.post.attachments?.length ?? 0) > 0}>
        <AttachmentList attachments={props.post.attachments!} />
      </Show>

      {/* Categories — thread-tops only; categories belong to the thread, not a reply */}
      <Show when={!isComment() && (props.post.categories?.length ?? 0) > 0}>
        <div class="mt-3 flex flex-wrap items-center gap-1">
          <For each={props.post.categories}>
            {(cat) => (
              <span class="px-1.5 py-0.5 rounded bg-elevated text-xs text-txt">{cat}</span>
            )}
          </For>
        </div>
      </Show>

      {/* Action bar */}
      <div class="mt-4 pt-3 border-t border-rim flex flex-wrap items-center gap-1">
        {/* ── Like / Dislike / Star / Repeat ── */}
        <Show when={canInteract()}>
          <ActionBtn
            icon={
              props.post.viewerLiked ? (
                <MdFillThumb_up size={17} />
              ) : (
                <MdOutlineThumb_up size={17} />
              )
            }
            count={props.post.likeCount}
            label={t("post.like")}
            onClick={onLike}
            active={props.post.viewerLiked}
            activeClass="text-accent"
          />
          <ActionBtn
            icon={
              props.post.viewerDisliked ? (
                <MdFillThumb_down size={17} />
              ) : (
                <MdOutlineThumb_down size={17} />
              )
            }
            count={props.post.dislikeCount}
            label={t("post.dislike")}
            onClick={onDislike}
            active={props.post.viewerDisliked}
            activeClass="text-accent"
          />
        </Show>
        <Show when={canStar()}>
          <button
            onClick={onStar}
            title={props.post.viewerStarred ? t("post.unstar") : t("post.star")}
            class={`flex items-center px-2 py-1.5 rounded-lg text-sm font-medium
                   transition-colors select-none hover:bg-overlay
                   ${props.post.viewerStarred ? "text-yellow-500" : "text-muted hover:text-txt"}`}
          >
            <Show
              when={props.post.viewerStarred}
              fallback={<MdFillStar_border size={17} />}
            >
              <MdFillStar size={17} />
            </Show>
          </button>
        </Show>
        <Show when={!isPrivate() && canInteract()}>
        <Show
          when={canReshare()}
          fallback={
            <ActionBtn
              icon={
                props.post.viewerRepeated ? (
                  <MdFillShare size={17} />
                ) : (
                  <MdOutlineShare size={17} />
                )
              }
              count={props.post.repeatCount}
              label={t("post.repeat")}
              onClick={onRepeat}
              active={props.post.viewerRepeated}
              activeClass="text-accent"
            />
          }
        >
          <div ref={setRepeatDropdownRef} class="relative flex items-center">
            <button
              onClick={onRepeat}
              title={t("post.repeat")}
              class={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-l-lg text-sm font-medium
                     transition-colors select-none hover:bg-overlay
                     ${props.post.viewerRepeated ? "text-accent" : "text-muted"}`}
            >
              {props.post.viewerRepeated ? (
                <MdFillShare size={17} />
              ) : (
                <MdOutlineShare size={17} />
              )}
              <span>{props.post.repeatCount}</span>
            </button>
            <button
              onClick={openRepeatDropdown}
              title={t("post.more_sharing")}
              class={`flex items-center px-1.5 py-1.5 rounded-r-lg text-sm font-medium border-l border-rim/50
                     transition-colors select-none hover:bg-overlay
                     ${repeatDropdownOpen() ? "text-accent" : "text-muted hover:text-txt"}`}
            >
              <MdFillKeyboard_arrow_down size={14} />
            </button>
          </div>
        </Show>
        </Show>

        {/* ── Save to folder (after repeat) ── */}
        <Show when={canFolder()}>
          <button
            onClick={toggleFolderPicker}
            title={t("post.save_to_folder")}
            class={`flex items-center px-2 py-1.5 rounded-lg text-sm font-medium
                   transition-colors select-none hover:bg-overlay
                   ${showFolderPicker() || hasFolders() ? "text-accent" : "text-muted hover:text-txt"}`}
          >
            <Show
              when={hasFolders()}
              fallback={<MdFillFolder_open size={17} />}
            >
              <MdFillFolder size={17} />
            </Show>
          </button>
        </Show>

        <Show when={canReactionQueue()}>
          <button
            onClick={toggleReactionQueue}
            title={t("moderate.pending_reactions")}
            class={`flex items-center px-2 py-1.5 rounded-lg text-sm font-medium
                   transition-colors select-none hover:bg-overlay
                   ${showReactionQueue() ? "text-accent" : "text-muted hover:text-txt"}`}
          >
            <MdOutlineFlag size={17} />
          </button>
        </Show>

        {/* ── Comments + thread controls group ── */}
        <Show when={totalComments() > 0}>
          <button
            onClick={toggleComments}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                   text-muted hover:bg-overlay hover:text-txt transition-colors"
            title={t("post.toggle_comments")}
          >
            <Show
              when={showComments()}
              fallback={<MdFillKeyboard_arrow_down size={17} />}
            >
              <MdFillKeyboard_arrow_up size={17} />
            </Show>
            <MdFillChat size={15} />
            <span>{totalComments()}</span>
          </button>
        </Show>
        <Show when={showComments() && props.post.children.some((n) => n.children.length > 0)}>
          <button
            onClick={handleExpandAll}
            class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium
                   text-muted hover:bg-overlay hover:text-txt transition-colors"
            title={t("post.expand_all")}
          >
            <MdFillUnfold_more size={17} />
          </button>
        </Show>

        {/* ── Reply / View in context (pushes to right; spacer keeps alignment when hidden) ── */}
        <span class="ml-auto" />
        <Show when={canInteract() && props.post.canComment !== false}>
          <Show
            when={isFlatReply() && props.onViewContext}
            fallback={
              <button
                onClick={openReply}
                class="flex items-center px-2 py-1.5 rounded-lg text-sm font-medium
                       text-muted hover:bg-overlay hover:text-txt transition-colors"
                title={t("post.reply")}
              >
                <MdOutlineReply size={17} />
              </button>
            }
          >
            <button
              onClick={props.onViewContext}
              class="flex items-center px-2 py-1.5 rounded-lg text-sm font-medium
                     text-muted hover:bg-overlay hover:text-txt transition-colors"
              title={t("post.view_in_context")}
            >
              <MdOutlineVisibility size={17} />
            </button>
          </Show>
        </Show>

        {/* ── More actions dropdown (vertical three dots, after Reply) ── */}
        <div ref={setMoreDropdownRef} class="relative">
          <button
            onClick={openMoreDropdown}
            title={t("post.more_actions")}
            class={`flex items-center px-1.5 py-1.5 rounded-lg text-sm font-medium
                   transition-colors hover:bg-overlay
                   ${moreDropdownOpen() ? "text-accent" : "text-muted"}`}
          >
            <MdFillMore_vert size={18} />
          </button>
        </div>
      </div>

      <Portal>
        <Show when={moreDropdownOpen()}>
          <div
            ref={setMoreDropdownPanelRef}
            class="z-[9999] min-w-[11rem] bg-surface border border-rim rounded-lg shadow-lg py-1"
            style={moreDropdownStyle()}
          >
            {/* Share — the only entry every viewer gets; reshare below is local-only */}
            <button
              onClick={() => {
                openShare(shareTargetForPost(props.post));
                setMoreDropdownOpen(false);
              }}
              class="w-full flex items-center gap-2 px-3 py-2 text-xs text-txt hover:bg-overlay transition-colors text-left"
            >
              <MdOutlineShare size={13} />
              <span>{t("share.action")}</span>
            </button>
            <Show when={canFollow()}>
              <button
                onClick={() => {
                  onFollowToggle();
                  setMoreDropdownOpen(false);
                }}
                disabled={followPending()}
                class={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-overlay transition-colors text-left disabled:opacity-50
                       ${following() ? "text-accent" : "text-txt"}`}
              >
                <Show
                  when={following()}
                  fallback={<MdOutlineNotifications_none size={15} />}
                >
                  <MdFillNotifications size={15} />
                </Show>
                <span>
                  {following() ? t("post.unfollow") : t("post.follow")}
                </span>
              </button>
            </Show>
            <Show
              when={
                props.post.likeCount > 0 ||
                props.post.dislikeCount > 0 ||
                props.post.repeatCount > 0
              }
            >
              <button
                onClick={() => {
                  toggleStats();
                  setMoreDropdownOpen(false);
                }}
                class={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-overlay transition-colors text-left
                       ${showStats() ? "text-accent" : "text-txt"}`}
              >
                <MdFillBar_chart size={15} />
                <span>{t("post.statistics")}</span>
              </button>
            </Show>
            <Show when={canViewSource()}>
              <button
                onClick={() => {
                  toggleSource();
                  setMoreDropdownOpen(false);
                }}
                class={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-overlay transition-colors text-left
                       ${showSource() ? "text-accent" : "text-txt"}`}
              >
                <MdOutlineCode size={15} />
                <span>{t("post.view_source")}</span>
              </button>
            </Show>
            <Show when={!!props.post.permalink}>
              <a
                href={props.post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                class="w-full flex items-center gap-2 px-3 py-2 text-sm text-txt hover:bg-overlay transition-colors"
              >
                <BiRegularLinkExternal size={15} />
                <span>{t("post.original")}</span>
              </a>
            </Show>
            <Show when={isRss()}>
              <button
                onClick={() => {
                  handleRssImport();
                  setMoreDropdownOpen(false);
                }}
                disabled={rssImporting()}
                class="w-full flex items-center gap-2 px-3 py-2 text-sm text-txt hover:bg-overlay transition-colors text-left disabled:opacity-50"
              >
                <MdOutlineCloud_download
                  size={15}
                  classList={{ "animate-spin": rssImporting() }}
                />
                <span>{t("post.import")}</span>
              </button>
            </Show>
            <Show when={!!props.handlers.onRefresh}>
              <button
                onClick={() => {
                  onRefresh();
                  setMoreDropdownOpen(false);
                }}
                disabled={refreshing()}
                class="w-full flex items-center gap-2 px-3 py-2 text-sm text-txt hover:bg-overlay transition-colors text-left disabled:opacity-50"
              >
                <MdOutlineRefresh
                  size={15}
                  class={refreshing() ? "animate-spin" : ""}
                />
                <span>{t("post.refresh")}</span>
              </button>
            </Show>
            <Show when={canDeliveryReport()}>
              <button
                onClick={() => {
                  toggleDeliveryReport();
                  setMoreDropdownOpen(false);
                }}
                class={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-overlay transition-colors text-left
                       ${showDeliveryReport() ? "text-accent" : "text-txt"}`}
              >
                <MdOutlineSend size={15} />
                <span>{t("post.delivery_report")}</span>
              </button>
            </Show>
            <Show when={canAddToCalendar()}>
              <button
                onClick={addToCalendar}
                disabled={addingToCal()}
                class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-overlay transition-colors text-left text-txt disabled:opacity-60"
              >
                <MdOutlineEvent size={15} />
                <span>{t("post.add_to_calendar")}</span>
              </button>
            </Show>
            <Show when={canPin()}>
              <button
                onClick={onPinClick}
                class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-overlay transition-colors text-left text-txt"
              >
                <Show when={isPinned()} fallback={<MdOutlinePush_pin size={15} />}>
                  <MdFillPush_pin size={15} />
                </Show>
                <span>{isPinned() ? t("post.unpin") : t("post.pin")}</span>
              </button>
            </Show>
            <Show when={canEdit()}>
              <button
                onClick={startEdit}
                class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-overlay transition-colors text-left text-txt"
              >
                <MdOutlineEdit size={15} />
                <span>{t("post.edit")}</span>
              </button>
            </Show>
            <Show when={canDelete()}>
              <button
                onClick={onDeleteClick}
                class={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-overlay transition-colors text-left
                       ${deleteConfirming() ? "text-red-500" : "text-txt"}`}
              >
                <MdOutlineDelete size={15} />
                <span>
                  {deleteConfirming() ? deleteConfirmLabel() : deleteLabel()}
                </span>
              </button>
            </Show>
          </div>
        </Show>
      </Portal>
      <Portal>
        <Show when={repeatDropdownOpen()}>
          <div
            ref={setRepeatDropdownPanelRef}
            class="z-[9999] min-w-[11rem] bg-surface border border-rim rounded-lg shadow-lg py-1"
            style={repeatDropdownStyle()}
          >
            <div class="w-full flex items-center gap-2 px-3 py-2 text-sm text-txt hover:bg-overlay transition-colors">
              <button
                onClick={() => {
                  setRepeatDropdownOpen(false);
                  setReshareOpen(true);
                }}
                class="flex items-center gap-2 flex-1 text-left"
              >
                <BiSolidShareAlt size={15} />
                <span>{t("post.reshare_with_comment")} #{props.post.iid}</span>
              </button>
            </div>
          </div>
        </Show>
      </Portal>

      <Show when={showStats()}>
        <PostStats loading={statsLoading()} data={statsData()} />
      </Show>
      <Show when={showSource()}>
        <PostSource loading={sourceLoading()} data={sourceData()} />
      </Show>
      <Show when={showDeliveryReport()}>
        <DeliveryReport
          loading={deliveryReportLoading()}
          data={deliveryReportData()}
        />
      </Show>
      <Show when={showFolderPicker()}>
        <FolderPicker
          loading={folderPickerLoading()}
          itemFolders={itemFolders()}
          allFolders={allFolders()}
          saving={folderSaving()}
          newInput={newFolderInput()}
          onSetInput={setNewFolderInput}
          onToggle={toggleFolder}
          onAdd={addNewFolder}
        />
      </Show>
      <Show when={showReactionQueue()}>
        <PendingReactionsPanel
          loading={reactionQueueLoading()}
          items={reactionQueue()}
          busy={reactionQueueBusy()}
          onApprove={(iid) => resolveQueuedReaction(iid, true)}
          onReject={(iid) => resolveQueuedReaction(iid, false)}
        />
      </Show>

      <Show when={replyOpen() && props.post.iid && props.post.profileUid}>
        <CommentComposer
          parentUuid={props.post.uuid}
          profileUid={props.post.profileUid!}
          initialBody={replyQuote() || undefined}
          onSubmitted={(body) => {
            props.handlers.onComment(
              props.post.mid,
              body,
              props.post.authorName,
              props.post.authorAvatar,
            );
            setReplyOpen(false);
            setShowComments(true);
          }}
        />
      </Show>
      <Show when={editSeed()}>
        {(seed) => (
          <PostComposer
            open={true}
            onClose={() => setEditSeed(null)}
            profileUid={props.post.profileUid ?? auth()?.uid ?? 0}
            scopeKey={`post:edit:${props.post.uuid}`}
            initialBody={seed().body}
            initialTitle={seed().title}
            initialSummary={seed().summary}
            initialCategory={seed().category}
            initialMimetype={seed().mimetype}
            onSubmitEdit={(fields) =>
              props.handlers.onEdit!(props.post.mid, fields)
            }
          />
        )}
      </Show>
      <Show when={reshareOpen() && props.post.iid && auth()?.uid}>
        <PostComposer
          open={true}
          onClose={() => setReshareOpen(false)}
          profileUid={auth()!.uid}
          initialBody={`\n[share=${props.post.iid}][/share]\n`}
          scopeKey={`post:reshare:${props.post.iid}`}
        />
      </Show>
      <Show when={commentsLoading()}>
        <div class="mt-3 text-sm text-muted animate-pulse">
          {t("post.loading_comments")}
        </div>
      </Show>
      <Show when={editingEvent()}>
        {(ev) => (
          <EventCreatorModal
            event={ev()}
            onClose={() => setEditingEvent(null)}
            onEdited={() => setEditingEvent(null)}
          />
        )}
      </Show>
      <CommentThread
        comments={visibleComments()}
        show={showComments() && !commentsLoading()}
        handlers={props.handlers}
        highlightUuid={props.highlightUuid}
        postAuthorAddress={props.post.authorAddress}
        expandAll={expandAll()}
        rootUuid={props.rootUuid ?? props.post.uuid}
      />
      <Show when={showComments() && props.post.hasMoreComments && props.handlers.onLoadMoreComments}>
        <div class="flex justify-center mt-2">
          <button
            type="button"
            onClick={loadMoreComments}
            disabled={loadingMoreComments()}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                   rounded-full border border-rim bg-surface text-muted
                   hover:bg-overlay hover:text-txt transition-colors
                   disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Show when={!loadingMoreComments()} fallback={<MdOutlineRefresh size={14} class="animate-spin" />}>
              <MdFillKeyboard_arrow_down size={14} />
            </Show>
            {loadingMoreComments() ? t("post.loading") : t("post.load_more_comments")}
          </button>
        </div>
      </Show>
      {props.contextBanner}

      <Show when={rssImportedUuid()}>
        {(uuid) => (
          <PostDetailModal
            uuid={uuid()}
            onClose={() => setRssImportedUuid(null)}
          />
        )}
      </Show>
    </div>
  );
}

interface StatActor {
  name: string;
  avatar?: string;
  url?: string;
}

function StatActorChip(props: { actor: StatActor }) {
  return (
    <a
      href={props.actor.url}
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-1.5 px-2 py-1 rounded-full bg-overlay hover:bg-rim transition-colors text-xs text-txt"
      title={props.actor.name}
    >
      <Show
        when={props.actor.avatar}
        fallback={
          <div class="w-5 h-5 rounded-full bg-gradient-to-br from-accent to-accent-txt shrink-0 flex items-center justify-center text-accent-fg text-[0.5625rem] font-bold">
            {props.actor.name?.[0]?.toUpperCase() ?? "?"}
          </div>
        }
      >
        <img
          src={props.actor.avatar}
          class="w-5 h-5 rounded-full object-cover shrink-0"
        />
      </Show>
      <span class="max-w-[8rem] truncate">{props.actor.name}</span>
    </a>
  );
}

function PostStats(props: {
  loading: boolean;
  data: {
    likes: StatActor[];
    dislikes: StatActor[];
    repeats: StatActor[];
  } | null;
}) {
  const { t } = useI18n();
  const tabs = () => {
    const d = props.data;
    if (!d) return [];
    return [
      { key: "likes" as const, label: t("post.likes"), count: d.likes.length },
      {
        key: "dislikes" as const,
        label: t("post.dislikes"),
        count: d.dislikes.length,
      },
      {
        key: "repeats" as const,
        label: t("post.repeats"),
        count: d.repeats.length,
      },
    ].filter((tab) => tab.count > 0);
  };

  const [tab, setTab] = createSignal<"likes" | "dislikes" | "repeats">("likes");

  createEffect(() => {
    const first = tabs()[0]?.key;
    if (first) setTab(first);
  });

  const actors = () => {
    const d = props.data;
    if (!d) return [];
    return d[tab()] ?? [];
  };

  return (
    <div class="mt-3 pt-3 border-t border-rim text-sm">
      <Show when={props.loading}>
        <div class="text-xs text-muted animate-pulse">{t("post.loading")}</div>
      </Show>
      <Show when={!props.loading && props.data}>
        <Show
          when={tabs().length > 0}
          fallback={
            <div class="text-xs text-muted">{t("post.no_activity")}</div>
          }
        >
          <div class="flex border-b border-rim mb-3">
            <For each={tabs()}>
              {(t) => (
                <button
                  onClick={() => setTab(t.key)}
                  class={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px
                    ${
                      tab() === t.key
                        ? "border-accent text-txt"
                        : "border-transparent text-muted hover:text-txt hover:border-rim"
                    }`}
                >
                  {t.label}
                  <span
                    class={`ml-1.5 px-1.5 py-0.5 rounded-full text-[0.625rem] font-bold
                    ${tab() === t.key ? "bg-accent text-accent-fg" : "bg-overlay text-muted"}`}
                  >
                    {t.count}
                  </span>
                </button>
              )}
            </For>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <For each={actors()}>{(a) => <StatActorChip actor={a} />}</For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

interface ItemSourceResponse {
  id: number;
  mid: string;
  uuid: string;
  plink: string;
  llink: string;
  cached: boolean;
  source: unknown;
  error?: string;
}

function PostSource(props: { loading: boolean; data: unknown }) {
  const { t } = useI18n();
  const typed = () => props.data as ItemSourceResponse | null;
  return (
    <div class="mt-3 pt-3 border-t border-rim text-xs">
      <Show when={props.loading}>
        <div class="text-muted animate-pulse">{t("post.loading_source")}</div>
      </Show>
      <Show when={!props.loading && typed()?.error}>
        <div class="text-red-500">{typed()!.error}</div>
      </Show>
      <Show when={!props.loading && typed() && !typed()?.error}>
        <div class="flex flex-wrap gap-x-4 gap-y-0.5 mb-2 text-muted font-mono">
          <span>
            id: <span class="text-txt">{typed()!.id}</span>
          </span>
          <span>
            uuid: <span class="text-txt">{typed()!.uuid}</span>
          </span>
          <span>
            {typed()!.cached ? t("post.cached") : t("post.generated")}
          </span>
          <a
            href={typed()!.plink}
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent hover:underline"
          >
            plink
          </a>
          <a
            href={typed()!.llink}
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent hover:underline"
          >
            llink
          </a>
        </div>
        <pre class="bg-overlay rounded-lg p-3 overflow-x-auto max-h-96 text-txt font-mono whitespace-pre-wrap break-all leading-relaxed">
          {JSON.stringify(typed()!.source, null, 2)}
        </pre>
      </Show>
    </div>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];

function reactionVerbLabel(item: PendingItem, t: Translate): string {
  if (item.verb === "Dislike") return t("moderate.requested_to_dislike");
  if (item.verb === "Announce") return t("moderate.requested_to_repeat");
  return t("moderate.requested_to_like");
}

function PendingReactionsPanel(props: {
  loading: boolean;
  items: PendingItem[];
  busy: number | null;
  onApprove: (iid: number) => void;
  onReject: (iid: number) => void;
}) {
  const { t } = useI18n();

  return (
    <div class="mt-3 pt-3 border-t border-rim">
      <Show when={props.loading}>
        <div class="space-y-2">
          <For each={Array(2)}>
            {() => <div class="h-8 rounded-lg bg-overlay animate-pulse" />}
          </For>
        </div>
      </Show>
      <Show when={!props.loading}>
        <Show
          when={props.items.length > 0}
          fallback={
            <p class="text-xs text-muted">{t("moderate.pending_reactions_empty")}</p>
          }
        >
          <div class="space-y-1.5">
            <For each={props.items}>
              {(item) => {
                const busy = () => props.busy === item.iid;
                return (
                  <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-overlay text-xs">
                    <Show when={item.author.photo?.src}>
                      <img
                        src={item.author.photo?.src}
                        alt=""
                        class="w-5 h-5 rounded-full object-cover shrink-0"
                      />
                    </Show>
                    <span class="min-w-0 flex-1 truncate">
                      <span class="font-medium text-txt">{item.author.name} </span>
                      <span class="text-muted">{reactionVerbLabel(item, t)}</span>
                    </span>
                    <button
                      onClick={() => props.onApprove(item.iid)}
                      disabled={busy()}
                      title={t("directory.approve")}
                      class="flex items-center justify-center w-6 h-6 rounded-full bg-accent text-accent-fg disabled:opacity-50 shrink-0"
                    >
                      <MdOutlineCheck size={13} />
                    </button>
                    <button
                      onClick={() => props.onReject(item.iid)}
                      disabled={busy()}
                      title={t("moderate.reject")}
                      class="flex items-center justify-center w-6 h-6 rounded-full bg-elevated text-red-500 disabled:opacity-50 shrink-0"
                    >
                      <MdOutlineClose size={13} />
                    </button>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function FolderPicker(props: {
  loading: boolean;
  itemFolders: string[];
  allFolders: string[];
  saving: string | null;
  newInput: string;
  onSetInput: (v: string) => void;
  onToggle: (name: string) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const mergedFolders = () => {
    const all = new Set([...props.allFolders, ...props.itemFolders]);
    return [...all].sort();
  };

  return (
    <div class="mt-3 pt-3 border-t border-rim">
      <Show when={props.loading}>
        <div class="flex gap-1.5 flex-wrap">
          <For each={Array(3)}>
            {() => <div class="h-7 w-20 rounded-lg bg-overlay animate-pulse" />}
          </For>
        </div>
      </Show>
      <Show when={!props.loading}>
        <div class="flex flex-wrap gap-1.5 mb-2">
          <Show
            when={mergedFolders().length > 0}
            fallback={
              <p class="text-xs text-muted mb-2">{t("post.no_folders_yet")}</p>
            }
          >
            <For each={mergedFolders()}>
              {(folder) => {
                const inFolder = () => props.itemFolders.includes(folder);
                const saving = () => props.saving === folder;
                return (
                  <button
                    onClick={() => props.onToggle(folder)}
                    disabled={!!props.saving}
                    class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs
                           transition-colors disabled:opacity-60 select-none"
                    classList={{
                      "bg-accent text-accent-fg font-medium": inFolder(),
                      "bg-overlay text-muted hover:bg-elevated hover:text-txt":
                        !inFolder(),
                    }}
                    title={
                      inFolder()
                        ? `Remove from "${folder}"`
                        : `Save to "${folder}"`
                    }
                  >
                    <Show
                      when={saving()}
                      fallback={
                        <Show
                          when={inFolder()}
                          fallback={<MdFillFolder_open size={12} />}
                        >
                          <MdFillFolder size={12} class="shrink-0" />
                        </Show>
                      }
                    >
                      <svg
                        class="w-3 h-3 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                        />
                        <path
                          class="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                    </Show>
                    <span class="truncate max-w-[100px]">{folder}</span>
                  </button>
                );
              }}
            </For>
          </Show>
          <input
            type="text"
            placeholder={t("post.new_folder_placeholder")}
            value={props.newInput}
            onInput={(e) => props.onSetInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && props.onAdd()}
            class="ml-auto flex h-7 text-xs border border-rim rounded-lg bg-surface text-txt
                   placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent px-2"
          />
          <button
            onClick={props.onAdd}
            disabled={!props.newInput.trim() || !!props.saving}
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium
                   bg-accent text-accent-fg disabled:opacity-40 transition-colors"
          >
            <MdFillAdd size={13} />
            <span>{t("post.add_folder")}</span>
          </button>
        </div>
      </Show>
    </div>
  );
}

interface DeliveryEntry {
  name: string;
  result: string;
  time: string;
}

function DeliveryReport(props: {
  loading: boolean;
  data: DeliveryEntry[] | null;
}) {
  const { t, locale } = useI18n();

  const resultClass = (result: string) => {
    if (result === "posted" || result === "accepted for delivery")
      return "text-green-500";
    if (result === "queued") return "text-yellow-500";
    if (result.includes("denied") || result.includes("not found"))
      return "text-red-500";
    return "text-muted";
  };

  return (
    <div class="mt-3 pt-3 border-t border-rim text-xs">
      <Show when={props.loading}>
        <div class="text-muted animate-pulse">{t("post.loading")}</div>
      </Show>
      <Show when={!props.loading && props.data}>
        <Show
          when={(props.data?.length ?? 0) > 0}
          fallback={<div class="text-muted">{t("post.delivery_no_data")}</div>}
        >
          <table class="w-full">
            <thead>
              <tr class="text-muted border-b border-rim">
                <th class="text-left pb-1.5 font-medium pr-3">Recipient</th>
                <th class="text-left pb-1.5 font-medium pr-3">Status</th>
                <th class="text-left pb-1.5 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.data!}>
                {(entry) => (
                  <tr class="border-b border-rim/40 last:border-0">
                    <td class="py-1.5 pr-3 text-txt max-w-[10rem] truncate">
                      {entry.name}
                    </td>
                    <td
                      class={`py-1.5 pr-3 font-mono ${resultClass(entry.result)}`}
                    >
                      {entry.result}
                    </td>
                    <td class="py-1.5 text-muted whitespace-nowrap">
                      {new Date(entry.time + "Z").toLocaleString(locale())}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </Show>
    </div>
  );
}

function ActionBtn(props: {
  icon: any;
  count: number;
  label: string;
  onClick: () => void;
  active?: boolean;
  activeClass: string;
}) {
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
              transition-colors select-none hover:bg-overlay
              ${props.active ? props.activeClass : "text-muted"}`}
    >
      {props.icon}
      <span>{props.count}</span>
    </button>
  );
}

function CompactActionBtn(props: {
  icon: any;
  count: number;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      class={`flex items-center gap-1 px-2 py-1 rounded-md text-xs
              transition-colors select-none hover:bg-overlay
              ${props.active ? "text-accent" : "text-subtle"}`}
    >
      {props.icon}
      <span>{props.count}</span>
    </button>
  );
}
