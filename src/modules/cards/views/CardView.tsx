// src/modules/cards/views/CardView.tsx
import {
  createSignal, createEffect, createMemo,
  Show, For
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useParams, A, useNavigate } from "@solidjs/router";
import { fetchCard, deleteCard } from "../api";
import { cardPath, shareTargetForCard } from "@/shared/lib/shareLinks";
import { openShare } from "@utsukta/spa-core/store/share";
import { openComposer } from "@/shared/views/modal-host";
import CommentComposer, { type CreatedComment } from "@/shared/editor/composers/CommentComposer";
import DOMPurify from "dompurify";
import { hydrateLatex } from "@utsukta/spa-core/lib/hydrateLatex";
import { usePlyr } from "@utsukta/spa-core/lib/usePlyr";
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
import { bbcodeDisplay } from "@utsukta/spa-core/lib/renderBody";

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
    <div class="flex items-center gap-3 px-4 py-3 bg-surface border border-rim rounded-xl">
      <p class="text-sm text-txt flex-1">
        {t("cards.delete_confirm")}
      </p>
      <button
        type="button"
        onClick={props.onCancel}
        class="px-3 py-1.5 text-sm rounded-lg border border-rim text-muted hover:bg-elevated transition-colors"
      >
        {t("cards.cancel")}
      </button>
      <button
        type="button"
        onClick={confirm}
        disabled={deleting()}
        class="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-500 text-white
               hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {deleting() ? t("cards.deleting") : t("cards.delete")}
      </button>
    </div>
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

  const [data, { refetch }] = createQueryResource(
    "card-detail",
    () => ({ nick: nick(), uuid: params.uuid }),
    ({ nick, uuid }) => fetchCard(nick, uuid),
  );

  const rendered = () =>
    data()?.card ? DOMPurify.sanitize(data()!.card.body ?? "") : "";

  // Canonicalize the URL to the slug once the card's loaded — covers both
  // a bookmarked uuid link on an card that's since gained a slug, and a
  // slug change from editing.
  createEffect(() => {
    const art = data()?.card;
    if (!art) return;
    const canonical = cardPath(nick(), art);
    if (`/cards/${nick()}/${params.uuid}` !== canonical) {
      navigate(canonical, { replace: true });
    }
  });

  // ── Editing / deleting ────────────────────────────────────────────────────
  // The editor is handed to ModalHost, so it can be docked or minimized
  // while the card itself stays on screen. `initial` is read eagerly here, as
  // the <Show>-mounted modal used to do on open. refetch() is this route's
  // resource: saving after the reader navigated away is a harmless no-op.
  type Card = NonNullable<ReturnType<typeof data>>["card"];

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
        onSaved: () => refetch(),
      },
    });
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  // Reaction state — optimistic local copy initialised from fetched card
  const [reactions, setReactions] = createSignal({
    likeCount: 0, dislikeCount: 0,
    viewerLiked: false, viewerDisliked: false,
  });
  createEffect(() => {
    const art = data()?.card;
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

  // Link, [card=<iid>][/card] embed token and quote-share all live in the
  // shared share popup now.
  function shareCard() {
    const card = data()?.card;
    if (card) openShare(shareTargetForCard(nick(), card));
  }

  function handleLike() {
    const art = data()?.card;
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
    const art = data()?.card;
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
  // Card + comments -> nested tree, same architecture PostView.tsx uses for
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
    const art = data()?.card;
    if (!art) return [];
    const realComments = localComments().filter(c => !REACTION_VERBS.has(c.verb ?? ""));
    const tree = buildThreadTree([art, ...realComments]);
    return tree[0]?.children ?? [];
  });

  const commentTree = createMemo(() => rawCommentTree().map(applyCommentOverrides));

  function addLocalComment(parentMid: string, body: string, created?: CreatedComment) {
    const art = data()?.card;
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
    if (rendered() && bodyRef) hydrateLatex(bodyRef);
  });
  usePlyr(() => bodyRef, rendered);
  useEmbeds(() => bodyRef, rendered);

  const isOwner = () => role() === "owner";

  return (
    <div class="relative max-w-5xl mx-auto py-4">
      <Show when={!data.loading && data()} fallback={<CardViewSkeleton />}>
        {(d) => (
          <div class="xl:flex xl:gap-8">
            {/* ── Card ── */}
            <article class="min-w-0 flex-1 max-w-none xl:max-w-3xl space-y-6">
              {/* Back link */}
              <A
                href={`/cards/${nick()}`}
                class="inline-flex items-center gap-1 text-sm text-muted hover:text-txt transition-colors"
              >
                {t("cards.all_cards")}
              </A>

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
                      <A
                        href={`/cards/${nick()}/deck/${encodeURIComponent(d().card.deck!.name)}`}
                        class="hover:underline text-txt"
                      >
                        {t("cards.view_full_deck")}
                      </A>
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
                    onClick={shareCard}
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
                      <span>{t("cards.comment")}</span>
                    </button>
                  </Show>

                  {/* Owner actions */}
                  <Show when={isOwner()}>
                    <button
                      type="button"
                      onClick={() => { setConfirmDelete(false); openEditor(d().card); }}
                      title={t("cards.edit_card")}
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                             transition-colors hover:bg-overlay text-muted hover:text-txt"
                    >
                      <BiRegularEdit size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      title={t("cards.delete_card")}
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                             transition-colors hover:bg-overlay text-muted hover:text-red-500"
                    >
                      <BiRegularTrash size={17} />
                    </button>
                  </Show>
                </div>

                {/* Comment composer */}
                <Show when={replyOpen() && d().card.iid && d().card.profileUid}>
                  <CommentComposer
                    parentUuid={d().card.uuid}
                    profileUid={d().card.profileUid!}
                    onSubmitted={(body, created) => {
                      addLocalComment(d().card.mid, body, created);
                      setReplyOpen(false);
                    }}
                  />
                </Show>

                {/* Mentioned in — items on this channel that embed this card */}
                <Show when={(d().card.mentionedIn?.length ?? 0) > 0}>
                  <section class="rounded-xl border border-rim bg-surface p-4 space-y-2">
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
                                <A href={path()} class="text-accent hover:underline">
                                  {m.title || t("cards.untitled")}
                                </A>
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
