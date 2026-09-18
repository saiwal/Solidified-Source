import { createSignal, For, Show, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { storageSet, storageDel } from "@utsukta/spa-core/lib/storage";
import type { SavedDraft } from "@/shared/editor/store/createComposerStore";
import { listServerDrafts, deleteServerDraft } from "@/shared/editor/api/drafts";
import PostComposer from "@/shared/editor/composers/PostComposer";
import ArticleComposerModal from "@/shared/editor/composers/ArticleComposerModal";
import NoteComposerModal from "@/shared/editor/composers/NoteComposerModal";
import DMComposer from "@/shared/editor/composers/DMComposer";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillDelete } from "solid-icons/md";

const DRAFT_TYPES = "post,article,webpage,wiki,note,dm";
const SHOWN_TYPES = ["post", "article", "webpage", "wiki", "note", "dm"];

// ── Scope helpers ─────────────────────────────────────────────────────────────

function scopeParts(scope: string): { type: string; action: string; id: string } {
  const [type = "", action = "", ...rest] = scope.split(":");
  return { type, action, id: rest.join(":") };
}

function isLoadable(scope: string): boolean {
  const { type, action, id } = scopeParts(scope);
  if (type === "post" && action === "new") return true;
  if (type === "article" && (action === "new" || action === "edit")) return true;
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

// Short absolute date — "Jul 30", falling back to a year suffix once it's stale
function formatDate(ms: number): string {
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

type DraftEntry = { scope: string; draft: SavedDraft };

// ── Skeleton ──────────────────────────────────────────────────────────────────

const SkeletonRow = () => (
  <div class="px-3.5 py-3 animate-pulse space-y-2">
    <div class="h-3.5 bg-overlay rounded w-2/3" />
    <div class="h-3 bg-overlay rounded w-4/5" />
    <div class="flex items-center justify-between pt-0.5">
      <div class="h-3.5 w-12 bg-overlay rounded" />
      <div class="h-3 w-10 bg-overlay rounded" />
    </div>
  </div>
);

// ── Widget ────────────────────────────────────────────────────────────────────

export default function DraftsWidget() {
  const auth = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [entries, setEntries] = createSignal<DraftEntry[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [activeEntry, setActiveEntry] = createSignal<DraftEntry | null>(null);
  const [articleEntry, setArticleEntry] = createSignal<DraftEntry | null>(null);
  const [noteEntry, setNoteEntry] = createSignal<DraftEntry | null>(null);
  const [dmEntry, setDmEntry] = createSignal<DraftEntry | null>(null);
  const [deleting, setDeleting] = createSignal<string | null>(null);

  // Reactive label — called in JSX so Solid tracks t() reads
  function scopeLabel(scope: string): string {
    const { type, action } = scopeParts(scope);
    if (action === "reply") return t("hq.draft_reply");
    if (type === "post")    return t("hq.draft_post");
    if (type === "comment") return t("hq.draft_comment");
    if (type === "article") return t("hq.draft_article");
    if (type === "webpage") return t("hq.draft_webpage");
    if (type === "wiki")    return t("hq.draft_wiki");
    if (type === "event")   return t("hq.draft_event");
    if (type === "note")    return t("hq.draft_note");
    if (type === "dm")      return t("hq.draft_dm");
    return t("hq.draft_label");
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true);
    try {
      const serverDrafts = await listServerDrafts(DRAFT_TYPES);
      const results = serverDrafts
        .filter((sd) => SHOWN_TYPES.includes(scopeParts(sd.scope).type))
        .map((sd) => ({
          scope: sd.scope,
          draft: { ...sd, id: sd.serverMid },
        }));
      results.sort((a, b) => b.draft.updated - a.draft.updated);
      setEntries(results);
    } finally {
      setLoading(false);
    }
  }

  onMount(loadAll);

  // ── Delete ────────────────────────────────────────────────────────────────

  async function deleteDraft(scope: string, id: string) {
    setDeleting(id);
    try {
      void deleteServerDraft(id); // id === serverMid for server-only drafts
      setEntries((prev) => prev.filter((e) => !(e.scope === scope && e.draft.id === id)));
    } finally {
      setDeleting(null);
    }
  }

  // A composer can fire onSent/onSaved *and then* onClose (DMComposer does),
  // so the close handler must not assume its entry signal is still set.
  const closeEntry =
    (get: () => DraftEntry | null, set: (v: DraftEntry | null) => void) => () => {
      const entry = get();
      if (entry) void storageDel(`pending-draft:${entry.scope}`);
      set(null);
    };

  // ── Load ──────────────────────────────────────────────────────────────────

  async function handleLoad(entry: DraftEntry) {
    const { type, action, id } = scopeParts(entry.scope);

    // Always write a pending-draft so the target composer restores ALL fields
    // (and sets loadedDraftId, which auto-deletes the draft on publish)
    await storageSet(`pending-draft:${entry.scope}`, entry.draft);

    if (type === "post" && action === "new") {
      setActiveEntry(entry);
      return;
    }

    if (type === "article") {
      setArticleEntry(entry);
      return;
    }

    if (type === "note") {
      setNoteEntry(entry);
      return;
    }

    // DM recipients ride in the draft's `extra`, restored by DMComposer from
    // the pending-draft written above — nothing extra to pass in here.
    if (type === "dm" && action === "new") {
      setDmEntry(entry);
      return;
    }

    // Webpage/wiki composers live on their own routed pages, not modals —
    // the pending-draft written above is picked up automatically once that
    // page mounts (webpage via createComposerStore, wiki via WikiPageView).
    if (type === "webpage" && action === "new") {
      navigate(`/webpages/${auth()?.nick ?? ""}/new`);
      return;
    }

    if (type === "wiki") {
      navigate(`/wiki/${auth()?.nick ?? ""}/${action}/${id}`);
    }
  }

  // For edit drafts the composer needs the article uuid (it posts to
  // /api/item/:uuid/edit); field values come from the draft itself
  function articleInitial() {
    const entry = articleEntry();
    if (!entry) return undefined;
    const { action, id: uuid } = scopeParts(entry.scope);
    if (action !== "edit" || !uuid) return undefined;
    const d = entry.draft;
    return {
      uuid,
      title: d.title,
      summary: d.summary,
      slug: d.slug,
      category: d.category,
      body: d.body,
    };
  }

  // For edit drafts the composer needs the target note's mid (it posts to
  // /api/item/:mid/edit); field values come from the draft itself
  function noteInitial() {
    const entry = noteEntry();
    if (!entry) return undefined;
    const { action, id: mid } = scopeParts(entry.scope);
    if (action !== "edit" || !mid) return undefined;
    return {
      mid,
      body: entry.draft.body,
      mimetype: entry.draft.mimetype,
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div data-tour="hq.drafts" class="bg-surface border border-rim rounded-2xl shadow-sm flex flex-col overflow-hidden">

        {/* Header */}
        <div class="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between shrink-0">
          <span class="text-xs font-medium uppercase tracking-wider text-muted">
            {t("hq.drafts")}
          </span>
          <div class="flex items-center gap-1.5">
            <Show when={!loading() && entries().length > 0}>
              <span class="text-xs text-muted tabular-nums">{entries().length}</span>
            </Show>
            {/* Refresh */}
            <button
              type="button"
              title={t("hq.retry")}
              onClick={loadAll}
              disabled={loading()}
              class="p-0.5 rounded text-muted hover:text-txt transition-colors disabled:opacity-40"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                classList={{ "animate-spin": loading() }}>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003
                     8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Loading skeletons */}
        <Show when={loading()}>
          <For each={[1, 2, 3]}>{() => <SkeletonRow />}</For>
        </Show>

        {/* Empty state */}
        <Show when={!loading() && entries().length === 0}>
          <div class="px-4 py-6 flex flex-col items-center gap-2 text-muted">
            <svg class="w-7 h-7 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M5 5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M15 3v5H9V3m0 14h6" />
            </svg>
            <span class="text-xs">{t("hq.no_drafts")}</span>
          </div>
        </Show>

        {/* Draft list */}
        <Show when={!loading()}>
          <div class="divide-y divide-rim">
            <For each={entries()}>
              {(entry) => {
                const loadable = () => isLoadable(entry.scope);
                const isDeleting = () => deleting() === entry.draft.id;

                return (
                  <div class="px-3.5 py-3 hover:bg-elevated group transition-colors"
                    classList={{ "opacity-50 pointer-events-none": isDeleting() }}>

                    {/* Line 1 + 2 — title & summary */}
                    <div
                      class={loadable() ? "cursor-pointer" : ""}
                      onClick={() => { if (loadable()) void handleLoad(entry); }}
                    >
                      <p class="text-sm font-medium text-txt truncate leading-snug">
                        <Show when={entry.draft.title} fallback={<em class="font-normal text-muted">{t("hq.untitled_draft")}</em>}>
                          {entry.draft.title}
                        </Show>
                      </p>
                      <p class="text-xs text-muted truncate mt-0.5">
                        <Show when={entry.draft.preview} fallback={<em>{t("hq.empty_draft")}</em>}>
                          {entry.draft.preview}
                        </Show>
                      </p>
                    </div>

                    {/* Line 3 — type badge · delete · date (right-aligned) */}
                    <div class="flex items-center justify-between mt-1.5">
                      <span class={`shrink-0 text-[0.625rem] font-semibold px-1.5 py-0.5 rounded
                                    border leading-none select-none ${badgeClass(entry.scope)}`}>
                        {scopeLabel(entry.scope)}
                      </span>
                      <div class="flex items-center gap-2.5">
                        <button
                          type="button"
                          title={t("hq.delete_draft")}
                          onClick={() => void deleteDraft(entry.scope, entry.draft.id)}
                          class="p-0.5 -m-0.5 rounded text-muted/70 opacity-100 md:opacity-0 md:group-hover:opacity-100
                                 hover:text-red-500 focus-visible:opacity-100 transition-all"
                        >
                          <Show
                            when={!isDeleting()}
                            fallback={
                              <svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0
                                     0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            }
                          >
                            <MdFillDelete size={12} />
                          </Show>
                        </button>
                        <span
                          class="text-[0.625rem] text-muted/60 tabular-nums shrink-0"
                          title={new Date(entry.draft.created).toLocaleString()}
                        >
                          {formatDate(entry.draft.created)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      {/* Article composer — opened when loading an article draft */}
      <Show when={articleEntry() !== null && !auth.loading && auth()?.uid}>
        <ArticleComposerModal
          uid={auth()!.uid}
          nick={auth()?.nick ?? ""}
          heading={articleInitial() ? t("articles.edit_article") : t("articles.new_article")}
          initial={articleInitial()}
          onSaved={() => {
            setArticleEntry(null);
            void loadAll();
          }}
          onClose={closeEntry(articleEntry, setArticleEntry)}
        />
      </Show>

      {/* Note composer — opened when loading a note draft */}
      <Show when={noteEntry() !== null && !auth.loading}>
        <NoteComposerModal
          nick={auth()?.nick ?? ""}
          heading={noteInitial() ? t("notepad.edit_note") : t("notepad.new_note")}
          initial={noteInitial()}
          onSaved={() => {
            setNoteEntry(null);
            void loadAll();
          }}
          onClose={closeEntry(noteEntry, setNoteEntry)}
        />
      </Show>

      {/* DM composer — opened when loading a dm:new draft */}
      <Show when={dmEntry() !== null && !auth.loading && auth()?.uid}>
        <DMComposer
          profileUid={auth()!.uid}
          open={true}
          onSent={() => void loadAll()}
          onClose={closeEntry(dmEntry, setDmEntry)}
        />
      </Show>

      {/* Post composer — opened when loading a post:new draft */}
      <Show when={activeEntry() !== null && !auth.loading && auth()?.uid}>
        <PostComposer
          profileUid={auth()!.uid}
          open={true}
          onPosted={() => {
            void deleteDraft(activeEntry()!.scope, activeEntry()!.draft.id);
            setActiveEntry(null);
          }}
          onClose={closeEntry(activeEntry, setActiveEntry)}
        />
      </Show>
    </>
  );
}
