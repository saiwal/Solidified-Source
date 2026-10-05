// src/modules/messenger/DmPane.tsx
// Right pane for a DM conversation: the person's threads (subjects) to pick
// from, and the picked thread as chat bubbles with a reply box.
import { For, Show, createEffect, createMemo, createSignal, on, onMount } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchMessages } from "@utsukta/spa-core/lib/message-store";
import {
  fetchDisplayItem, fetchComments, apiCreateComment, apiSetSeen,
  apiToggleLike, apiEditItem, apiDeleteItem, apiFetchComposeSource,
} from "@utsukta/spa-core/lib/item-api";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { renderBody } from "@utsukta/spa-core/lib/renderBody";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { useAuth, currentNick } from "@utsukta/spa-core/store/auth-store";
import { wallAttach } from "@/modules/files/api";
import { MdFillPush_pin, MdOutlinePush_pin, MdOutlineArrow_back, MdOutlineClose, MdOutlineEdit, MdOutlineForum, MdOutlineFavorite_border, MdFillFavorite, MdOutlineReply, MdOutlineDelete } from "solid-icons/md";
import ChatComposer from "@/modules/chat/ChatComposer";
import { openPost } from "@/shared/views/modal-host";
import { toast } from "@utsukta/spa-core/store/toast";
import { usePins, setPinned } from "./pins";
import type { AclEntry } from "@/modules/network/api";
import { groupThreads, groupName, shortTime, type DmGroup } from "./dms";

/** hq-messages summaries are entity-escaped text; decode, render as text. */
export function decodeHtmlEntities(str: string): string {
  const ta = document.createElement("textarea");
  ta.innerHTML = str;
  return ta.value;
}

export function Avatar(props: { src?: string; name: string; class?: string }) {
  return (
    <Show
      when={props.src}
      fallback={
        <div class={`rounded-full bg-accent-muted flex items-center justify-center text-accent font-semibold shrink-0 ${props.class ?? "w-10 h-10"}`}>
          {props.name?.[0]?.toUpperCase() ?? "?"}
        </div>
      }
    >
      <img src={props.src} alt="" class={`rounded-full object-cover shrink-0 ${props.class ?? "w-10 h-10"}`} />
    </Show>
  );
}

/** A participant as a recipient chip. */
export const toRecipient = (p: { hash: string; name: string; addr: string; url?: string; photo?: string }): AclEntry => ({
  type: "c", xid: p.hash, id: p.hash, name: p.name, nick: p.addr, link: p.addr, photo: p.photo,
} as AclEntry);

/** Pin toggle. In a list row it shows on hover/focus (faintly on touch);
 *  pinned, or with `always`, it stays visible. */
export function PinButton(props: { pinned: boolean; onClick: () => void; always?: boolean }) {
  const { t } = useI18n();
  const label = () => t(props.pinned ? "messenger.unpin" : "messenger.pin") as string;
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={label()}
      aria-label={label()}
      aria-pressed={props.pinned}
      class="p-1.5 rounded-lg shrink-0 hover:bg-elevated"
      classList={{
        "text-accent": props.pinned,
        "text-muted hover:text-txt": !props.pinned,
        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-60": !props.pinned && !props.always,
      }}
    >
      {props.pinned ? <MdFillPush_pin size={16} /> : <MdOutlinePush_pin size={16} />}
    </button>
  );
}

export function BackButton(props: { href: string }) {
  const { t } = useI18n();
  return (
    <A href={props.href} class="md:hidden p-1.5 -ml-1.5 rounded-lg text-muted hover:text-txt hover:bg-elevated" aria-label={t("messenger.back") as string}>
      <MdOutlineArrow_back size={20} />
    </A>
  );
}

/** Mark a DM list stale after a read or a reply. */
const invalidateDms = () => {
  void queryClient.invalidateQueries({ queryKey: ["messenger-dms"] });
  void queryClient.invalidateQueries({ queryKey: ["messenger-person"] });
};

/** `channel`: visiting someone else's Messenger — their DMs with you. */
export default function DmPane(props: { base: string; channel?: string; groupKey: string; uuid?: string }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const auth = useAuth();
  const base = () => `${props.base}/dm/${encodeURIComponent(props.groupKey)}`;

  // The `xchan` filter returns every thread involving any of these people;
  // grouping keeps only the ones with exactly this set. A visitor's list is
  // already only their threads with the channel, and the channel's received
  // copies carry no ACL for `xchan` to match, so it's skipped there.
  // ponytail: first page (30 threads) per person; page it if anyone has more.
  const person = useQuery(() => ({
    queryKey: ["messenger-person", props.channel ?? "", props.groupKey],
    queryFn: () => fetchMessages({
      offset: 0, type: "direct", file: "", search: "",
      ...(props.channel ? { channel: props.channel } : { xchan: props.groupKey }),
    }),
  }));
  const group = createMemo<DmGroup | undefined>(() =>
    groupThreads(person.data?.entries ?? []).find((g) => g.key === props.groupKey),
  );

  const pins = usePins(() => props.base);
  const pinFor = (key: string) => pins.data?.find((p) => p.key === key);

  // One thread: skip the picker.
  createEffect(() => {
    const g = group();
    if (!props.uuid && g?.threads.length === 1) navigate(`${base()}/${g.threads[0].b64mid}`, { replace: true });
  });

  // A new thread with the same people, composed in Messenger's own pane.
  const newThread = () => {
    const g = group();
    if (g) navigate(`${props.base}/dm/new`, { state: { to: g.people.map(toRecipient) } });
  };

  const header = (subtitle?: string) => (
    <div class="flex items-center gap-3 px-3 py-2.5 border-b border-rim shrink-0">
      <BackButton href={props.uuid && (group()?.threads.length ?? 0) > 1 ? base() : `${props.base}/dm`} />
      <Avatar src={group()?.people[0]?.photo} name={group() ? groupName(group()!) : "?"} class="w-9 h-9" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-txt truncate">{group() ? groupName(group()!) : "…"}</p>
        <Show when={subtitle}>
          <p class="text-xs text-muted truncate">{subtitle}</p>
        </Show>
      </div>
      <Show when={auth()?.isLocal && group()}>
        {(g) => (
          <PinButton
            always
            pinned={!!pinFor(g().key)}
            onClick={() => void setPinned(props.base, g().key, groupName(g()), pinFor(g().key)).catch((e) => toast.error((e as Error).message))}
          />
        )}
      </Show>
      {/* The same thread as a comment tree, in the stream's post view. */}
      <Show when={props.uuid}>
        {(uuid) => (
          <button
            type="button"
            onClick={() => openPost(uuid())}
            title={t("messenger.view_thread") as string}
            aria-label={t("messenger.view_thread") as string}
            class="p-1.5 rounded-lg text-muted hover:text-txt hover:bg-elevated"
          >
            <MdOutlineForum size={18} />
          </button>
        )}
      </Show>
      {/* Remote visitors send from their own hub. */}
      <Show when={auth()?.isLocal}>
        <button
          type="button"
          onClick={newThread}
          disabled={!group()}
          title={t("messenger.new_dm") as string}
          aria-label={t("messenger.new_dm") as string}
          class="p-1.5 rounded-lg text-muted hover:text-txt hover:bg-elevated disabled:opacity-40"
        >
          <MdOutlineEdit size={18} />
        </button>
      </Show>
    </div>
  );

  return (
    <Show
      when={props.uuid}
      keyed
      fallback={
        <div class="flex flex-col flex-1 min-h-0">
          {header(group() ? (t("messenger.conversations", { n: String(group()!.threads.length) }) as string) : undefined)}
          <Show when={person.isError || (person.isSuccess && !group())}>
            <p class="p-4 text-sm text-red-500">{t("messenger.load_failed")}</p>
          </Show>
          <div class="flex-1 overflow-y-auto divide-y divide-rim">
            <For each={group()?.threads}>
              {(th) => (
                <A href={`${base()}/${th.b64mid}`} class="flex items-start gap-3 px-4 py-3 hover:bg-elevated transition-colors">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-txt truncate" classList={{ "font-semibold": !!th.unseen || !!th.unseen_count }}>
                      {th.title || t("messenger.no_subject")}
                    </p>
                    <p class="text-xs text-muted truncate">{decodeHtmlEntities(th.summary)}</p>
                  </div>
                  <span class="text-[0.6875rem] text-muted shrink-0 tabular-nums">{shortTime(th.created, locale())}</span>
                </A>
              )}
            </For>
          </div>
        </div>
      }
    >
      {(uuid) => {
        const th = () => group()?.threads.find((x) => x.b64mid === uuid);
        return (
          <div class="flex flex-col flex-1 min-h-0">
            {header(th()?.title || undefined)}
            <DmThread uuid={uuid} unseen={!!th()?.unseen || !!th()?.unseen_count} onGone={() => navigate(base(), { replace: true })} />
          </div>
        );
      }}
    </Show>
  );
}

/** The author's channel page, as the stream links it. */
const channelHref = (m: any) => `/chanview?f=&hash=${encodeURIComponent(m.author?.hash || m.author?.url || "")}`;

/** Item timestamps are UTC "YYYY-MM-DD HH:MM:SS". */
const itemDate = (created: string) => new Date(created.replace(" ", "T") + "Z");

/** A message's text, for a one-line quote. */
function snippet(m: any): string {
  const div = document.createElement("div");
  div.innerHTML = renderBody(m.body, m.mimetype, undefined, sanitizeHtml);
  return (div.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** `onGone`: the opening message was deleted, which takes the thread with it. */
function DmThread(props: { uuid: string; unseen: boolean; onGone: () => void }) {
  const { t, locale } = useI18n();
  const viewer = useNavViewer();
  const auth = useAuth();
  let scroller: HTMLDivElement | undefined;
  // Follow new messages only while the reader sits at the bottom; a poll
  // must not yank someone reading history back down.
  let pinned = true;
  const onScroll = () => {
    if (scroller) pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  };
  // The message a reply answers, when it isn't the thread's opening post.
  const [replyTo, setReplyTo] = createSignal<any>(null);
  const [flash, setFlash] = createSignal("");
  // Inline edit: the message being edited and its source text.
  const [editing, setEditing] = createSignal<{ uuid: string; body: string; title: string; mimetype: string } | null>(null);
  const [busy, setBusy] = createSignal(false);

  // Root + replies, flattened oldest-first: a DM reads as a chat, not a tree.
  // Replies to something other than the root carry a quote of it instead.
  const thread = useQuery(() => ({
    queryKey: ["messenger-thread", props.uuid],
    queryFn: async () => {
      const [root, c] = await Promise.all([
        fetchDisplayItem(props.uuid),
        fetchComments(props.uuid).catch(() => ({ comments: [] as any[] })),
      ]);
      return [root, ...(c.comments ?? [])].filter((m: any) => m?.body);
    },
    refetchInterval: 15_000,
  }));

  onMount(() => {
    if (props.unseen) void apiSetSeen(props.uuid, true).then(invalidateDms, () => {});
  });

  createEffect(on(() => thread.data?.length, () =>
    requestAnimationFrame(() => { if (scroller && pinned) scroller.scrollTop = scroller.scrollHeight; }),
  ));

  const messages = createMemo(() => {
    const list = thread.data ?? [];
    const byMid = new Map(list.map((m: any) => [m.mid, m]));
    const rootMid = list[0]?.mid;
    const days = list.map((m: any) => itemDate(m.created).toDateString());
    return list.map((m: any, i: number) => ({
      m,
      quoted: m.thr_parent && m.thr_parent !== rootMid && m.mid !== rootMid ? byMid.get(m.thr_parent) : undefined,
      self: !!viewer()?.hash && m.author?.hash === viewer()!.hash,
      day: i === 0 || days[i] !== days[i - 1] ? itemDate(m.created).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" }) : "",
      first: i === 0 || list[i - 1].author?.hash !== m.author?.hash || days[i] !== days[i - 1],
    }));
  });

  function jumpTo(mid: string) {
    const el = scroller?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(mid)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(mid);
    setTimeout(() => setFlash((f) => (f === mid ? "" : f)), 1500);
  }

  async function send(body: string, mimetype: string) {
    // Commenting on a reply: the server re-roots it to the thread and keeps
    // thr_parent on the message answered.
    await apiCreateComment(replyTo()?.uuid ?? props.uuid, body, "", mimetype);
    setReplyTo(null);
    pinned = true;
    await thread.refetch();
    invalidateDms();
  }

  // Each action refetches the thread rather than patching it: likes, edits
  // and deletes are rare enough that one round-trip is the simpler truth.
  async function act(fn: () => Promise<unknown>) {
    if (busy()) return;
    setBusy(true);
    try {
      await fn();
      await thread.refetch();
      invalidateDms();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The stored source, not the rendered body: markdown and [share] embeds
  // need the compose form to round-trip.
  async function startEdit(m: any) {
    const src = await apiFetchComposeSource(m.uuid);
    if (!src) return toast.error(t("messenger.load_failed") as string);
    setEditing({ uuid: m.uuid, body: src.body, title: src.title, mimetype: src.mimetype });
  }

  const saveEdit = () => {
    const e = editing();
    if (!e || !e.body.trim()) return;
    // No `category` key: the server keeps the item's categories as they are.
    void act(() => apiEditItem(e.uuid, { body: e.body, title: e.title, mimetype: e.mimetype })).then(() => setEditing(null));
  };

  async function remove(m: any, isRoot: boolean) {
    if (!confirm(t(isRoot ? "messenger.delete_thread_confirm" : "messenger.delete_confirm") as string)) return;
    if (!isRoot) return act(() => apiDeleteItem(m.uuid));
    try {
      await apiDeleteItem(m.uuid);
      invalidateDms();
      props.onGone();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const ACTION = "p-0.5 rounded hover:text-txt hover:bg-elevated disabled:opacity-50";
  // Shown on hover/focus with a mouse; always (faintly) on touch screens.
  const REVEAL = "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-60";

  const replyButton = (m: any) => (
    <button
      type="button"
      onClick={() => setReplyTo(m)}
      aria-label={t("messenger.reply") as string}
      title={t("messenger.reply") as string}
      class={`p-1 mt-0.5 rounded-full text-muted hover:text-txt hover:bg-elevated shrink-0 ${REVEAL}`}
    >
      <MdOutlineReply size={16} />
    </button>
  );

  return (
    <>
      <div ref={scroller} onScroll={onScroll} class="flex-1 overflow-y-auto px-4 py-3 space-y-0.5">
        <Show when={thread.isLoading}>
          <div class="space-y-3 animate-pulse">
            <For each={[0, 1, 2]}>{() => <div class="h-8 bg-elevated rounded-xl w-2/3" />}</For>
          </div>
        </Show>
        <Show when={thread.isError}>
          <p class="text-sm text-red-500">{t("messenger.load_failed")}</p>
        </Show>
        <For each={messages()}>
          {({ m, quoted, self, day, first }, i) => (
            <>
              <Show when={day}>
                <div class="flex items-center gap-3 pt-4 pb-1" role="separator">
                  <div class="flex-1 h-px bg-rim" />
                  <span class="text-[0.6875rem] font-medium text-muted uppercase">{day}</span>
                  <div class="flex-1 h-px bg-rim" />
                </div>
              </Show>
              <div class="group flex items-start gap-2 py-px" classList={{ "justify-end": self, "mt-2.5": first }}>
                <Show when={!self}>
                  {/* Avatar with the name under it, in a fixed-width column so
                      a run's later messages stay aligned beneath it. */}
                  <Show when={first} fallback={<div class="w-12 shrink-0" />}>
                    <A href={channelHref(m)} title={m.author?.name} class="w-12 shrink-0 flex flex-col items-center gap-0.5 group/author">
                      <Avatar src={m.author?.photo?.src} name={m.author?.name ?? "?"} class="w-7 h-7" />
                      <span class="w-full text-center text-[0.625rem] leading-tight text-muted truncate group-hover/author:text-txt group-hover/author:underline">
                        {m.author?.name}
                      </span>
                    </A>
                  </Show>
                </Show>
                <div class="max-w-[85%] min-w-0 flex flex-col" classList={{ "items-end": self }}>
                  {/* Bubble and its reply button share a row, so the button
                      lines up with the message's first line. */}
                  <div class="flex items-start gap-1 max-w-full" classList={{ "flex-row-reverse": self }}>
                  <div
                    data-mid={m.mid}
                    class="min-w-0 px-3 py-1.5 text-sm leading-relaxed rounded-2xl break-words transition-shadow"
                    classList={{
                      "bg-accent text-accent-fg": self,
                      "bg-elevated text-txt": !self,
                      "ring-2 ring-accent ring-offset-2 ring-offset-surface": flash() === m.mid,
                    }}
                  >
                    <Show when={quoted}>
                      {(q) => (
                        <button
                          type="button"
                          onClick={() => jumpTo(q().mid)}
                          title={t("messenger.jump_to_message") as string}
                          class="block w-full text-left mb-1 pl-2 border-l-2 border-current/50 opacity-80 hover:opacity-100 text-xs"
                        >
                          <span class="block font-semibold truncate">{q().author?.name}</span>
                          <span class="block truncate">{snippet(q())}</span>
                        </button>
                      )}
                    </Show>
                    <Show
                      when={editing()?.uuid === m.uuid}
                      fallback={<div class="post-body [&_img]:max-w-full" innerHTML={renderBody(m.body, m.mimetype, undefined, sanitizeHtml)} />}
                    >
                      <textarea
                        value={editing()!.body}
                        onInput={(e) => setEditing({ ...editing()!, body: e.currentTarget.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditing(null);
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveEdit();
                        }}
                        ref={(el) => requestAnimationFrame(() => el.focus())}
                        rows={3}
                        class="w-64 max-w-full field-sizing-content min-h-16 max-h-60 bg-surface text-txt border border-rim rounded-lg px-2 py-1 text-sm outline-none focus:border-accent"
                      />
                      <div class="flex justify-end gap-2 mt-1 text-xs">
                        <button type="button" onClick={() => setEditing(null)} class="px-2 py-0.5 rounded hover:underline">
                          {t("messenger.cancel")}
                        </button>
                        <button type="button" onClick={saveEdit} disabled={busy()} class="px-2 py-0.5 rounded bg-surface text-txt font-medium disabled:opacity-50">
                          {t("messenger.save")}
                        </button>
                      </div>
                    </Show>
                  </div>
                  {replyButton(m)}
                  </div>
                  {/* Time, likes, then edit/delete — small icons under the bubble,
                      so the row beside it holds only the reply button. */}
                  <div class="flex flex-wrap items-center gap-x-2 text-[0.625rem] text-muted px-1" classList={{ "justify-end": self }}>
                    <span class="tabular-nums" title={itemDate(m.created).toLocaleString(locale())}>
                      {itemDate(m.created).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <Show when={m.edited && m.edited !== m.created}>
                      <span title={itemDate(m.edited).toLocaleString(locale())}>· {t("messenger.edited")}</span>
                    </Show>
                    <button
                      type="button"
                      disabled={busy()}
                      onClick={() => void act(() => apiToggleLike(m.uuid))}
                      aria-pressed={!!m.viewer_liked}
                      title={t(m.viewer_liked ? "messenger.unlike" : "messenger.like") as string}
                      aria-label={t(m.viewer_liked ? "messenger.unlike" : "messenger.like") as string}
                      class={`flex items-center gap-0.5 ${ACTION}`}
                      classList={{ "text-accent": !!m.viewer_liked }}
                    >
                      <Show when={m.viewer_liked} fallback={<MdOutlineFavorite_border size={12} />}>
                        <MdFillFavorite size={12} />
                      </Show>
                      <Show when={m.like_count > 0}>
                        <span class="tabular-nums" aria-label={t("messenger.likes", { n: String(m.like_count) }) as string}>{m.like_count}</span>
                      </Show>
                    </button>
                    {/* Edit and delete are local-channel endpoints; remote visitors do that on their own hub. */}
                    <Show when={self && auth()?.isLocal && editing()?.uuid !== m.uuid}>
                      <button
                        type="button"
                        onClick={() => void startEdit(m)}
                        title={t("messenger.edit") as string}
                        aria-label={t("messenger.edit") as string}
                        class={`${ACTION} ${REVEAL}`}
                      >
                        <MdOutlineEdit size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={busy()}
                        onClick={() => void remove(m, i() === 0)}
                        title={t("messenger.delete") as string}
                        aria-label={t("messenger.delete") as string}
                        class={`p-0.5 rounded hover:text-red-500 hover:bg-elevated disabled:opacity-50 ${REVEAL}`}
                      >
                        <MdOutlineDelete size={12} />
                      </button>
                    </Show>
                  </div>
                </div>
              </div>
            </>
          )}
        </For>
      </div>
      <Show when={replyTo()}>
        {(r) => (
          <div class="flex items-center gap-2 mx-3 mt-2 pl-2 border-l-2 border-accent text-xs shrink-0">
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-txt truncate">{t("messenger.replying_to", { name: r().author?.name ?? "" })}</p>
              <p class="text-muted truncate">{snippet(r())}</p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label={t("messenger.cancel_reply") as string}
              title={t("messenger.cancel_reply") as string}
              class="p-1 rounded-md text-muted hover:text-txt hover:bg-elevated"
            >
              <MdOutlineClose size={16} />
            </button>
          </div>
        )}
      </Show>
      <ChatComposer
        send={send}
        scope={`dm:reply:${props.uuid}`}
        placeholder={t("messenger.reply_placeholder") as string}
        // Uploads take the channel default ACL; core's fix_attached_permissions
        // narrows them to the DM's on send, as for DMComposer. Local only —
        // a remote visitor has no nick to wall_attach against.
        upload={auth()?.isLocal ? async (file, onPct) => (await wallAttach(currentNick(), file, onPct)).message : undefined}
      />
    </>
  );
}
