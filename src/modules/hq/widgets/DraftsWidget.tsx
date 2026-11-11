import { useNavigate } from "@solidjs/router";
import { storageDel } from "@utsukta/spa-core/lib/storage";
import { deleteServerDraft } from "@/shared/editor/api/drafts";
import DraftsWidgetBase, { type DraftEntry } from "@/shared/editor/components/DraftsWidgetBase";
import { openComposer, type ComposerKind } from "@/shared/views/modal-host";
import { useAuth, channelKey } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";

// Comma-separated scope prefixes — the /spa/drafts type filter.
const DRAFT_TYPES = "post,article,card,webpage,wiki,note,dm";

// ── Scope helpers ─────────────────────────────────────────────────────────────

function scopeParts(scope: string): { type: string; action: string; id: string } {
  const [type = "", action = "", ...rest] = scope.split(":");
  return { type, action, id: rest.join(":") };
}

function isLoadable(scope: string): boolean {
  const { type, action, id } = scopeParts(scope);
  if (type === "post" && action === "new") return true;
  if ((type === "article" || type === "card") && (action === "new" || action === "edit")) return true;
  if (type === "note" && (action === "new" || action === "edit")) return true;
  if (type === "dm" && action === "new") return true;
  // webpage:edit needs the page's numeric iid (not in scope) to load the
  // original page data, so only fresh, still-empty pages can be resumed here
  if (type === "webpage" && action === "new") return true;
  // wiki scope is `wiki:<wikiName>:<pageName>` — both segments are the
  // actual route params, so any well-formed wiki scope can be resumed
  if (type === "wiki" && action && id) return true;
  return false;
}

// Badge colour per content type
const TYPE_BADGE: Record<string, string> = {
  post:    "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
  article: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  card:    "bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/25",
  comment: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
  webpage: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25",
  wiki:    "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25",
  event:   "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25",
  note:    "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/25",
  dm:      "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25",
};
const DEFAULT_BADGE = "bg-elevated text-muted border-rim";

function badgeClass(scope: string): string {
  return TYPE_BADGE[scopeParts(scope).type] ?? DEFAULT_BADGE;
}

// ── Widget ────────────────────────────────────────────────────────────────────
// The list itself (fetch, refetch on draftsVersion, delete, rows) is
// DraftsWidgetBase, shared with the per-module drafts widgets; this supplies
// what is HQ's own: every type at once, a badge per type, and where each
// kind of draft reopens.

export default function DraftsWidget() {
  const auth = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  // Reactive label — called in JSX so Solid tracks t() reads
  function scopeLabel(scope: string): string {
    const { type, action } = scopeParts(scope);
    if (action === "reply") return t("hq.draft_reply");
    if (type === "post")    return t("hq.draft_post");
    if (type === "comment") return t("hq.draft_comment");
    if (type === "article") return t("hq.draft_article");
    if (type === "card")    return t("hq.draft_card");
    if (type === "webpage") return t("hq.draft_webpage");
    if (type === "wiki")    return t("hq.draft_wiki");
    if (type === "event")   return t("hq.draft_event");
    if (type === "note")    return t("hq.draft_note");
    if (type === "dm")      return t("hq.draft_dm");
    return t("hq.draft_label");
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function handleLoad(entry: DraftEntry) {
    const { type, action, id } = scopeParts(entry.scope);

    // DraftsWidgetBase has already written the pending-draft, so the target
    // composer restores ALL fields (and sets loadedDraftId, which auto-deletes
    // the draft on publish).

    // Webpage/wiki composers live on their own routed pages, not modals —
    // the pending-draft written above is picked up automatically once that
    // page mounts (webpage via createComposerStore, wiki via WikiPageView).
    if (type === "webpage" && action === "new") {
      navigate(`/webpages/${auth()?.nick ?? ""}/new`);
      return;
    }
    if (type === "wiki") {
      navigate(`/wiki/${auth()?.nick ?? ""}/${action}/${id}`);
      return;
    }

    // The rest are hosted composers, keyed on the draft scope itself — so
    // loading a draft that is already open surfaces that composer rather than
    // opening a second one on the same draft.
    const kind = type as ComposerKind;
    openComposer({
      kind,
      scope: entry.scope,
      title: scopeLabel(entry.scope),
      props: {
        profileUid: auth()?.uid ?? 0,
        uid: auth()?.uid ?? 0,
        nick: auth()?.nick ?? "",
        initial: composerInitial(entry),
        // DM recipients ride in the draft's `extra`, restored by DMComposer
        // from the pending-draft written above.
        onPosted: () => void deleteServerDraft(entry.draft.id),
        onClose: () => void storageDel(channelKey(`pending-draft:${entry.scope}`)),
      },
    });
  }

  // An edit draft's composer needs the target's own id (it posts to
  // /spa/item/:id/edit) — articles carry a uuid, notes a mid; every field value
  // comes from the draft itself. A `new` draft seeds entirely from the
  // pending-draft key, so it needs no `initial` at all.
  function composerInitial(entry: DraftEntry) {
    const { type, action, id } = scopeParts(entry.scope);
    if (action !== "edit" || !id) return undefined;
    const d = entry.draft;
    if (type === "note") return { mid: id, body: d.body, mimetype: d.mimetype };
    return {
      uuid: id,
      title: d.title,
      summary: d.summary,
      slug: d.slug,
      category: d.category,
      body: d.body,
    };
  }

  return (
    <div data-tour="hq.drafts">
      <DraftsWidgetBase
        scopeType={DRAFT_TYPES}
        title={t("hq.drafts")}
        emptyText={t("hq.no_drafts")}
        refreshTitle={t("hq.retry")}
        deleteTitle={t("hq.delete_draft")}
        untitledText={t("hq.untitled_draft")}
        emptyDraftText={t("hq.empty_draft")}
        badgeClassName={badgeClass}
        badgeLabel={scopeLabel}
        isLoadable={isLoadable}
        onLoad={handleLoad}
      />
    </div>
  );
}
