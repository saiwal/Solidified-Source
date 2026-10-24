// src/modules/wiki/views/WikiPageView.tsx
import {
  createEffect, createSignal, Show, For, onCleanup,
} from "solid-js";
import WikiComposer from "@/shared/editor/composers/WikiComposer";
import { toast } from "@utsukta/spa-core/store/toast";
import { useParams, A, useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import DOMPurify from "dompurify";
import { rootRelativeLinks } from "@utsukta/spa-core/lib/renderBody";
import { MdOutlineDelete, MdOutlineDrive_file_rename_outline, MdOutlineEdit, MdOutlineHistory, MdOutlineList } from "solid-icons/md";
import PageActions from "@/shared/views/layout/PageActions";
import { hydrateLatex } from "@utsukta/spa-core/lib/hydrateLatex";
import { hydrateMermaid } from "@utsukta/spa-core/lib/hydrateMermaid";
import { useLightbox } from "@utsukta/spa-core/lib/useLightbox";
import { storageGet, storageDel } from "@utsukta/spa-core/lib/storage";
import { channelKey } from "@utsukta/spa-core/store/auth-store";
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

import { Modal, ModalPanel } from "@ui/Modal";
import { Button, IconButton } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card, cardClass } from "@ui/Card";
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
      <IconButton
        label={t("wiki.wikis")}
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open()}
      >
        <MdOutlineList size={20} />
      </IconButton>
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
            <IconButton
              label={t("layout.close")}
              size="sm"
              class="shrink-0"
              onClick={() => setOpen(false)}
            >
              ✕
            </IconButton>
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
                    <Input
                      size="sm"
                      class="w-full"
                      type="text"
                      autofocus
                      placeholder={t("wiki.page_name_placeholder") as string}
                      value={newPageInput()}
                      onInput={(e) => setNewPageInput(e.currentTarget.value)}
                    />
                    <div class="flex gap-1">
                      <Button type="submit" size="sm" class="flex-1" disabled={!newPageInput().trim()}>
                        {t("wiki.create_page")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setCreatingPage(false); setNewPageInput(""); }}
                      >
                        {t("wiki.cancel")}
                      </Button>
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
    void storageGet<SavedDraft | null>(channelKey(`pending-draft:${scope}`), null).then(async (pending) => {
      if (!pending) return;
      await storageDel(channelKey(`pending-draft:${scope}`));
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
    rootRelativeLinks(DOMPurify.sanitize(pageData()?.html ?? "", { USE_PROFILES: { html: true } }));

  const isHome = () => params.pageName === "Home";

  return (
    <div class="flex gap-4 max-w-6xl mx-auto p-4">
      {/* ── Floating page list — collapsed launcher below md ── */}
      <FloatingPageList nick={params.nick} wikiName={params.wikiName} pageName={params.pageName} />

      {/* ── Sidebar: page list ──────────────────────────────────────────── */}
      <aside class="hidden md:flex flex-col w-52 shrink-0 gap-2">
        <Card class="p-3 space-y-1 sticky top-20">
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
                    <Input
                      size="sm"
                      class="w-full"
                      type="text"
                      autofocus
                      placeholder={t("wiki.page_name_placeholder") as string}
                      value={newPageInput()}
                      onInput={(e) => setNewPageInput(e.currentTarget.value)}
                    />
                    <div class="flex gap-1">
                      <Button type="submit" size="sm" class="flex-1" disabled={!newPageInput().trim()}>
                        {t("wiki.create_page")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setCreatingPage(false); setNewPageInput(""); }}
                      >
                        {t("wiki.cancel")}
                      </Button>
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
        </Card>
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

            {/* Home can't be renamed or deleted */}
            <PageActions label={pageData()!.page.name} actions={[
              { label: t("wiki.edit"), icon: MdOutlineEdit, onClick: toggleEditMode, primary: true },
              { label: t("wiki.history"), icon: MdOutlineHistory, onClick: toggleHistory },
              { label: t("wiki.rename"), icon: MdOutlineDrive_file_rename_outline, overflow: true, show: !isHome(),
                onClick: () => { setRenaming(true); setNewPageName(pageData()!.page.name); } },
              { label: t("wiki.delete"), icon: MdOutlineDelete, overflow: true, show: !isHome(), onClick: () => setConfirmDel(true) },
            ].map((a) => ({ ...a, show: canWrite() && !editMode() && a.show !== false }))} />
          </div>

          {/* Rename form */}
          <Show when={renaming()}>
            <form
              onSubmit={handleRename}
              class={`${cardClass()} flex items-center gap-2 p-3`}
            >
              <Input
                class="flex-1"
                type="text"
                autofocus
                value={newPageName()}
                onInput={(e) => setNewPageName(e.currentTarget.value)}
              />
              <Button
                type="submit"
                size="sm"
                disabled={renameBusy() || !newPageName().trim()}
              >
                {renameBusy() ? t("wiki.renaming") : t("wiki.rename_save")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
                {t("wiki.cancel")}
              </Button>
            </form>
          </Show>

          {/* History panel */}
          <Show when={showHistory()}>
            <Card class="p-4 space-y-3">
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
                          <Button variant="ghost" size="sm" onClick={() => loadRevisionPreview(
                              params.nick, params.wikiName, params.pageName, entry.revision
                            )}>
                            {t("wiki.view_revision")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={reverting() !== null}
                            onClick={() => handleRevert(entry.revision)}
                          >
                            {reverting() === entry.revision
                              ? t("wiki.reverting")
                              : t("wiki.revert")}
                          </Button>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Card>
          </Show>

          {/* Edit mode */}
          <Show when={editMode()}>
            <WikiComposer
              nick={params.nick}
              scope={`wiki:${params.nick}:${params.wikiName}:${params.pageName}`}
              initialBody={draftContent()}
              initialCommitMsg={draftCommitMsg()}
              mimeType={pageData()?.page.mime_type ?? "text/bbcode"}
              allowFormatChange={!currentWiki()?.type_lock}
              saving={saving()}
              onSave={handleSave}
              onSaveDraft={handleSaveDraft}
              onCancel={toggleEditMode}
            />
          </Show>

          {/* Rendered view */}
          <Show when={!editMode()}>
            <article
              ref={(el) => { useLightbox(() => el); createEffect(() => { safeHtml(); hydrateLatex(el); hydrateMermaid(el); }); }}
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
          <Modal onClose={closePreview} bare class="fixed inset-0 w-full h-full z-50 flex items-center justify-center bg-black/60 p-4">
            <ModalPanel
              title={<>{t("wiki.revision_preview")} #{previewRevision()}</>}
              onClose={closePreview}
              class="flex flex-col max-w-3xl max-h-[85vh]"
            >
              {/* Header */}
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
                    ref={(el) => { useLightbox(() => el); createEffect(() => { previewHtml(); hydrateLatex(el); hydrateMermaid(el); }); }}
                    class="prose prose-neutral dark:prose-invert max-w-none
                           [&_a]:text-accent [&_a]:no-underline [&_a:hover]:underline
                           [&_pre]:bg-elevated [&_pre]:border [&_pre]:border-rim [&_pre]:rounded-xl
                           [&_blockquote]:border-l-2 [&_blockquote]:border-rim [&_blockquote]:text-muted"
                    innerHTML={DOMPurify.sanitize(previewHtml(), { USE_PROFILES: { html: true } })}
                  />
                </Show>
              </div>
            </ModalPanel>
          </Modal>
        </Show>

        {/* Delete confirmation modal */}
        <Show when={confirmDel()}>
          <Modal onClose={() => setConfirmDel(false)} bare labelledBy="wiki-del-msg" class="fixed inset-0 w-full h-full z-50 flex items-center justify-center bg-black/50">
            <ModalPanel size="sm" class="p-6 space-y-4 mx-4">
              <p id="wiki-del-msg" class="text-txt text-sm">
                {t("wiki.delete")} <strong>{params.pageName}</strong>{t("wiki.delete_confirm")}
              </p>
              <div class="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>
                  {t("wiki.cancel")}
                </Button>
                <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting()}>
                  {deleting() ? t("wiki.deleting") : t("wiki.delete")}
                </Button>
              </div>
            </ModalPanel>
          </Modal>
        </Show>
      </main>
    </div>
  );
}
