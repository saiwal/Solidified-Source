// src/modules/articles/views/ArticleView.tsx
import {
  createSignal, createEffect, createMemo,
  Show, For
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useParams, A, useNavigate } from "@solidjs/router";
import { fetchArticle, deleteArticle } from "../api";
import { articlePath, shareTargetForArticle } from "@/shared/lib/shareLinks";
import { openShare } from "@utsukta/spa-core/store/share";
import ArticleComposerModal from "@/shared/editor/composers/ArticleComposerModal";
import CommentComposer from "@/shared/editor/composers/CommentComposer";
import { languageLabel } from "@utsukta/spa-core/lib/languages";
import DOMPurify from "dompurify";
import { hydrateLatex } from "@utsukta/spa-core/lib/hydrateLatex";
import { useToc } from "@utsukta/spa-core/lib/useToc";
import { usePlyr } from "@utsukta/spa-core/lib/usePlyr";
import ArticleToc from "@/shared/views/ArticleToc";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { BiRegularEdit, BiRegularTrash } from "solid-icons/bi";
import {
  MdOutlineThumb_up,
  MdOutlineThumb_down,
  MdFillChat,
  MdOutlineShare,
  MdOutlineTranslate,
} from "solid-icons/md";
import { apiToggleLike, apiToggleDislike, apiDeleteItem, apiEditItem } from "@utsukta/spa-core/lib/item-api";
import { bbcodeToHtml } from "@utsukta/spa-core/lib/bbcode";
import { oembedResolver } from "@utsukta/spa-core/lib/oembedResolver";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { buildThreadTree, countAllComments, REACTION_VERBS } from "@utsukta/spa-core/lib/thread";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "@/shared/stream/types";
import CommentThread from "@/shared/views/CommentThread";
import AttachmentList from "@/shared/stream/components/AttachmentList";
import type { Post } from "@utsukta/spa-core/types/post.types";

// ── delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm(props: { uuid: string; onDeleted: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [deleting, setDeleting] = createSignal(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await deleteArticle(props.uuid);
      props.onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("articles.delete_failed"));
      setDeleting(false);
    }
  };

  return (
    <div class="flex items-center gap-3 px-4 py-3 bg-surface border border-rim rounded-xl">
      <p class="text-sm text-txt flex-1">
        {t("articles.delete_confirm")}
      </p>
      <button
        type="button"
        onClick={props.onCancel}
        class="px-3 py-1.5 text-sm rounded-lg border border-rim text-muted hover:bg-elevated transition-colors"
      >
        {t("articles.cancel")}
      </button>
      <button
        type="button"
        onClick={confirm}
        disabled={deleting()}
        class="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-500 text-white
               hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {deleting() ? t("articles.deleting") : t("articles.delete")}
      </button>
    </div>
  );
}

// ── main view ─────────────────────────────────────────────────────────────────

export default function ArticleView() {
  const params = useParams<{ nick: string; uuid: string }>();
  const pageNick = usePageNick();
  const nick = () => params.nick || pageNick();
  const role = useViewerRole();
  const auth = useAuth();
  const navViewer = useNavViewer();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const [data, { refetch }] = createQueryResource(
    "article-detail",
    () => ({ nick: nick(), uuid: params.uuid }),
    ({ nick, uuid }) => fetchArticle(nick, uuid),
  );

  const rendered = () =>
    data()?.article ? DOMPurify.sanitize(data()!.article.body ?? "") : "";

  // Canonicalize the URL to the slug once the article's loaded — covers both
  // a bookmarked uuid link on an article that's since gained a slug, and a
  // slug change from editing.
  createEffect(() => {
    const art = data()?.article;
    if (!art) return;
    const canonical = articlePath(nick(), art);
    if (`/articles/${nick()}/${params.uuid}` !== canonical) {
      navigate(canonical, { replace: true });
    }
  });

  // editing / deleting state
  const [editing, setEditing] = createSignal(false);
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const [translating, setTranslating] = createSignal(false);

  // Reaction state — optimistic local copy initialised from fetched article
  const [reactions, setReactions] = createSignal({
    likeCount: 0, dislikeCount: 0,
    viewerLiked: false, viewerDisliked: false,
  });
  createEffect(() => {
    const art = data()?.article;
    if (!art) return;
    setReactions({
      likeCount: art.likeCount,
      dislikeCount: art.dislikeCount,
      viewerLiked: art.viewerLiked,
      viewerDisliked: art.viewerDisliked,
    });
  });

  // Local comments list — updated optimistically when a new comment is posted
  const [localComments, setLocalComments] = createSignal<Post[]>([]);
  createEffect(() => {
    if (data()?.comments) setLocalComments(data()!.comments);
  });

  // Comment composer visibility
  const [replyOpen, setReplyOpen] = createSignal(false);

  function shareArticle() {
    const art = data()?.article;
    if (art) openShare(shareTargetForArticle(nick(), art));
  }

  function handleLike() {
    const art = data()?.article;
    if (!art?.uuid) return;
    const wasLiked = reactions().viewerLiked;
    const delta = wasLiked ? -1 : 1;
    setReactions(r => ({ ...r, viewerLiked: !wasLiked, likeCount: r.likeCount + delta }));
    apiToggleLike(art.uuid).then(res => {
      setReactions(r => ({ ...r, likeCount: res.like_count, viewerLiked: res.state === "added" }));
    }).catch(() => {
      setReactions(r => ({ ...r, viewerLiked: wasLiked, likeCount: r.likeCount - delta }));
    });
  }

  function handleDislike() {
    const art = data()?.article;
    if (!art?.uuid) return;
    const wasDisliked = reactions().viewerDisliked;
    const delta = wasDisliked ? -1 : 1;
    setReactions(r => ({ ...r, viewerDisliked: !wasDisliked, dislikeCount: r.dislikeCount + delta }));
    apiToggleDislike(art.uuid).then(res => {
      setReactions(r => ({ ...r, dislikeCount: res.dislike_count, viewerDisliked: res.state === "added" }));
    }).catch(() => {
      setReactions(r => ({ ...r, viewerDisliked: wasDisliked, dislikeCount: r.dislikeCount - delta }));
    });
  }

  // ── Comment thread ─────────────────────────────────────────────────────────
  // Article + comments -> nested tree, same architecture PostView.tsx uses for
  // single-post pages. Reaction-verb rows (Like/Dislike/Announce) ride along
  // in the comments payload — drop them before building the tree.

  type CommentReactionOverride = {
    viewerLiked?: boolean;
    viewerDisliked?: boolean;
    likeCount?: number;
    dislikeCount?: number;
  };
  const [commentReactions, setCommentReactions] =
    createSignal<Record<string, CommentReactionOverride>>({});

  function findInTree(nodes: ThreadNode[], mid: string): ThreadNode | undefined {
    for (const n of nodes) {
      if (n.mid === mid) return n;
      const found = findInTree(n.children, mid);
      if (found) return found;
    }
    return undefined;
  }

  function applyCommentOverrides(n: ThreadNode): ThreadNode {
    const o = commentReactions()[n.mid];
    return {
      ...(o ? { ...n, ...o } : n),
      children: n.children.map(applyCommentOverrides),
    };
  }

  const rawCommentTree = createMemo((): ThreadNode[] => {
    const art = data()?.article;
    if (!art) return [];
    const realComments = localComments().filter(c => !REACTION_VERBS.has(c.verb ?? ""));
    const tree = buildThreadTree([art, ...realComments]);
    return tree[0]?.children ?? [];
  });

  const commentTree = createMemo(() => rawCommentTree().map(applyCommentOverrides));

  function addLocalComment(parentMid: string, body: string) {
    const art = data()?.article;
    if (!art) return;
    const a = auth();
    const viewer = navViewer();
    let renderedBody = "";
    try {
      const converted = bbcodeToHtml(body, { oembedResolver });
      renderedBody = sanitizeHtml(typeof converted === "string" ? converted : "");
    } catch {
      renderedBody = "";
    }
    const tempId = crypto.randomUUID();
    setLocalComments(prev => [...prev, {
      uuid: tempId, id: tempId, mid: tempId,
      parent_mid: art.mid, thr_parent: parentMid,
      top_mid: art.mid, parent: art.uuid,
      body: renderedBody, rawBody: body, title: "",
      authorName: viewer?.name || a?.nick || "You",
      authorAvatar: viewer?.avatar ?? "",
      authorUrl: viewer?.url ?? "",
      authorAddress: viewer?.addr || (a?.nick ? `${a.nick}@${window.location.hostname}` : ""),
      created: new Date().toISOString().replace("T", " ").slice(0, 19),
      verb: "Create", obj_type: "Note", flags: [], permalink: "",
      likeCount: 0, dislikeCount: 0, repeatCount: 0,
      viewerLiked: false, viewerDisliked: false, viewerRepeated: false,
      item_thread_top: 0, children: [],
    } satisfies Post]);
  }

  function toggleCommentReaction(
    mid: string,
    field: "viewerLiked" | "viewerDisliked",
    countField: "likeCount" | "dislikeCount",
    call: (uuid: string) => Promise<{ like_count?: number; dislike_count?: number; state: string }>,
  ) {
    const node = findInTree(rawCommentTree(), mid);
    if (!node?.uuid) return;
    const o = commentReactions()[mid] ?? {};
    const current = o[field] ?? node[field];
    const count = o[countField] ?? node[countField];
    setCommentReactions(prev => ({
      ...prev,
      [mid]: { ...prev[mid], [field]: !current, [countField]: current ? count - 1 : count + 1 },
    }));
    call(node.uuid).catch(() => {
      setCommentReactions(prev => ({ ...prev, [mid]: { ...prev[mid], [field]: current, [countField]: count } }));
    });
  }

  const commentHandlers: StreamHandlers = {
    onLike: (mid) => toggleCommentReaction(mid, "viewerLiked", "likeCount",
      (uuid) => apiToggleLike(uuid).then(r => ({ like_count: r.like_count, state: r.state }))),
    onDislike: (mid) => toggleCommentReaction(mid, "viewerDisliked", "dislikeCount",
      (uuid) => apiToggleDislike(uuid).then(r => ({ dislike_count: r.dislike_count, state: r.state }))),
    onRepeat: () => {},
    onComment: (parentMid, body) => addLocalComment(parentMid, body),
    onLoadComments: async () => {},
    async onDelete(mid) {
      const node = findInTree(rawCommentTree(), mid);
      if (!node?.uuid) return;
      await apiDeleteItem(node.uuid);
      setLocalComments(prev => prev.filter(c => c.mid !== mid));
    },
    async onEdit(mid, payload) {
      const node = findInTree(rawCommentTree(), mid);
      if (!node?.uuid) return;
      await apiEditItem(node.uuid, payload);
      const body = payload.body;
      let renderedBody = "";
      try {
        const converted = bbcodeToHtml(body, { oembedResolver });
        renderedBody = sanitizeHtml(typeof converted === "string" ? converted : "");
      } catch {
        renderedBody = "";
      }
      setLocalComments(prev => prev.map(c =>
        c.mid === mid ? { ...c, body: renderedBody, rawBody: body, title: payload.title ?? "" } : c
      ));
    },
  };

  // TOC
  let bodyRef: HTMLDivElement | undefined;
  createEffect(() => {
    if (rendered() && bodyRef) hydrateLatex(bodyRef);
  });
  const { toc, activeId } = useToc(rendered, () => bodyRef);
  usePlyr(() => bodyRef, rendered);

  const isOwner = () => role() === "owner";

  return (
    <div class="relative max-w-5xl mx-auto py-4">
      <Show when={!data.loading && data()} fallback={<ArticleViewSkeleton />}>
        {(d) => (
          <div class="xl:flex xl:gap-8">
            {/* ── TOC — sticky sidebar on xl+, sticky collapsed launcher below xl ── */}
            <ArticleToc entries={toc()} activeId={activeId()} label={t("articles.on_this_page")} />

            {/* ── Article ── */}
            <article class="min-w-0 flex-1 max-w-none xl:max-w-3xl space-y-6">
              {/* Back link */}
              <A
                href={`/articles/${nick()}`}
                class="inline-flex items-center gap-1 text-sm text-muted hover:text-txt transition-colors"
              >
                {t("articles.all_articles")}
              </A>

              {/* Delete confirm banner */}
              <Show when={confirmDelete()}>
                <DeleteConfirm
                  uuid={d().article.uuid}
                  onDeleted={() => navigate(`/articles/${nick()}`)}
                  onCancel={() => setConfirmDelete(false)}
                />
              </Show>

              {/* Edit modal */}
              <Show when={editing()}>
                <ArticleComposerModal
                  uid={auth()!.uid}
                  heading={t("articles.edit_article")}
                  initial={{
                    uuid:          d().article.uuid,
                    iid:           d().article.iid,
                    title:         d().article.title,
                    summary:       d().article.summary ?? "",
                    slug:          d().article.slug ?? "",
                    // Must be passed: the composer sends `category` on save and the
                    // server treats it as authoritative, so omitting it here meant
                    // every edit saved "" and cleared the article's categories.
                    category:      (d().article.categories ?? []).join(", "),
                    body:          d().article.rawBody ?? "",
                    public_policy: d().article.publicPolicy,
                    allow_cid:     d().article.allowCid,
                    allow_gid:     d().article.allowGid,
                    deny_cid:      d().article.denyCid,
                    deny_gid:      d().article.denyGid,
                    lang:          d().article.lang,
                    series:        d().article.series,
                  }}
                  nick={nick()}
                  onSaved={() => { setEditing(false); refetch(); }}
                  onClose={() => setEditing(false)}
                />
              </Show>

              {/* Add-translation modal */}
              <Show when={translating()}>
                <ArticleComposerModal
                  uid={auth()!.uid}
                  nick={nick()}
                  heading={t("articles.add_translation")}
                  translationOf={{
                    uuid: d().article.uuid,
                    excludeLangs: [
                      d().article.lang,
                      ...(d().article.translations ?? []).map((tr) => tr.lang),
                    ].filter((l): l is string => !!l),
                  }}
                  onSaved={() => { setTranslating(false); refetch(); }}
                  onClose={() => setTranslating(false)}
                />
              </Show>

              {/* Normal view */}
              <Show when={!editing()}>
                {/* Header */}
                <header class="space-y-2 border-b border-rim pb-4">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h1 class="text-3xl font-bold leading-tight text-txt">
                      {d().article.title || t("articles.untitled")}
                    </h1>
                    <Show when={d().article.lang}>
                      <span class="px-1.5 py-0.5 rounded text-xs font-medium bg-elevated text-muted uppercase">
                        {languageLabel(d().article.lang!)}
                      </span>
                    </Show>
                  </div>

                  <Show when={d().article.summary}>
                    <p class="text-lg text-muted italic leading-snug">
                      {d().article.summary}
                    </p>
                  </Show>
                  <p class="text-sm text-muted">
                    {new Date(
                      d().article.created.replace(" ", "T") + "Z",
                    ).toLocaleDateString(locale(), {
                      year: "numeric", month: "long", day: "numeric",
                    })}
                    {" "}{t("articles.by")}{" "}
                    <a href={d().article.authorUrl} class="hover:underline text-txt">
                      {d().article.authorName}
                    </a>
                  </p>

                  {/* Series membership */}
                  <Show when={d().article.series}>
                    <p class="text-sm text-muted">
                      {t("articles.part_of_series", {
                        order: String(d().article.series!.order ?? "?"),
                        name: d().article.series!.name,
                      })}
                      {" — "}
                      <A
                        href={`/articles/${nick()}/series/${encodeURIComponent(d().article.series!.name)}`}
                        class="hover:underline text-txt"
                      >
                        {t("articles.view_full_series")}
                      </A>
                    </p>
                  </Show>

                  {/* Translations switcher */}
                  <Show when={(d().article.translations ?? []).length > 0}>
                    <p class="text-sm text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{t("articles.translations_label")}</span>
                      <For each={d().article.translations ?? []}>
                        {(tr) => (
                          <a href={tr.viewUrl} class="px-1.5 py-0.5 rounded bg-elevated text-txt hover:underline text-xs uppercase">
                            {languageLabel(tr.lang)}
                          </a>
                        )}
                      </For>
                    </p>
                  </Show>
                </header>

                {/* Body */}
                <div
                  ref={bodyRef}
                  class="prose dark:prose-invert max-w-none"
                  // eslint-disable-next-line solid/no-innerhtml
                  innerHTML={rendered()}
                />

                {/* Attachments (files, video/audio, links) */}
                <Show when={(d().article.attachments?.length ?? 0) > 0}>
                  <AttachmentList attachments={d().article.attachments!} />
                </Show>

                {/* Reactions / action bar */}
                <div class="flex items-center gap-1 pt-4 border-t border-rim flex-wrap">
                  <Show when={auth()?.isLoggedIn}>
                    <button
                      onClick={handleLike}
                      title="Like"
                      class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                             transition-colors select-none hover:bg-overlay
                             ${reactions().viewerLiked ? "text-accent" : "text-muted"}`}
                    >
                      <MdOutlineThumb_up size={17} />
                      <Show when={reactions().likeCount > 0}>
                        <span>{reactions().likeCount}</span>
                      </Show>
                    </button>

                    <button
                      onClick={handleDislike}
                      title="Dislike"
                      class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                             transition-colors select-none hover:bg-overlay
                             ${reactions().viewerDisliked ? "text-accent" : "text-muted"}`}
                    >
                      <MdOutlineThumb_down size={17} />
                      <Show when={reactions().dislikeCount > 0}>
                        <span>{reactions().dislikeCount}</span>
                      </Show>
                    </button>
                  </Show>

                  <button
                    type="button"
                    onClick={shareArticle}
                    title={t("share.action")}
                    class="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                           transition-colors hover:bg-overlay text-muted hover:text-txt"
                  >
                    <MdOutlineShare size={17} />
                  </button>

                  <Show when={auth()?.isLoggedIn}>
                    <button
                      onClick={() => setReplyOpen(v => !v)}
                      class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                             transition-colors hover:bg-overlay
                             ${replyOpen() ? "text-accent" : "text-muted hover:text-txt"}`}
                    >
                      <MdFillChat size={17} />
                      <span>{t("articles.comment")}</span>
                    </button>
                  </Show>

                  {/* Owner actions */}
                  <Show when={isOwner()}>
                    <button
                      type="button"
                      onClick={() => { setConfirmDelete(false); setEditing(false); setTranslating(true); }}
                      title={t("articles.add_translation")}
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                             transition-colors hover:bg-overlay text-muted hover:text-txt"
                    >
                      <MdOutlineTranslate size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setConfirmDelete(false); setEditing(true); }}
                      title="Edit article"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                             transition-colors hover:bg-overlay text-muted hover:text-txt"
                    >
                      <BiRegularEdit size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditing(false); setConfirmDelete(true); }}
                      title="Delete article"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                             transition-colors hover:bg-overlay text-muted hover:text-red-500"
                    >
                      <BiRegularTrash size={17} />
                    </button>
                  </Show>
                </div>

                {/* Comment composer */}
                <Show when={replyOpen() && d().article.iid && d().article.profileUid}>
                  <CommentComposer
                    parentUuid={d().article.uuid}
                    profileUid={d().article.profileUid!}
                    onSubmitted={(body) => {
                      addLocalComment(d().article.mid, body);
                      setReplyOpen(false);
                    }}
                  />
                </Show>

                {/* Comments */}
                <section class="space-y-4">
                  <h2 class="text-base font-semibold text-txt">
                    {t("articles.comments")} ({countAllComments(commentTree())})
                  </h2>
                  <Show
                    when={commentTree().length > 0}
                    fallback={<p class="text-sm text-muted">{t("articles.no_comments")}</p>}
                  >
                    <CommentThread
                      comments={commentTree()}
                      show={true}
                      handlers={commentHandlers}
                      postAuthorAddress={d().article.authorAddress}
                    />
                  </Show>
                </section>
              </Show>
            </article>
          </div>
        )}
      </Show>
    </div>
  );
}

function ArticleViewSkeleton() {
  return (
    <div class="space-y-6 animate-pulse">
      <div class="h-4 bg-elevated rounded w-20" />
      <div class="space-y-3 border-b border-rim pb-4">
        <div class="h-8 bg-elevated rounded w-3/4" />
        <div class="h-3 bg-elevated rounded w-1/3" />
      </div>
      <div class="space-y-2">
        <For each={Array(8).fill(0)}>
          {() => <div class="h-3 bg-elevated rounded w-full" />}
        </For>
      </div>
    </div>
  );
}
