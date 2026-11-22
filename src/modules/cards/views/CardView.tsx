// src/modules/cards/views/CardView.tsx
import { createSignal, createMemo, Show, For, createEffect, createOptimistic, createOptimisticStore, action, isPending } from "solid-js";
import { useAsyncQuery } from "@utsukta/spa-core/lib/query";
import { invalidate } from "@utsukta/spa-core/lib/query-client";
import AsyncBoundary from "@/shared/views/AsyncBoundary";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useParams, useNavigate } from "@solidjs/router";
import { fetchCard, deleteCard } from "../api";
import { cardPath, shareTargetForCard } from "@/shared/lib/shareLinks";
import { openShare } from "@utsukta/spa-core/store/share";
import { openComposer } from "@/shared/views/modal-host";
import CommentComposer, { type CreatedComment } from "@/shared/editor/composers/CommentComposer";
import DOMPurify from "dompurify";
import { hydrateLatex } from "@utsukta/spa-core/lib/hydrateLatex";
import { hydrateMermaid } from "@utsukta/spa-core/lib/hydrateMermaid";
import { usePlyr } from "@utsukta/spa-core/lib/usePlyr";
import { useLightbox } from "@utsukta/spa-core/lib/useLightbox";
import { useEmbeds } from "@utsukta/spa-core/lib/useEmbeds";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { BiRegularEdit, BiRegularTrash } from "solid-icons/bi";
import {
  MdOutlineThumb_up,
  MdOutlineThumb_down,
  MdFillChat,
  MdOutlineShare,
} from "solid-icons/md";
import { apiToggleLike, apiToggleDislike, apiDeleteItem, apiEditItem } from "@utsukta/spa-core/lib/item-api";
import { oembedResolver } from "@utsukta/spa-core/lib/oembedResolver";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { buildThreadTree, countAllComments, REACTION_VERBS } from "@utsukta/spa-core/lib/thread";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import type { StreamHandlers } from "@/shared/stream/types";
import CommentThread from "@/shared/views/CommentThread";
import AttachmentList from "@/shared/stream/components/AttachmentList";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { bbcodeDisplay, rootRelativeLinks } from "@utsukta/spa-core/lib/renderBody";
import { Button, IconButton } from "@ui/Button";
import PageActions, { useMobileActions } from "@/shared/views/layout/PageActions";
import { Card, cardClass } from "@ui/Card";

// ── delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm(props: { uuid: string; onDeleted: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [deleting, setDeleting] = createSignal(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await deleteCard(props.uuid);
      props.onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("cards.delete_failed"));
      setDeleting(false);
    }
  };

  return (
    <Card class="flex items-center gap-3 px-4 py-3">
      <p class="text-sm text-txt flex-1">
        {t("cards.delete_confirm")}
      </p>
      <Button variant="ghost" size="sm" onClick={props.onCancel}>
        {t("cards.cancel")}
      </Button>
      <Button variant="danger" size="sm" onClick={confirm} disabled={deleting()}>
        {deleting() ? t("cards.deleting") : t("cards.delete")}
      </Button>
    </Card>
  );
}

// Backlink targets come back as absolute z_root() URLs; the ones on this hub
// are SPA routes, so navigate them client-side instead of reloading the app.
function localPath(url: string): string | null {
  return url.startsWith(window.location.origin)
    ? url.slice(window.location.origin.length)
    : null;
}

// ── main view ─────────────────────────────────────────────────────────────────

export default function CardView() {
  const params = useParams<{ nick: string; uuid: string }>();
  const pageNick = usePageNick();
  const nick = () => params.nick || pageNick();
  const role = useViewerRole();
  const auth = useAuth();
  const navViewer = useNavViewer();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  // Solid 2 async read (see ArticleView): uuid is pinned so the leaving view's
  // key doesn't change mid-navigation, which would hold the router forever.
  const uuid = createMemo((prev?: string) => params.uuid || prev || "");
  const key = () => ["card-detail", { nick: nick(), uuid: uuid() }] as const;
  const q = useAsyncQuery(() => ({ queryKey: key(), queryFn: ({ queryKey: [, k] }) => fetchCard(k.nick, k.uuid) }));
  const data = () => q.data;
  const reload = () => invalidate(key());

  const rendered = () => rootRelativeLinks(DOMPurify.sanitize(data().card.body ?? ""));

  // Canonicalize the URL to the slug once the card's loaded — covers both
  // a bookmarked uuid link on a card that's since gained a slug, and a
  // slug change from editing.
  createEffect(() => ({ canonical: cardPath(nick(), data().card), here: `/cards/${nick()}/${uuid()}` }), (at) => {
    if (at.here !== at.canonical) navigate(at.canonical, { replace: true });
  });

  // ── Editing / deleting ────────────────────────────────────────────────────
  // The editor is handed to ModalHost, so it can be docked or minimized
  // while the card itself stays on screen. reload() refetches this route's
  // query: saving after the reader navigated away refreshes an unseen entry.
  type Card = ReturnType<typeof data>["card"];

  const openEditor = (card: Card) =>
    openComposer({
      kind: "card",
      scope: `card:edit:${card.uuid}`,
      title: t("cards.edit_card"),
      props: {
        uid: auth()!.uid,
        nick: nick(),
        initial: {
          uuid:          card.uuid,
          iid:           card.iid,
          title:         card.title,
          summary:       card.summary ?? "",
          slug:          card.slug ?? "",
          // Must be passed: the composer sends `category` on save and the
          // server treats it as authoritative, so omitting it here meant
          // every edit saved "" and cleared the card's categories.
          category:      (card.categories ?? []).join(", "),
          body:          card.rawBody ?? "",
          public_policy: card.publicPolicy,
          allow_cid:     card.allowCid,
          allow_gid:     card.allowGid,
          deny_cid:      card.denyCid,
          deny_gid:      card.denyGid,
          deck:          card.deck,
          mimetype:      card.mimetype,
        },
        onSaved: () => void reload(),
      },
    });
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  // Reactions: shown from the fetched card; a click writes the expected
  // result optimistically, and the action hands over to refetched data — or
  // rolls back on its own if the request fails.
  const [reactions, setReactions] = createOptimistic(() => {
    const c = data().card;
    return { likeCount: c.likeCount, dislikeCount: c.dislikeCount, viewerLiked: c.viewerLiked, viewerDisliked: c.viewerDisliked };
  });

  // Comments: the fetched list, with optimistic adds/edits/deletes on top.
  const [comments, setComments] = createOptimisticStore(() => data().comments, [] as Post[]);

  // Comment composer visibility
  const [replyOpen, setReplyOpen] = createSignal(false);

  // Link, [card=<iid>][/card] embed token and quote-share all live in the
  // shared share popup now.
  function shareCard() {
    openShare(shareTargetForCard(nick(), data().card));
  }

  const toggleReaction = action(function* (kind: "like" | "dislike") {
    const card = data().card;
    if (!card.uuid) return;
    const r = reactions();
    setReactions(kind === "like"
      ? { ...r, viewerLiked: !r.viewerLiked, likeCount: r.likeCount + (r.viewerLiked ? -1 : 1) }
      : { ...r, viewerDisliked: !r.viewerDisliked, dislikeCount: r.dislikeCount + (r.viewerDisliked ? -1 : 1) });
    try {
      yield (kind === "like" ? apiToggleLike : apiToggleDislike)(card.uuid);
    } catch {
      return; // the optimistic value reverts with the action
    }
    yield reload();
  });
  const handleLike = () => void toggleReaction("like");
  const handleDislike = () => void toggleReaction("dislike");

  // ── Comment thread ─────────────────────────────────────────────────────────
  // Card + comments -> nested tree, same architecture PostView.tsx uses for
  // single-post pages. Reaction-verb rows (Like/Dislike/Announce) ride along
  // in the comments payload — drop them before building the tree.

  type CommentReactionOverride = {
    viewerLiked?: boolean;
    viewerDisliked?: boolean;
    likeCount?: number;
    dislikeCount?: number;
  };
  // Optimistic only: reverts when the action settles, by which point the
  // refetched comments carry the result.
  const [commentReactions, setCommentReactions] =
    createOptimistic<Record<string, CommentReactionOverride>>({});

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
    const card = data().card;
    const realComments = comments.filter(c => !REACTION_VERBS.has(c.verb ?? ""));
    const tree = buildThreadTree([card, ...realComments]);
    return tree[0]?.children ?? [];
  });

  const commentTree = createMemo(() => rawCommentTree().map(applyCommentOverrides));

  const renderBody = (body: string) => {
    try {
      const converted = bbcodeDisplay(body, { oembedResolver });
      return sanitizeHtml(typeof converted === "string" ? converted : "");
    } catch {
      return "";
    }
  };

  // The composer has already posted it: show it at once, then refetch so the
  // stored comment replaces the stand-in.
  const addComment = action(function* (parentMid: string, body: string, created?: CreatedComment) {
    const card = data().card;
    const a = auth();
    const viewer = navViewer();
    const tempId = crypto.randomUUID();
    const temp = {
      uuid: tempId, id: tempId, mid: tempId,
      parent_mid: card.mid, thr_parent: parentMid,
      top_mid: card.mid, parent: card.uuid,
      body: renderBody(body), rawBody: body, title: "",
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
      ...created, profileUid: card.profileUid,
    } satisfies Post;
    setComments((s) => { s.push(temp); });
    yield reload();
  });

  const toggleCommentReaction = action(function* (
    mid: string,
    field: "viewerLiked" | "viewerDisliked",
    countField: "likeCount" | "dislikeCount",
    call: (uuid: string) => Promise<unknown>,
  ) {
    const node = findInTree(rawCommentTree(), mid);
    if (!node?.uuid) return;
    const o = commentReactions()[mid] ?? {};
    const current = o[field] ?? node[field];
    const count = o[countField] ?? node[countField];
    setCommentReactions((prev) => ({ ...prev, [mid]: { ...prev[mid], [field]: !current, [countField]: current ? count - 1 : count + 1 } }));
    try {
      yield call(node.uuid);
    } catch {
      return;
    }
    yield reload();
  });

  // Errors propagate to CommentThread, which reports them; the optimistic
  // change reverts on its own.
  const deleteComment = action(function* (mid: string) {
    const node = findInTree(rawCommentTree(), mid);
    if (!node?.uuid) return;
    setComments((s) => { const i = s.findIndex((c) => c.mid === mid); if (i >= 0) s.splice(i, 1); });
    yield apiDeleteItem(node.uuid);
    yield reload();
  });

  const editComment = action(function* (mid: string, payload: Parameters<typeof apiEditItem>[1]) {
    const node = findInTree(rawCommentTree(), mid);
    if (!node?.uuid) return;
    setComments((s) => {
      const c = s.find((x) => x.mid === mid);
      if (c) Object.assign(c, { body: renderBody(payload.body), rawBody: payload.body, title: payload.title ?? "" });
    });
    yield apiEditItem(node.uuid, payload);
    yield reload();
  });

  const commentHandlers: StreamHandlers = {
    onLike: (mid) => void toggleCommentReaction(mid, "viewerLiked", "likeCount", apiToggleLike),
    onDislike: (mid) => void toggleCommentReaction(mid, "viewerDisliked", "dislikeCount", apiToggleDislike),
    onRepeat: () => {},
    onComment: (parentMid, body, _name, _avatar, created) => void addComment(parentMid, body, created),
    onLoadComments: async () => {},
    onDelete: (mid) => deleteComment(mid),
    onEdit: (mid, payload) => editComment(mid, payload),
  };

  // TOC
  let bodyRef: HTMLDivElement | undefined;
  createEffect(rendered, (html) => {
    if (html && bodyRef) { hydrateLatex(bodyRef); hydrateMermaid(bodyRef); }
  });
  usePlyr(() => bodyRef, rendered);
  useLightbox(() => (rendered(), bodyRef));
  useEmbeds(() => bodyRef, rendered);

  const isOwner = () => role() === "owner";
  const mobileActions = useMobileActions();

  return (
    <div class="relative max-w-3xl mx-auto py-4">
      <AsyncBoundary fallback={<CardViewSkeleton />}>
      <Show when={data()}>
        {(d) => (
          <div class={["xl:flex xl:gap-8 transition-opacity", { "opacity-60": isPending(() => data()) }]}>
            {/* ── Card ── */}
            <article class={`${cardClass()} min-w-0 flex-1 max-w-none xl:max-w-3xl p-6 space-y-6`}>
              {/* Back link */}
              <a
                href={`/cards/${nick()}`}
                class="inline-flex items-center gap-1 text-sm text-muted hover:text-txt transition-colors"
              >
                {t("cards.all_cards")}
              </a>

              {/* Delete confirm banner */}
              <Show when={confirmDelete()}>
                <DeleteConfirm
                  uuid={d().card.uuid}
                  onDeleted={() => navigate(`/cards/${nick()}`)}
                  onCancel={() => setConfirmDelete(false)}
                />
              </Show>

                {/* Header */}
                <header class="space-y-2 border-b border-rim pb-4">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h1 class="text-3xl font-bold leading-tight text-txt">
                      {d().card.title || t("cards.untitled")}
                    </h1>
                  </div>

                  <Show when={d().card.summary}>
                    <p class="text-lg text-muted italic leading-snug">
                      {d().card.summary}
                    </p>
                  </Show>
                  <p class="text-sm text-muted">
                    {new Date(
                      d().card.created.replace(" ", "T") + "Z",
                    ).toLocaleDateString(locale(), {
                      year: "numeric", month: "long", day: "numeric",
                    })}
                    {" "}{t("cards.by")}{" "}
                    <a href={d().card.authorUrl} class="hover:underline text-txt">
                      {d().card.authorName}
                    </a>
                  </p>

                  {/* Deck membership */}
                  <Show when={d().card.deck}>
                    <p class="text-sm text-muted">
                      {t("cards.part_of_deck", {
                        order: String(d().card.deck!.order ?? "?"),
                        name: d().card.deck!.name,
                      })}
                      {" — "}
                      <a
                        href={`/cards/${nick()}/deck/${encodeURIComponent(d().card.deck!.name)}`}
                        class="hover:underline text-txt"
                      >
                        {t("cards.view_full_deck")}
                      </a>
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
                <Show when={(d().card.attachments?.length ?? 0) > 0}>
                  <AttachmentList attachments={d().card.attachments!} />
                </Show>

                {/* Reactions / action bar */}
                <div class="flex items-center gap-1 pt-4 border-t border-rim flex-wrap">
                  <Show when={auth()?.isLoggedIn}>
                    <Button
                      variant="ghost"
                      size="sm"
                      pressed={reactions().viewerLiked}
                      onClick={handleLike}
                      title="Like"
                    >
                      <MdOutlineThumb_up size={17} />
                      <Show when={reactions().likeCount > 0}>
                        <span>{reactions().likeCount}</span>
                      </Show>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      pressed={reactions().viewerDisliked}
                      onClick={handleDislike}
                      title="Dislike"
                    >
                      <MdOutlineThumb_down size={17} />
                      <Show when={reactions().dislikeCount > 0}>
                        <span>{reactions().dislikeCount}</span>
                      </Show>
                    </Button>
                  </Show>

                  {/* Share and the owner's edit/delete go to the mobile ⋮ menu
                      below lg; reactions and comment stay with the card. */}
                  <PageActions mobileOnly label={d().card.title || undefined} actions={[
                    { label: t("share.action"), icon: MdOutlineShare, onClick: shareCard },
                    { label: t("cards.edit_card"), icon: BiRegularEdit, primary: true, show: isOwner(),
                      onClick: () => { setConfirmDelete(false); openEditor(d().card); } },
                    { label: t("cards.delete_card"), icon: BiRegularTrash, onClick: () => setConfirmDelete(true), show: isOwner() },
                  ]} />
                  <Show when={!mobileActions()}>
                    <IconButton label={t("share.action")} class="ml-auto" onClick={shareCard}>
                      <MdOutlineShare size={17} />
                    </IconButton>
                  </Show>

                  <Show when={auth()?.isLoggedIn}>
                    <Button
                      variant="ghost"
                      size="sm"
                      class={mobileActions() ? "ml-auto" : ""}
                      pressed={replyOpen()}
                      onClick={() => setReplyOpen(v => !v)}
                    >
                      <MdFillChat size={17} />
                      <span>{t("cards.comment")}</span>
                    </Button>
                  </Show>

                  {/* Owner actions */}
                  <Show when={isOwner() && !mobileActions()}>
                    <IconButton
                      label={t("cards.edit_card")}
                      onClick={() => { setConfirmDelete(false); openEditor(d().card); }}
                    >
                      <BiRegularEdit size={17} />
                    </IconButton>
                    <IconButton
                      label={t("cards.delete_card")}
                      variant="danger"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <BiRegularTrash size={17} />
                    </IconButton>
                  </Show>
                </div>

                {/* Comment composer */}
                <Show when={replyOpen() && d().card.iid && d().card.profileUid}>
                  <CommentComposer
                    parentUuid={d().card.uuid}
                    profileUid={d().card.profileUid!}
                    onSubmitted={(body, created) => {
                      void addComment(d().card.mid, body, created);
                      setReplyOpen(false);
                    }}
                  />
                </Show>

                {/* Mentioned in — items on this channel that embed this card */}
                <Show when={(d().card.mentionedIn?.length ?? 0) > 0}>
                  <section class={`${cardClass()} p-4 space-y-2`}>
                    <h2 class="text-sm font-semibold text-txt">{t("cards.mentioned_in")}</h2>
                    <ul class="space-y-1">
                      <For each={d().card.mentionedIn}>
                        {(m) => (
                          <li class="text-sm flex flex-wrap items-baseline gap-x-2">
                            <Show
                              when={localPath(m.viewUrl)}
                              fallback={
                                <a href={m.viewUrl} class="text-accent hover:underline">
                                  {m.title || t("cards.untitled")}
                                </a>
                              }
                            >
                              {(path) => (
                                <a href={path()} class="text-accent hover:underline">
                                  {m.title || t("cards.untitled")}
                                </a>
                              )}
                            </Show>
                            <span class="text-xs text-muted">
                              {new Date(m.created.replace(" ", "T") + "Z").toLocaleDateString(locale())}
                            </span>
                          </li>
                        )}
                      </For>
                    </ul>
                  </section>
                </Show>

                {/* Comments */}
                <section class="space-y-4">
                  <h2 class="text-base font-semibold text-txt">
                    {t("cards.comments")} ({countAllComments(commentTree())})
                  </h2>
                  <Show
                    when={commentTree().length > 0}
                    fallback={<p class="text-sm text-muted">{t("cards.no_comments")}</p>}
                  >
                    <CommentThread
                      comments={commentTree()}
                      show={true}
                      handlers={commentHandlers}
                      postAuthorAddress={d().card.authorAddress}
                    />
                  </Show>
                </section>
            </article>
          </div>
        )}
      </Show>
      </AsyncBoundary>
    </div>
  );
}

function CardViewSkeleton() {
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
