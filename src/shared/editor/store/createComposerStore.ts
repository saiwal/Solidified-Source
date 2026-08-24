import { truncateError } from "@utsukta/spa-core/lib/fetch";
import { createSignal, createEffect } from "solid-js";
import { toast } from "@utsukta/spa-core/store/toast";
import { storageGet, storageSet, storageDel } from "@utsukta/spa-core/lib/storage";
import { listServerDrafts, saveServerDraft, deleteServerDraft } from "../api/drafts";
import { isEncryptedBody } from "@utsukta/spa-core/lib/postCrypto";
import type { MimeType, ComposerMeta } from "../types/editor.types";

export type SubmitFn = (body: string, meta: ComposerMeta) => Promise<void>;

export type ComposerStore = ReturnType<typeof createComposerStore>;

export type SavedDraft = {
  id: string;
  serverMid?: string;
  created: number;
  updated: number;
  preview: string;
  body: string;
  title: string;
  summary: string;
  slug: string;
  category: string;
  mimetype: MimeType;
  /** Composer-specific fields the shared store doesn't know about (ACL,
   *  poll, layout template, article lang/series, wiki commit message, …).
   *  Opaque here — each composer packs/unpacks its own shape. */
  extra?: Record<string, unknown> | null;
};

/**
 * Factory — call once per composer *instance* (inside the component body),
 * never at module level unless the composer is a true singleton.
 *
 * `scope` is used as the IDB draft key, so make it unique:
 *   "hq:post", "article:new", "comment:<parentMid>"
 *
 * When `options.initialBody` is provided the IDB draft will NOT override it.
 */
type LocalDraft = {
  body: string;
  title: string;
  summary: string;
  slug: string;
  category: string;
  mimetype: MimeType;
};

export function createComposerStore(
  submitFn: SubmitFn,
  scope: string,
  options?: {
    initialBody?: string;
    /** Seeds the meta fields alongside initialBody — used when reopening an
     *  existing item for editing, so the form starts from what's stored. */
    initialTitle?: string;
    initialSummary?: string;
    initialCategory?: string;
    initialMimetype?: MimeType;
  },
) {
  const DRAFT_KEY = `draft:${scope}`;

  const [body, setBody]         = createSignal(options?.initialBody ?? "");
  const [title, setTitle]       = createSignal(options?.initialTitle ?? "");
  const [summary, setSummary]   = createSignal(options?.initialSummary ?? "");
  const [slug, setSlug]         = createSignal("");
  const [category, setCategory] = createSignal(options?.initialCategory ?? "");
  const [mimetype, setMimetype] = createSignal<MimeType>(options?.initialMimetype ?? "text/bbcode");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError]       = createSignal<string | null>(null);
  // WYSIWYG has nothing meaningful to show for already-encrypted content —
  // bbcodeToHtml() just renders an inert "🔒 Encrypted content" placeholder
  // button for [crypt]...[/crypt] (see bbcode.ts) — so default straight to
  // the Source tab, which shows the real body, whenever we're seeding one.
  const [tab, setTab] = createSignal<"wysiwyg" | "source">(
    options?.initialBody && isEncryptedBody(options.initialBody) ? "source" : "wysiwyg",
  );
  const [savedDrafts, setSavedDrafts] = createSignal<SavedDraft[]>([]);
  const [loadedDraftId, setLoadedDraftId] = createSignal<string | null>(null);
  // Creation time of the currently-loaded draft, so re-saving it doesn't
  // stomp its original `created` with "now" (cosmetic — see saveAsDraft).
  const [loadedDraftCreated, setLoadedDraftCreated] = createSignal<number | null>(null);
  // Set whenever a saved draft's `extra` bag is restored — either via
  // loadSavedDraft() or the cross-navigation pending-draft below. Composers
  // that pack type-specific fields into `extra` watch this to restore their
  // own local signals (ACL, poll, layout template, …).
  const [restoredExtra, setRestoredExtra] = createSignal<Record<string, unknown> | null>(null);
  // Prevents the autosave effect from running (and deleting the draft) before
  // the async storage read has had a chance to restore the previous body.
  const [initialized, setInitialized] = createSignal(false);

  // Load saved drafts from server, filtered to this scope
  listServerDrafts(scope.split(":")[0]).then((serverDrafts) => {
    const forScope = serverDrafts
      .filter((sd) => sd.scope === scope)
      .map((sd) => ({ ...sd, id: sd.serverMid }));
    setSavedDrafts(forScope);
  });

  // On init, a pending-draft (written cross-navigation by the HQ DraftsWidget) takes
  // priority over the regular auto-save; fall back to auto-save if none present.
  const PENDING_KEY = `pending-draft:${scope}`;
  storageGet<SavedDraft | null>(PENDING_KEY, null).then(async (pending) => {
    if (pending && !options?.initialBody) {
      setBody(pending.body);
      setTitle(pending.title);
      setSummary(pending.summary);
      setSlug(pending.slug);
      setCategory(pending.category);
      setMimetype(pending.mimetype);
      setLoadedDraftId(pending.id);
      setLoadedDraftCreated(pending.created);
      if (isEncryptedBody(pending.body)) setTab("source");
      if (pending.extra) setRestoredExtra(pending.extra);
      await storageDel(PENDING_KEY);
    } else if (!options?.initialBody) {
      // Support both the new LocalDraft shape and the old plain-string format
      const raw = await storageGet<LocalDraft | string | null>(DRAFT_KEY, null);
      if (raw) {
        const local: LocalDraft = typeof raw === "string"
          ? { body: raw, title: "", summary: "", slug: "", category: "", mimetype: "text/bbcode" }
          : raw;
        setBody(local.body);
        setTitle(local.title);
        setSummary(local.summary);
        setSlug(local.slug);
        setCategory(local.category);
        setMimetype(local.mimetype);
        if (isEncryptedBody(local.body)) setTab("source");
      }
    }
    setInitialized(true);
  });

  // Persist the full local draft while typing; clear when submitted or reset.
  // Guard on `initialized` so the effect doesn't fire (and delete the saved
  // draft) during the async window before storage has been read on mount.
  createEffect(() => {
    if (!initialized()) return;
    const snapshot: LocalDraft = {
      body:     body(),
      title:    title(),
      summary:  summary(),
      slug:     slug(),
      category: category(),
      mimetype: mimetype(),
    };
    if (snapshot.body) storageSet(DRAFT_KEY, snapshot);
    else storageDel(DRAFT_KEY);
  });

  async function submit(extra: ComposerMeta = {}, bodyOverride?: string) {
    const submitBody = bodyOverride ?? body();
    if (!submitBody.trim() || submitting()) return;
    setError(null);
    setSubmitting(true);
    try {
      await submitFn(submitBody, {
        title:    title(),
        summary:  summary(),
        slug:     slug(),
        category: category(),
        mimetype: mimetype(),
        ...extra,
      });
      // Reset on success
      setBody("");
      setTitle("");
      setSummary("");
      setSlug("");
      setCategory("");
      storageDel(DRAFT_KEY);
      const draftId = loadedDraftId();
      if (draftId) {
        setLoadedDraftId(null);
        setLoadedDraftCreated(null);
        void deleteSavedDraft(draftId);
      }
    } catch (err) {
      const msg = truncateError(err instanceof Error ? err.message : "Submit failed");
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setBody("");
    setTitle("");
    setSummary("");
    setSlug("");
    setCategory("");
    setError(null);
    setLoadedDraftId(null);
    setLoadedDraftCreated(null);
    storageDel(DRAFT_KEY);
  }

  function makeDraftPreview(b: string): string {
    return b
      .replace(/<[^>]+>/g, "")
      .replace(/\[[\w/]+(?:=[^\]]+)?\]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  // bodyOverride: for composers whose real body is assembled from sub-forms
  // rather than typed into the editor (CardComposer's quote/definition/link
  // templates), body() is empty and would save a blank draft. Same override
  // the submit() path takes, for the same reason.
  async function saveAsDraft(
    extra?: Record<string, unknown>,
    bodyOverride?: string,
  ): Promise<void> {
    const draftBody = bodyOverride ?? body();
    const now = Date.now();
    // Reuse the loaded draft's mid so this updates it in place instead of
    // creating a new draft item every time — saveServerDraft() picks
    // create-vs-update off tempDraft.serverMid.
    const existingId = loadedDraftId();
    const tempDraft: SavedDraft = {
      id: existingId ?? "",
      serverMid: existingId ?? undefined,
      created: existingId ? (loadedDraftCreated() ?? now) : now,
      updated: now,
      preview: makeDraftPreview(draftBody),
      body: draftBody,
      title: title(),
      summary: summary(),
      slug: slug(),
      category: category(),
      mimetype: mimetype(),
      extra: extra ?? null,
    };
    const serverMid = await saveServerDraft(tempDraft, scope);
    if (!serverMid) {
      toast.error("Failed to save draft");
      return;
    }
    const draft: SavedDraft = { ...tempDraft, id: serverMid, serverMid };
    setLoadedDraftId(serverMid);
    setLoadedDraftCreated(draft.created);
    setSavedDrafts([draft, ...savedDrafts().filter((d) => d.id !== serverMid)]);
  }

  function loadSavedDraft(draft: SavedDraft): void {
    setBody(draft.body);
    setTitle(draft.title);
    setSummary(draft.summary);
    setSlug(draft.slug);
    setCategory(draft.category);
    setMimetype(draft.mimetype);
    setLoadedDraftId(draft.id);
    setLoadedDraftCreated(draft.created);
    setTab(isEncryptedBody(draft.body) ? "source" : "wysiwyg");
    setRestoredExtra(draft.extra ?? null);
  }

  async function deleteSavedDraft(id: string): Promise<void> {
    setSavedDrafts(savedDrafts().filter((d) => d.id !== id));
    void deleteServerDraft(id); // id === serverMid for server-only drafts
  }

  return {
    // State
    body, setBody,
    title, setTitle,
    summary, setSummary,
    slug, setSlug,
    category, setCategory,
    mimetype, setMimetype,
    submitting,
    error,
    tab, setTab,
    savedDrafts,
    restoredExtra,
    // Actions
    submit,
    reset,
    saveAsDraft,
    loadSavedDraft,
    deleteSavedDraft,
  };
}
