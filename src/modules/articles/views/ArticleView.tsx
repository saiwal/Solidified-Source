// src/modules/articles/views/ArticleView.tsx
import {
  createSignal, createEffect, createMemo, createUniqueId,
  Show, For
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useParams, A, useNavigate } from "@solidjs/router";
import { fetchArticle, deleteArticle } from "../api";
import { articlePath, shareTargetForArticle } from "@/shared/lib/shareLinks";
import { openShare } from "@utsukta/spa-core/store/share";
import { openComposer } from "@/shared/views/modal-host";
import CommentComposer, { type CreatedComment } from "@/shared/editor/composers/CommentComposer";
import { languageLabel } from "@utsukta/spa-core/lib/languages";
import DOMPurify from "dompurify";
import { hydrateLatex } from "@utsukta/spa-core/lib/hydrateLatex";
import { hydrateMermaid } from "@utsukta/spa-core/lib/hydrateMermaid";
import { useToc } from "@utsukta/spa-core/lib/useToc";
import { usePlyr } from "@utsukta/spa-core/lib/usePlyr";
import { useLightbox } from "@utsukta/spa-core/lib/useLightbox";
import { useEmbeds } from "@utsukta/spa-core/lib/useEmbeds";
import ArticleToc from "@/shared/views/ArticleToc";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { BiRegularEdit, BiRegularTrash } from "solid-icons/bi";
import {
  MdOutlineThumb_up,
  MdOutlineThumb_down,
  MdFillThumb_up,
  MdFillThumb_down,
  MdOutlineReply,
  MdOutlineShare,
  MdOutlineTranslate,
  MdOutlineMore_horiz,
} from "solid-icons/md";
import { Modal, modalPanelClass } from "@ui/Modal";
import { BackLink } from "@/shared/views/ui";
import { Motion, pop, slideDown } from "@/shared/views/anim";
import { apiToggleLike, apiToggleDislike, apiDeleteItem, apiEditItem } from "@utsukta/spa-core/lib/item-api";
import { oembedResolver } from "@utsukta/spa-core/lib/oembedResolver";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { buildThreadTree, countAllComments, REACTION_VERBS } from "@utsukta/spa-core/lib/thread";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "@/shared/stream/types";
import CommentThread from "@/shared/views/CommentThread";
import AttachmentList from "@/shared/stream/components/AttachmentList";
import ActionBtn from "@/shared/stream/components/ActionBtn";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { bbcodeDisplay, rootRelativeLinks } from "@utsukta/spa-core/lib/renderBody";
import { Button, IconButton } from "@ui/Button";
import { Menu, MenuItem, MenuSeparator } from "@ui/Menu";

// ── delete confirm ────────────────────────────────────────────────────────────

function DeleteDialog(props: { uuid: string; onDeleted: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const id = createUniqueId();
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
    <Modal onClose={props.onCancel} labelledBy={id}>
      <Motion.div {...pop} class={`${modalPanelClass("sm")} p-6 space-y-5`}>
        <h2 id={id} class="text-lg font-semibold text-txt">{t("articles.delete_article")}</h2>
        <p class="text-sm text-muted">{t("articles.delete_confirm")}</p>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={props.onCancel}>{t("articles.cancel")}</Button>
          <Button variant="danger" onClick={confirm} disabled={deleting()}>
            {deleting() ? t("articles.deleting") : t("articles.delete")}
          </Button>
        </div>
      </Motion.div>
    </Modal>
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
    data()?.article ? rootRelativeLinks(DOMPurify.sanitize(data()!.article.body ?? "")) : "";

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

  // ── Deleting state ────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  // ── Editing / translating ─────────────────────────────────────────────────
  // Both hand the composer to ModalHost, so it can be docked or minimized
  // while the article itself stays on screen. `initial` is read eagerly here,
  // which is also what the two <Show>-mounted modals used to do on open.
  // refetch() is this route's resource: if the composer saves after the reader
  // has navigated away it is a harmless no-op (the host guards it).
  type Article = NonNullable<ReturnType<typeof data>>["article"];

  const openEditor = (article: Article) =>
    openComposer({
      kind: "article",
      scope: `article:edit:${article.uuid}`,
      title: t("articles.edit_article"),
      props: {
        uid: auth()!.uid,
        nick: nick(),
        initial: {
          uuid:          article.uuid,
          iid:           article.iid,
          title:         article.title,
          summary:       article.summary ?? "",
          slug:          article.slug ?? "",
          // Must be passed: the composer sends `category` on save and the
          // server treats it as authoritative, so omitting it here meant
          // every edit saved "" and cleared the article's categories.
          category:      (article.categories ?? []).join(", "),
          body:          article.rawBody ?? "",
          public_policy: article.publicPolicy,
          allow_cid:     article.allowCid,
          allow_gid:     article.allowGid,
          deny_cid:      article.denyCid,
          deny_gid:      article.denyGid,
          lang:          article.lang,
          series:        article.series,
          mimetype:      article.mimetype,
        },
        onSaved: () => refetch(),
      },
    });

  const openTranslation = (article: Article) =>
    openComposer({
      kind: "article",
      scope: `article:new:translation:${article.uuid}`,
      title: t("articles.add_translation"),
      props: {
        uid: auth()!.uid,
        nick: nick(),
        translationOf: {
          uuid: article.uuid,
          excludeLangs: [
            article.lang,
            ...(article.translations ?? []).map((tr) => tr.lang),
          ].filter((l): l is string => !!l),
        },
        onSaved: () => refetch(),
      },
    });


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

  function addLocalComment(parentMid: string, body: string, created?: CreatedComment) {
    const art = data()?.article;
    if (!art) return;
    const a = auth();
    const viewer = navViewer();
    let renderedBody = "";
    try {
      const converted = bbcodeDisplay(body, { oembedResolver });
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
      authorHash: a?.hash,
      authorAddress: viewer?.addr || (a?.nick ? `${a.nick}@${window.location.hostname}` : ""),
      created: new Date().toISOString().replace("T", " ").slice(0, 19),
      verb: "Create", obj_type: "Note", flags: [], permalink: "",
      likeCount: 0, dislikeCount: 0, repeatCount: 0,
      viewerLiked: false, viewerDisliked: false, viewerRepeated: false,
      item_thread_top: 0, children: [],
      ...created, profileUid: art.profileUid,
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
    onComment: (parentMid, body, _name, _avatar, created) => addLocalComment(parentMid, body, created),
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
        const converted = bbcodeDisplay(body, { oembedResolver });
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
    if (rendered() && bodyRef) { hydrateLatex(bodyRef); hydrateMermaid(bodyRef); }
  });
  const { toc, activeId } = useToc(rendered, () => bodyRef);
  usePlyr(() => bodyRef, rendered);
  useLightbox(() => (rendered(), bodyRef));
  useEmbeds(() => bodyRef, rendered);

  const isOwner = () => role() === "owner";
  const fmtDate = (iso: string) =>
    new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(locale(), { year: "numeric", month: "long", day: "numeric" });

  return (
    <div class="relative max-w-5xl mx-auto">
      <Show when={!data.loading && data()} fallback={<ArticleViewSkeleton />}>
        {(d) => (
          <div class="xl:flex xl:gap-8">
            {/* ── TOC — sticky sidebar on xl+, sticky collapsed launcher below xl ── */}
            <ArticleToc entries={toc()} activeId={activeId()} label={t("articles.on_this_page")} />

            {/* ── Article ── */}
            <article class="min-w-0 flex-1 max-w-none xl:max-w-3xl">
              <div class="space-y-8">
                <BackLink fallback={`/articles/${nick()}`} label={t("articles.back")} />

                {/* Header — title, summary, byline row */}
                <header class="space-y-3">
                  <h1 class="text-2xl font-bold leading-tight text-txt">
                    {d().article.title || t("articles.untitled")}
                  </h1>

                  <Show when={d().article.summary}>
                    <p class="text-base text-muted leading-relaxed max-w-prose">
                      {d().article.summary}
                    </p>
                  </Show>

                  {/* Byline row: who + when on the left, actions on the right */}
                  <div class="flex items-center gap-x-3 gap-y-3 flex-wrap pt-1">
                    <a href={d().article.authorUrl} class="shrink-0" tabindex="-1" aria-hidden="true">
                      <Show when={d().article.authorAvatar}
                        fallback={<span class="block w-10 h-10 rounded-full bg-elevated" />}>
                        <img src={d().article.authorAvatar} alt="" loading="lazy"
                          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                          class="w-10 h-10 rounded-full object-cover bg-elevated" />
                      </Show>
                    </a>
                    <div class="min-w-0 mr-auto">
                      <a href={d().article.authorUrl}
                        class="block text-sm font-medium text-txt hover:text-accent-txt transition-colors truncate">
                        {d().article.authorName}
                      </a>
                      <p class="flex flex-wrap gap-x-3 text-xs text-muted">
                        <span class="tabular-nums">{fmtDate(d().article.created)}</span>
                        <Show when={d().article.lang}>
                          <span>{languageLabel(d().article.lang!)}</span>
                        </Show>
                      </p>
                    </div>

                  {/* Share + owner actions; reactions and Comment live with the comments below */}
                  <div class="flex items-center gap-1 -mr-2">
                    <IconButton label={t("share.action")} onClick={shareArticle}>
                      <MdOutlineShare size={18} />
                    </IconButton>

                    <Show when={isOwner()}>
                      <Menu
                        label={t("articles.more")}
                        class="w-56"
                        trigger={(p) => (
                          <IconButton label={t("articles.more")} {...p}>
                            <MdOutlineMore_horiz size={18} />
                          </IconButton>
                        )}
                      >
                        <MenuItem icon={<BiRegularEdit size={16} />} onClick={() => openEditor(d().article)}>
                          {t("articles.edit_article")}
                        </MenuItem>
                        <MenuItem icon={<MdOutlineTranslate size={16} />} onClick={() => openTranslation(d().article)}>
                          {t("articles.add_translation")}
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem icon={<BiRegularTrash size={16} />} danger onClick={() => setConfirmDelete(true)}>
                          {t("articles.delete_article")}
                        </MenuItem>
                      </Menu>
                    </Show>
                  </div>
                  </div>

                  <Show when={d().article.series || (d().article.translations ?? []).length > 0}>
                    <div class="space-y-0.5 text-sm text-muted">
                      <Show when={d().article.series}>
                        <p>
                          <A
                            href={`/articles/${nick()}/series/${encodeURIComponent(d().article.series!.name)}`}
                            class="hover:text-accent-txt transition-colors"
                          >
                            {t("articles.part_of_series", {
                              order: String(d().article.series!.order ?? "?"),
                              name: d().article.series!.name,
                            })}
                          </A>
                        </p>
                      </Show>
                      <Show when={(d().article.translations ?? []).length > 0}>
                        <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>{t("articles.translations_label")}</span>
                          <For each={d().article.translations ?? []}>
                            {(tr) => (
                              <a href={tr.viewUrl} class="text-accent-txt hover:underline">{languageLabel(tr.lang)}</a>
                            )}
                          </For>
                        </p>
                      </Show>
                    </div>
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

                {/* Comments */}
                <section class="space-y-4 pt-4">
                  <div class="flex items-center justify-between gap-3 flex-wrap">
                    <h2 class="text-sm font-semibold text-txt tabular-nums">
                      {t("articles.comments")} ({countAllComments(commentTree())})
                    </h2>
                    <div class="flex items-center gap-0.5 -mr-2">
                      <Show when={auth()?.isLoggedIn}>
                        {/* Same reaction buttons as a post's action bar */}
                        <ActionBtn
                          icon={reactions().viewerLiked ? <MdFillThumb_up size={17} /> : <MdOutlineThumb_up size={17} />}
                          count={reactions().likeCount}
                          label={t("articles.like")}
                          onClick={handleLike}
                          active={reactions().viewerLiked}
                          activeClass="text-accent-txt"
                        />
                        <ActionBtn
                          icon={reactions().viewerDisliked ? <MdFillThumb_down size={17} /> : <MdOutlineThumb_down size={17} />}
                          count={reactions().dislikeCount}
                          label={t("articles.dislike")}
                          onClick={handleDislike}
                          active={reactions().viewerDisliked}
                          activeClass="text-accent-txt"
                        />
                      </Show>
                      <Show when={auth()?.isLoggedIn && d().article.canComment}>
                        {/* Same reply button as a post's action bar. canComment comes
                            from core's can_comment_on_post() — it honours the comment
                            policy, comments_closed and item_nocomment, so a
                            comments-disabled article offers no reply button rather
                            than one whose submit is rejected. */}
                        <IconButton
                          label={t("articles.comment")}
                          pressed={replyOpen()}
                          class="active:scale-90"
                          aria-expanded={replyOpen()}
                          onClick={() => setReplyOpen(v => !v)}
                        >
                          <MdOutlineReply size={17} />
                        </IconButton>
                      </Show>
                    </div>
                  </div>

                  {/* Comment composer */}
                  <Show when={replyOpen() && d().article.iid && d().article.profileUid}>
                    <Motion.div {...slideDown}>
                      <CommentComposer
                        parentUuid={d().article.uuid}
                        profileUid={d().article.profileUid!}
                        onSubmitted={(body, created) => {
                          addLocalComment(d().article.mid, body, created);
                          setReplyOpen(false);
                        }}
                      />
                    </Motion.div>
                  </Show>

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
              </div>

              <Show when={confirmDelete()}>
                <DeleteDialog
                  uuid={d().article.uuid}
                  onDeleted={() => navigate(`/articles/${nick()}`)}
                  onCancel={() => setConfirmDelete(false)}
                />
              </Show>
            </article>
          </div>
        )}
      </Show>
    </div>
  );
}

const bar = "rounded bg-elevated animate-pulse motion-reduce:animate-none";

function ArticleViewSkeleton() {
  return (
    <div class="max-w-3xl space-y-8">
      <div class={`h-4 w-16 ${bar}`} />
      <div class="space-y-3">
        <div class={`h-7 w-3/4 ${bar}`} />
        <div class={`h-4 w-2/3 ${bar}`} />
        <div class={`h-3 w-32 ${bar}`} />
        <div class={`h-3 w-24 ${bar}`} />
        <div class={`h-10 w-36 rounded-full ${bar}`} />
      </div>
      <div class="space-y-2.5">
        <For each={Array(8).fill(0)}>
          {(_, i) => <div class={`h-3 ${bar}`} style={{ width: `${80 + ((i() * 7) % 20)}%` }} />}
        </For>
      </div>
    </div>
  );
}
