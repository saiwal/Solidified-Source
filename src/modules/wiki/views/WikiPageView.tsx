// src/modules/wiki/views/WikiPageView.tsx
import {
  createEffect, createSignal, Show, For, onCleanup,
} from "solid-js";
import WikiComposer from "@/shared/editor/composers/WikiComposer";
import { toast } from "@utsukta/spa-core/store/toast";
import { useParams, A, useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import DOMPurify from "dompurify";
import { MdOutlineList } from "solid-icons/md";
import { hydrateLatex } from "@utsukta/spa-core/lib/hydrateLatex";
import { storageGet, storageDel } from "@utsukta/spa-core/lib/storage";
import { saveServerDraft, deleteServerDraft } from "@/shared/editor/api/drafts";
import type { SavedDraft } from "@/shared/editor/store/createComposerStore";
import {
  pageData, pageLoading, pageNotFound, editMode, draftContent, draftCommitMsg, canWrite,
  pages, currentWiki, pagesLoading,
  historyData, historyLoading, showHistory,
  previewRevision, previewHtml, previewLoading,
  loadPage, loadWikiPages, loadHistory, toggleEditMode, toggleHistory, resetPage,
  loadRevisionPreview, closePreview, enterEditModeWithContent,
} from "../store";
import { savePage, deletePage, revertPage, renamePage, type WikiMimeType } from "../api";

// ── Floating page list (small screens) ──────────────────────────────────────────

function FloatingPageList(props: { nick: string; wikiName: string; pageName: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = createSignal(false);
  const [creatingPage, setCreatingPage] = createSignal(false);
  const [newPageInput, setNewPageInput] = createSignal("");

  function handleNewPage(e: Event) {
    e.preventDefault();
    const name = newPageInput().trim();
    if (!name) return;
    const encoded = encodeURIComponent(name);
    setCreatingPage(false);
    setNewPageInput("");
    setOpen(false);
    navigate(`/wiki/${props.nick}/${props.wikiName}/${encoded}`);
  }

  return (
    <div class="md:hidden fixed top-20 right-4 z-40 flex flex-col items-end">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open()}
        aria-label={t("wiki.wikis")}
        class="w-11 h-11 rounded-full flex items-center justify-center
               bg-elevated border border-rim shadow-lg hover:shadow-xl
               text-muted hover:text-txt transition-all"
      >
        <MdOutlineList size={20} />
      </button>
      <Show when={open()}>
        <div
          class="mt-2 w-64 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto
                 bg-surface border border-rim rounded-xl shadow-2xl p-3 space-y-1"
        >
          <div class="flex items-center justify-between mb-1 gap-2">
            <Show when={currentWiki()}>
              <span class="text-xs font-semibold uppercase tracking-wide text-muted truncate">
                {currentWiki()!.name}
              </span>
            </Show>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close page list"
              class="p-1 rounded text-muted hover:bg-elevated hover:text-txt transition-colors shrink-0"
            >
              ✕
            </button>
          </div>

          <Show when={pagesLoading()}>
            <For each={[1, 2, 3]}>
              {() => <div class="h-6 rounded bg-elevated animate-pulse" />}
            </For>
          </Show>

          <Show when={!pagesLoading()}>
            <For each={pages()}>
              {(p) => (
                <A
                  href={`/wiki/${props.nick}/${props.wikiName}/${p.url_name}`}
                  onClick={() => setOpen(false)}
                  class="block text-sm px-2 py-1 rounded-lg truncate transition-colors"
                  classList={{
                    "bg-elevated text-txt": p.url_name === props.pageName,
                    "text-muted hover:bg-elevated hover:text-txt":
                      p.url_name !== props.pageName,
                  }}
                >
                  {p.name}
                </A>
              )}
            </For>
          </Show>

          <Show when={canWrite()}>
            <div class="pt-2 border-t border-rim mt-2">
              <Show
                when={!creatingPage()}
                fallback={
                  <form onSubmit={handleNewPage} class="space-y-1.5">
                    <input
                      type="text"
                      autofocus
                      class="w-full bg-surface border border-rim text-txt rounded-lg px-2 py-1 text-xs
                             hover:border-rim-strong focus:outline-none"
                      placeholder={t("wiki.page_name_placeholder") as string}
                      value={newPageInput()}
                      onInput={(e) => setNewPageInput(e.currentTarget.value)}
                    />
                    <div class="flex gap-1">
                      <button
                        type="submit"
                        disabled={!newPageInput().trim()}
                        class="flex-1 text-xs bg-accent-muted text-accent px-2 py-1 rounded-md
                               hover:bg-elevated disabled:opacity-50 transition-colors"
                      >
                        {t("wiki.create_page")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCreatingPage(false); setNewPageInput(""); }}
                        class="text-xs text-muted hover:text-txt px-2 py-1 rounded-md transition-colors"
                      >
                        {t("wiki.cancel")}
                      </button>
                    </div>
                  </form>
                }
              >
                <button
                  type="button"
                  onClick={() => setCreatingPage(true)}
                  class="w-full text-left text-xs text-muted hover:text-txt transition-colors px-2 py-1"
                >
                  + {t("wiki.new_page")}
                </button>
              </Show>
            </div>
          </Show>

          <div class="pt-2 border-t border-rim mt-2">
            <A
              href={`/wiki/${props.nick}`}
              onClick={() => setOpen(false)}
              class="text-xs text-muted hover:text-txt transition-colors"
            >
              {t("wiki.all_wikis")}
            </A>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default function WikiPageView() {
  const { t } = useI18n();
  const params   = useParams<{ nick: string; wikiName: string; pageName: string }>();
  const navigate = useNavigate();

  const [saving, setSaving]         = createSignal(false);
  const [deleting, setDeleting]     = createSignal(false);
  const [loadedDraftId, setLoadedDraftId] = createSignal<string | null>(null);
  const [loadedDraftCreated, setLoadedDraftCreated] = createSignal<number | null>(null);
  const [confirmDel, setConfirmDel] = createSignal(false);
  const [reverting, setReverting]   = createSignal<number | null>(null);
  const [renaming, setRenaming]     = createSignal(false);
  const [newPageName, setNewPageName] = createSignal("");
  const [renameBusy, setRenameBusy] = createSignal(false);
  // New page form in sidebar
  const [creatingPage, setCreatingPage]   = createSignal(false);
  const [newPageInput, setNewPageInput]   = createSignal("");

  let lastWikiName = "";

  createEffect(() => {
    const { nick, wikiName, pageName } = params;
    if (!nick || !wikiName || !pageName) return;

    loadPage(nick, wikiName, pageName);

    if (lastWikiName !== wikiName) {
      lastWikiName = wikiName;
      loadWikiPages(nick, wikiName);
    }
  });

  // Auto-open edit mode for pages that don't exist yet (new page flow).
  // Guard with !editMode() to avoid double-toggling if canWrite resolves after pageNotFound.
  createEffect(() => {
    if (!pageLoading() && pageNotFound() && canWrite() && !editMode()) {
      toggleEditMode();
    }
  });

  // Load history when panel is opened
  createEffect(() => {
    if (showHistory() && pageData()) {
      loadHistory(params.nick, params.wikiName, params.pageName);
    }
  });

  // Restore a draft saved from the HQ DraftsWidget straight into edit mode.
  // Scope is `wiki:<wikiName>:<pageName>` — both already URL-path-safe params,
  // so no extra encode/decode is needed to round-trip them.
  createEffect(() => {
    const { nick, wikiName, pageName } = params;
    if (pageLoading() || !nick || !wikiName || !pageName) return;
    const scope = `wiki:${wikiName}:${pageName}`;
    void storageGet<SavedDraft | null>(`pending-draft:${scope}`, null).then(async (pending) => {
      if (!pending) return;
      await storageDel(`pending-draft:${scope}`);
      setLoadedDraftId(pending.id);
      setLoadedDraftCreated(pending.created);
      const commitMsg = (pending.extra as { commitMsg?: string } | null | undefined)?.commitMsg ?? "";
      enterEditModeWithContent(pending.body, commitMsg);
    });
  });

  onCleanup(() => resetPage());

  async function handleSave(body: string, commitMsg: string, mimeType: string) {
    setSaving(true);
    try {
      await savePage(
        params.nick,
        params.wikiName,
        params.pageName,
        // The composer's format wins: on an existing page it is just the
        // page's own mime_type echoed back, and on the create form it is what
        // the author picked. A typelocked wiki overrides it server-side.
        { content: body, commit_msg: commitMsg, mime_type: mimeType as WikiMimeType },
      );
      const draftId = loadedDraftId();
      if (draftId) {
        setLoadedDraftId(null);
        setLoadedDraftCreated(null);
        void deleteServerDraft(draftId);
      }
      toggleEditMode();
      loadPage(params.nick, params.wikiName, params.pageName);
      loadWikiPages(params.nick, params.wikiName);
    } catch (e: any) {
      toast.error(e.message ?? t("wiki.error_saving"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft(body: string, commitMsg: string) {
    const now = Date.now();
    const scope = `wiki:${params.wikiName}:${params.pageName}`;
    // Reuse the loaded draft's mid so this updates it in place instead of
    // creating a new draft item every time — saveServerDraft() picks
    // create-vs-update off serverMid.
    const existingId = loadedDraftId();
    const serverMid = await saveServerDraft(
      {
        id: existingId ?? "",
        serverMid: existingId ?? undefined,
        created: existingId ? (loadedDraftCreated() ?? now) : now,
        updated: now,
        preview: "",
        body,
        title: decodeURIComponent(params.pageName),
        summary: "",
        slug: "",
        category: "",
        mimetype: (pageData()?.page.mime_type ?? "text/bbcode") as SavedDraft["mimetype"],
        extra: { commitMsg },
      },
      scope,
    );
    if (!serverMid) {
      toast.error(t("wiki.error_saving"));
      return;
    }
    setLoadedDraftId(serverMid);
    setLoadedDraftCreated(existingId ? (loadedDraftCreated() ?? now) : now);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePage(params.nick, params.wikiName, params.pageName);
      navigate(`/wiki/${params.nick}/${params.wikiName}/Home`, { replace: true });
    } catch (e: any) {
      toast.error(e.message ?? t("wiki.error_deleting"));
      setDeleting(false);
    }
  }

  async function handleRevert(revision: number) {
    setReverting(revision);
    try {
      await revertPage(params.nick, params.wikiName, params.pageName, revision);
      toast.success(t("wiki.reverted"));
      toggleHistory();
      loadPage(params.nick, params.wikiName, params.pageName);
    } catch (e: any) {
      toast.error(e.message ?? t("wiki.error_reverting"));
    } finally {
      setReverting(null);
    }
  }

  async function handleRename(e: Event) {
    e.preventDefault();
    const name = newPageName().trim();
    if (!name) return;
    setRenameBusy(true);
    try {
      const res = await renamePage(params.nick, params.wikiName, params.pageName, name);
      setRenaming(false);
      setNewPageName("");
      loadWikiPages(params.nick, params.wikiName);
      navigate(`/wiki/${params.nick}/${params.wikiName}/${res.url_name}`, { replace: true });
    } catch (e: any) {
      toast.error(e.message ?? t("wiki.error_renaming"));
    } finally {
      setRenameBusy(false);
    }
  }

  function handleNewPage(e: Event) {
    e.preventDefault();
    const name = newPageInput().trim();
    if (!name) return;
    const encoded = encodeURIComponent(name);
    setCreatingPage(false);
    setNewPageInput("");
    navigate(`/wiki/${params.nick}/${params.wikiName}/${encoded}`);
  }

  const safeHtml = () =>
    DOMPurify.sanitize(pageData()?.html ?? "", { USE_PROFILES: { html: true } });

  const isHome = () => params.pageName === "Home";

  return (
    <div class="flex gap-4 max-w-6xl mx-auto p-4">
      {/* ── Floating page list — collapsed launcher below md ── */}
      <FloatingPageList nick={params.nick} wikiName={params.wikiName} pageName={params.pageName} />

      {/* ── Sidebar: page list ──────────────────────────────────────────── */}
      <aside class="hidden md:flex flex-col w-52 shrink-0 gap-2">
        <div class="bg-surface border border-rim rounded-xl p-3 space-y-1 sticky top-20">
          <Show when={currentWiki()}>
            <div class="text-xs font-semibold uppercase tracking-wide text-muted mb-2 truncate">
              {currentWiki()!.name}
            </div>
          </Show>

          <Show when={pagesLoading()}>
            <For each={[1, 2, 3]}>
              {() => <div class="h-6 rounded bg-elevated animate-pulse" />}
            </For>
          </Show>

          <Show when={!pagesLoading()}>
            <For each={pages()}>
              {(p) => (
                <A
                  href={`/wiki/${params.nick}/${params.wikiName}/${p.url_name}`}
                  class="block text-sm px-2 py-1 rounded-lg truncate transition-colors"
                  classList={{
                    "bg-elevated text-txt": p.url_name === params.pageName,
                    "text-muted hover:bg-elevated hover:text-txt":
                      p.url_name !== params.pageName,
                  }}
                >
                  {p.name}
                </A>
              )}
            </For>
          </Show>

          {/* New page button / form */}
          <Show when={canWrite()}>
            <div class="pt-2 border-t border-rim mt-2">
              <Show
                when={!creatingPage()}
                fallback={
                  <form onSubmit={handleNewPage} class="space-y-1.5">
                    <input
                      type="text"
                      autofocus
                      class="w-full bg-surface border border-rim text-txt rounded-lg px-2 py-1 text-xs
                             hover:border-rim-strong focus:outline-none"
                      placeholder={t("wiki.page_name_placeholder") as string}
                      value={newPageInput()}
                      onInput={(e) => setNewPageInput(e.currentTarget.value)}
                    />
                    <div class="flex gap-1">
                      <button
                        type="submit"
                        disabled={!newPageInput().trim()}
                        class="flex-1 text-xs bg-accent-muted text-accent px-2 py-1 rounded-md
                               hover:bg-elevated disabled:opacity-50 transition-colors"
                      >
                        {t("wiki.create_page")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCreatingPage(false); setNewPageInput(""); }}
                        class="text-xs text-muted hover:text-txt px-2 py-1 rounded-md transition-colors"
                      >
                        {t("wiki.cancel")}
                      </button>
                    </div>
                  </form>
                }
              >
                <button
                  type="button"
                  onClick={() => setCreatingPage(true)}
                  class="w-full text-left text-xs text-muted hover:text-txt transition-colors px-2 py-1"
                >
                  + {t("wiki.new_page")}
                </button>
              </Show>
            </div>
          </Show>

          <div class="pt-2 border-t border-rim mt-2">
            <A
              href={`/wiki/${params.nick}`}
              class="text-xs text-muted hover:text-txt transition-colors"
            >
              {t("wiki.all_wikis")}
            </A>
          </div>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main class="flex-1 min-w-0 space-y-4">

        <Show when={pageLoading()}>
          <div class="space-y-3">
            <div class="h-8 w-1/3 bg-surface border border-rim rounded-xl animate-pulse" />
            <div class="h-4 w-full bg-surface border border-rim rounded animate-pulse" />
            <div class="h-4 w-5/6 bg-surface border border-rim rounded animate-pulse" />
            <div class="h-4 w-4/6 bg-surface border border-rim rounded animate-pulse" />
          </div>
        </Show>

        {/* Page not found */}
        <Show when={!pageLoading() && pageNotFound()}>
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <h1 class="text-xl font-semibold text-txt">
              {decodeURIComponent(params.pageName)}
            </h1>
          </div>

          <Show when={!canWrite()}>
            <p class="text-muted text-sm">{t("wiki.page_not_found")}</p>
          </Show>

          <Show when={canWrite() && editMode()}>
            <p class="text-muted text-xs mb-2">{t("wiki.page_new_hint")}</p>
            <WikiComposer
              nick={params.nick}
              scope={`wiki:${params.nick}:${params.wikiName}:${params.pageName}`}
              initialBody={draftContent()}
              initialCommitMsg={draftCommitMsg()}
              mimeType={currentWiki()?.mime_type ?? "text/bbcode"}
              allowFormatChange={!currentWiki()?.type_lock}
              saving={saving()}
              onSave={handleSave}
              onSaveDraft={handleSaveDraft}
              onCancel={() => navigate(`/wiki/${params.nick}/${params.wikiName}/Home`, { replace: true })}
            />
          </Show>
        </Show>

        <Show when={!pageLoading() && pageData()}>
          {/* Toolbar */}
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-2">
              <h1 class="text-xl font-semibold text-txt">
                {pageData()!.page.name}
              </h1>
            </div>

            <Show when={canWrite()}>
              <div class="flex items-center gap-2">
                <Show when={!editMode()}>
                  {/* History toggle */}
                  <button
                    type="button"
                    onClick={toggleHistory}
                    class="text-sm border border-rim px-3 py-1.5 rounded-lg transition-colors"
                    classList={{
                      "bg-elevated text-txt": showHistory(),
                      "text-muted hover:bg-elevated": !showHistory(),
                    }}
                  >
                    {t("wiki.history")}
                  </button>

                  {/* Rename (not Home) */}
                  <Show when={!isHome()}>
                    <button
                      type="button"
                      onClick={() => { setRenaming(true); setNewPageName(pageData()!.page.name); }}
                      class="text-sm border border-rim text-muted hover:bg-elevated px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {t("wiki.rename")}
                    </button>
                  </Show>

                  <button
                    type="button"
                    onClick={toggleEditMode}
                    class="text-sm border border-rim text-muted hover:bg-elevated px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {t("wiki.edit")}
                  </button>
                </Show>

                <Show when={!isHome() && !editMode()}>
                  <button
                    type="button"
                    onClick={() => setConfirmDel(true)}
                    class="text-sm border border-rim text-muted hover:bg-elevated px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {t("wiki.delete")}
                  </button>
                </Show>
              </div>
            </Show>
          </div>

          {/* Rename form */}
          <Show when={renaming()}>
            <form
              onSubmit={handleRename}
              class="flex items-center gap-2 bg-surface border border-rim rounded-xl p-3"
            >
              <input
                type="text"
                autofocus
                class="flex-1 bg-surface border border-rim text-txt rounded-lg px-3 py-1.5 text-sm
                       hover:border-rim-strong focus:outline-none"
                value={newPageName()}
                onInput={(e) => setNewPageName(e.currentTarget.value)}
              />
              <button
                type="submit"
                disabled={renameBusy() || !newPageName().trim()}
                class="text-sm bg-accent-muted text-accent px-3 py-1.5 rounded-lg
                       hover:bg-elevated disabled:opacity-50 transition-colors"
              >
                {renameBusy() ? t("wiki.renaming") : t("wiki.rename_save")}
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                class="text-sm border border-rim text-muted hover:bg-elevated px-3 py-1.5 rounded-lg"
              >
                {t("wiki.cancel")}
              </button>
            </form>
          </Show>

          {/* History panel */}
          <Show when={showHistory()}>
            <div class="bg-surface border border-rim rounded-xl p-4 space-y-3">
              <h2 class="text-sm font-semibold text-txt">{t("wiki.history")}</h2>

              <Show when={historyLoading()}>
                <For each={[1, 2, 3]}>
                  {() => <div class="h-10 rounded bg-elevated animate-pulse" />}
                </For>
              </Show>

              <Show when={!historyLoading() && historyData().length === 0}>
                <p class="text-muted text-xs">{t("wiki.no_history")}</p>
              </Show>

              <Show when={!historyLoading() && historyData().length > 0}>
                <ul class="divide-y divide-rim">
                  <For each={historyData()}>
                    {(entry) => (
                      <li class="flex items-start justify-between gap-3 py-2.5">
                        <div class="min-w-0">
                          <div class="text-xs text-txt font-medium truncate">
                            {entry.title || t("wiki.no_commit_msg")}
                          </div>
                          <div class="text-xs text-muted mt-0.5">
                            {entry.name} · {entry.date}
                          </div>
                        </div>
                        <div class="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            onClick={() => loadRevisionPreview(
                              params.nick, params.wikiName, params.pageName, entry.revision
                            )}
                            class="text-xs border border-rim text-muted hover:bg-elevated
                                   px-2.5 py-1 rounded-lg transition-colors"
                          >
                            {t("wiki.view_revision")}
                          </button>
                          <button
                            type="button"
                            disabled={reverting() !== null}
                            onClick={() => handleRevert(entry.revision)}
                            class="text-xs border border-rim text-muted hover:bg-elevated
                                   px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {reverting() === entry.revision
                              ? t("wiki.reverting")
                              : t("wiki.revert")}
                          </button>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </Show>

          {/* Edit mode */}
          <Show when={editMode()}>
            <WikiComposer
              nick={params.nick}
              scope={`wiki:${params.nick}:${params.wikiName}:${params.pageName}`}
              initialBody={draftContent()}
              initialCommitMsg={draftCommitMsg()}
              mimeType={pageData()?.page.mime_type ?? "text/bbcode"}
              saving={saving()}
              onSave={handleSave}
              onSaveDraft={handleSaveDraft}
              onCancel={toggleEditMode}
            />
          </Show>

          {/* Rendered view */}
          <Show when={!editMode()}>
            <article
              ref={(el) => createEffect(() => { safeHtml(); hydrateLatex(el); })}
              class="prose prose-neutral dark:prose-invert max-w-none
                     [&_a]:text-accent [&_a]:no-underline [&_a:hover]:underline
                     [&_pre]:bg-elevated [&_pre]:border [&_pre]:border-rim [&_pre]:rounded-xl
                     [&_blockquote]:border-l-2 [&_blockquote]:border-rim [&_blockquote]:text-muted"
              innerHTML={safeHtml()}
            />
          </Show>
        </Show>

        {/* Revision preview modal */}
        <Show when={previewRevision() !== null}>
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div class="bg-surface border border-rim rounded-xl flex flex-col max-w-3xl w-full max-h-[85vh]">
              {/* Header */}
              <div class="flex items-center justify-between px-5 py-3 border-b border-rim shrink-0">
                <span class="text-sm font-medium text-txt">
                  {t("wiki.revision_preview")} #{previewRevision()}
                </span>
                <button
                  type="button"
                  onClick={closePreview}
                  class="text-muted hover:text-txt transition-colors text-lg leading-none"
                >
                  ✕
                </button>
              </div>
              {/* Body */}
              <div class="overflow-y-auto flex-1 px-5 py-4">
                <Show when={previewLoading()}>
                  <div class="space-y-3">
                    <div class="h-4 w-full bg-elevated rounded animate-pulse" />
                    <div class="h-4 w-5/6 bg-elevated rounded animate-pulse" />
                    <div class="h-4 w-4/6 bg-elevated rounded animate-pulse" />
                  </div>
                </Show>
                <Show when={!previewLoading()}>
                  <article
                    ref={(el) => createEffect(() => { previewHtml(); hydrateLatex(el); })}
                    class="prose prose-neutral dark:prose-invert max-w-none
                           [&_a]:text-accent [&_a]:no-underline [&_a:hover]:underline
                           [&_pre]:bg-elevated [&_pre]:border [&_pre]:border-rim [&_pre]:rounded-xl
                           [&_blockquote]:border-l-2 [&_blockquote]:border-rim [&_blockquote]:text-muted"
                    innerHTML={DOMPurify.sanitize(previewHtml(), { USE_PROFILES: { html: true } })}
                  />
                </Show>
              </div>
            </div>
          </div>
        </Show>

        {/* Delete confirmation modal */}
        <Show when={confirmDel()}>
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div class="bg-surface border border-rim rounded-xl p-6 space-y-4 max-w-sm w-full mx-4">
              <p class="text-txt text-sm">
                {t("wiki.delete")} <strong>{params.pageName}</strong>{t("wiki.delete_confirm")}
              </p>
              <div class="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmDel(false)}
                  class="text-sm border border-rim text-muted hover:bg-elevated px-3 py-1.5 rounded-lg"
                >
                  {t("wiki.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting()}
                  class="text-sm border border-rim text-red-400 hover:bg-elevated px-3 py-1.5 rounded-lg
                         disabled:opacity-50"
                >
                  {deleting() ? t("wiki.deleting") : t("wiki.delete")}
                </button>
              </div>
            </div>
          </div>
        </Show>
      </main>
    </div>
  );
}
