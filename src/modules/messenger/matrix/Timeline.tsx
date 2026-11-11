// One Matrix room: messages (newest at the bottom), older-page loading, a
// plain-text composer, read receipts, and accept/decline for an invite.
import DOMPurify from "dompurify";
import { For, Show, createEffect, createMemo, createSignal, useContext } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { ComposerFrameContext, openMatrix } from "@/shared/views/modal-host";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { Button, IconButton } from "@ui/Button";
import { ProgressBar } from "@ui/ProgressBar";
import { Textarea } from "@ui/Field";
import { Spinner } from "@ui/Spinner";
import { MdOutlineAdd_reaction, MdOutlineArrow_back, MdOutlineAttach_file, MdOutlineClose, MdOutlineLock, MdOutlinePicture_in_picture_alt, MdOutlineReply, MdOutlineSend } from "solid-icons/md";
import { Popover } from "@ui/Popover";
import { client, sdk, tick } from "./client";
import { MatrixAttachment, isAttachment } from "./MatrixMedia";
import { sendAttachment } from "./media";
import { POST_PROSE } from "@/shared/lib/prose";
import { escapeHtml } from "@/shared/editor/lib/linkMeta";

// The HTML subset the Matrix spec allows in formatted_body, minus <img>
// (inline images would be an unauthenticated mxc fetch; attachments go through MatrixMedia).
const ALLOWED_TAGS = ["font", "del", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "p", "a", "ul", "ol",
  "sup", "sub", "li", "b", "i", "u", "strong", "em", "s", "strike", "code", "hr", "br", "div", "table",
  "thead", "tbody", "tr", "th", "td", "caption", "pre", "span", "details", "summary"];
// No colour attributes: a sender-picked colour can vanish on some of the 23 theme presets.
const ALLOWED_ATTR = ["href", "start", "colspan", "rowspan"];

// Own instance: the hook must not leak into the app's other DOMPurify calls.
// Links are retargeted on the DOM node — rewriting the serialized string would
// let an "<a " inside an attribute value break out of it.
const purify = DOMPurify(window);
purify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName !== "A") return;
  node.setAttribute("target", "_blank");
  node.setAttribute("rel", "noopener noreferrer nofollow");
});

/** formatted_body is federated HTML: allowlisted, links forced to a new tab. */
export function renderMatrixHtml(html: string): string {
  return purify.sanitize(html.replace(/<mx-reply>[\s\S]*?<\/mx-reply>/g, ""), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}

// Quick reactions: Matrix keys are plain Unicode, so the hub's image-smiley
// EmojiPicker doesn't fit here.
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉", "👀", "🙏", "🔥", "✅", "👎", "🤔"];

const replyTarget = (ev: sdk.MatrixEvent): string | undefined =>
  ev.getContent()["m.relates_to"]?.["m.in_reply_to"]?.event_id;
/** Body with the legacy "> <@user> quoted" reply fallback removed. */
const plainBody = (ev: sdk.MatrixEvent) => {
  const body = String(ev.getContent().body ?? "");
  return replyTarget(ev) ? body.replace(/^(?:>.*\n)+\n?/, "") : body;
};

const SHOWN = new Set(["m.room.message", "m.room.encrypted", "m.sticker"]);
const shown = (ev: sdk.MatrixEvent) =>
  SHOWN.has(ev.getType()) && !ev.isRedacted() && ev.getContent()["m.relates_to"]?.rel_type !== "m.replace";

/** `back` is the list url in Messenger; absent when hosted in a MatrixWindow. */
export default function Timeline(props: { roomId: string; back?: string }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const inWindow = !!useContext(ComposerFrameContext);
  const room = createMemo(() => { tick(); return client()?.getRoom(props.roomId) ?? null; });
  const me = () => client()?.getUserId() ?? "";
  // Newest first: the column is flex-col-reverse, so the view stays pinned
  // to the bottom as messages arrive, with no scroll bookkeeping.
  const events = createMemo(() => {
    tick();
    return [...(room()?.getLiveTimeline().getEvents() ?? [])].filter(shown).reverse();
  });
  const membership = () => { tick(); return room()?.getMyMembership(); };
  const encrypted = () => { tick(); return !!room()?.hasEncryptionStateEvent(); };
  const canLoadMore = () => { tick(); return room()?.getLiveTimeline().getPaginationToken(sdk.EventTimeline.BACKWARDS) != null; };

  const [loadingMore, setLoadingMore] = createSignal(false);
  async function loadMore() {
    const c = client(), r = room();
    if (!c || !r) return;
    setLoadingMore(true);
    try { await c.scrollback(r, 30); } finally { setLoadingMore(false); }
  }

  // Read receipt for the newest message from someone else, once per event.
  let receipted = "";
  createEffect(() => {
    const last = events().find((e) => e.getSender() !== me());
    const id = last?.getId();
    if (!last || !id || id === receipted || membership() !== sdk.KnownMembership.Join) return;
    receipted = id;
    void client()?.sendReadReceipt(last).catch(() => {});
  });

  // Attachments: one at a time, in order (button, paste or drop).
  const [upload, setUpload] = createSignal<{ name: string; fraction: number } | null>(null);
  async function sendFiles(files: File[]) {
    if (!files.length || upload()) return;
    for (const f of files) {
      setUpload({ name: f.name, fraction: 0 });
      try {
        await sendAttachment(props.roomId, f, (fraction) => setUpload({ name: f.name, fraction }));
      } catch (e) {
        toast.error(t("matrix.send_failed", { error: (e as Error).message }) as string);
      }
    }
    setUpload(null);
  }
  let fileInput: HTMLInputElement | undefined;

  const [draft, setDraft] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [replyTo, setReplyTo] = createSignal<sdk.MatrixEvent | null>(null);
  let textarea: HTMLTextAreaElement | undefined;
  const startReply = (ev: sdk.MatrixEvent) => { setReplyTo(ev); textarea?.focus(); };
  async function send() {
    const body = draft().trim();
    const c = client();
    if (!body || !c) return;
    setSending(true);
    try {
      const target = replyTo()?.getId();
      await c.sendMessage(props.roomId, {
        msgtype: "m.text",
        body,
        ...(target ? { "m.relates_to": { "m.in_reply_to": { event_id: target } } } : {}),
      } as never);
      setDraft("");
      setReplyTo(null);
    } catch (e) {
      toast.error(t("matrix.send_failed", { error: (e as Error).message }) as string);
    } finally {
      setSending(false);
    }
  }

  const [busy, setBusy] = createSignal(false);
  async function answerInvite(accept: boolean) {
    const c = client();
    if (!c) return;
    setBusy(true);
    try { await (accept ? c.joinRoom(props.roomId) : c.leave(props.roomId)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  const senderName = (ev: sdk.MatrixEvent) => room()?.getMember(ev.getSender() ?? "")?.name ?? ev.getSender() ?? "";
  const time = (ev: sdk.MatrixEvent) =>
    new Date(ev.getTs()).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

  // ── reactions ──
  /** [emoji, live reaction events] for a message, most used first. */
  const reactionsFor = (ev: sdk.MatrixEvent) => {
    tick();
    const id = ev.getId();
    const groups = id ? room()?.relations.getChildEventsForEvent(id, "m.annotation", "m.reaction")?.getSortedAnnotationsByKey() : null;
    return (groups ?? [])
      .map(([key, set]) => [key, [...set].filter((e) => !e.isRedacted())] as const)
      .filter(([, list]) => list.length);
  };
  async function toggleReaction(ev: sdk.MatrixEvent, key: string) {
    const c = client(), id = ev.getId();
    if (!c || !id) return;
    const mine = reactionsFor(ev).find(([k]) => k === key)?.[1].find((e) => e.getSender() === me());
    try {
      if (mine?.getId()) await c.redactEvent(props.roomId, mine.getId()!);
      else await c.sendEvent(props.roomId, "m.reaction" as never, { "m.relates_to": { rel_type: "m.annotation", event_id: id, key } } as never);
    } catch (e) {
      toast.error(t("matrix.send_failed", { error: (e as Error).message }) as string);
    }
  }

  /** A short plain-text line for quoting a message. */
  const snippet = (ev: sdk.MatrixEvent) => {
    tick();
    if (ev.isDecryptionFailure()) return t("matrix.undecryptable") as string;
    const c = ev.getContent();
    return isAttachment(ev.getType(), c.msgtype) ? `[${String(c.msgtype ?? "sticker").replace(/^m\./, "")}] ${c.body ?? ""}` : plainBody(ev);
  };
  const jumpTo = (id: string) =>
    document.querySelector(`[data-event-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });

  function ReplyQuote(p: { id: string }) {
    const target = () => { tick(); return room()?.findEventById(p.id); };
    return (
      <button type="button" onClick={() => jumpTo(p.id)}
        class="block w-full text-left mb-1 pl-2 border-l-2 border-accent text-xs text-muted hover:text-txt">
        <Show when={target()} fallback={t("matrix.reply_unknown")}>
          <span class="font-medium text-txt">{senderName(target()!)}</span>
          <span class="block truncate">{snippet(target()!)}</span>
        </Show>
      </button>
    );
  }

  function Body(p: { ev: sdk.MatrixEvent }) {
    // tick(): decryption swaps an event's content in place, same object.
    const content = () => { tick(); return p.ev.getContent(); };
    return (
      <Show
        when={!p.ev.isDecryptionFailure()}
        fallback={<span class="italic text-muted">{t("matrix.undecryptable")}</span>}
      >
        <Show when={p.ev.getType() !== "m.room.encrypted"} fallback={<span class="text-muted">…</span>}>
          {(() => {
            const c = content();
            const type = String(c.msgtype ?? "");
            if (isAttachment(p.ev.getType(), type)) return <MatrixAttachment type={p.ev.getType()} content={c} />;
            // The display name is the sender's to choose: escaped before it meets innerHTML below.
            const prefix = type === "m.emote" ? `* ${senderName(p.ev)} ` : "";
            return c.format === "org.matrix.custom.html" && typeof c.formatted_body === "string"
              ? <div class={`${POST_PROSE} text-txt prose-p:my-0 prose-headings:my-1 prose-blockquote:my-1 prose-pre:my-1 prose-ul:my-0 prose-ol:my-0`} innerHTML={escapeHtml(prefix) + renderMatrixHtml(c.formatted_body)} />
              : <div class="whitespace-pre-wrap break-words">{prefix + plainBody(p.ev)}</div>;
          })()}
        </Show>
      </Show>
    );
  }

  return (
    <div class="flex-1 flex flex-col min-h-0">
      <header class="flex items-center gap-2 px-3 py-2 border-b border-rim shrink-0">
        <Show when={props.back}>
          <A href={props.back!} class="md:hidden p-1 text-muted hover:text-txt" aria-label={t("matrix.back") as string}>
            <MdOutlineArrow_back size={20} />
          </A>
        </Show>
        {/* A window's own header already names the room. */}
        <h2 class="flex-1 min-w-0 text-sm font-semibold text-txt truncate">{inWindow ? "" : room()?.name ?? props.roomId}</h2>
        <Show when={encrypted()}>
          <MdOutlineLock size={16} class="text-muted shrink-0" aria-label={t("matrix.encrypted") as string} />
        </Show>
        <Show when={!inWindow}>
          <IconButton label={t("matrix.pop_out") as string} size="sm"
            onClick={() => { openMatrix(props.roomId, room()?.name ?? ""); if (props.back) navigate(props.back); }}>
            <MdOutlinePicture_in_picture_alt size={18} />
          </IconButton>
        </Show>
      </header>

      <Show when={room()} fallback={<div class="flex-1 flex items-center justify-center"><Spinner /></div>}>
        <Show
          when={membership() !== sdk.KnownMembership.Invite}
          fallback={
            <div class="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
              <p class="text-sm text-txt">{room()!.name}</p>
              <div class="flex flex-wrap gap-2 justify-center">
                <Button onClick={() => void answerInvite(true)} disabled={busy()}>{t("matrix.accept")}</Button>
                <Button variant="ghost" onClick={() => void answerInvite(false)} disabled={busy()}>{t("matrix.decline")}</Button>
              </div>
            </div>
          }
        >
          <div
            class="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse gap-1 px-3 py-2"
            onDragOver={(e) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); }}
            onDrop={(e) => { const fs = [...(e.dataTransfer?.files ?? [])]; if (fs.length) { e.preventDefault(); void sendFiles(fs); } }}
          >
            <For each={events()}>
              {(ev) => {
                const mine = ev.getSender() === me();
                const quoted = replyTarget(ev);
                return (
                  <div data-event-id={ev.getId()} class="group flex flex-col max-w-[85%]" classList={{ "self-end items-end": mine, "self-start": !mine }}>
                    <Show when={!mine}>
                      <span class="text-[0.6875rem] text-muted px-1">{senderName(ev)}</span>
                    </Show>
                    <div class="flex items-center gap-1" classList={{ "flex-row-reverse": !mine }}>
                      {/* Actions: hover/focus on desktop, always visible on touch widths. */}
                      <div class="flex items-center gap-0.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                        <Popover
                          placement="top"
                          role="dialog"
                          label={t("matrix.react") as string}
                          class="p-1.5"
                          trigger={(tp) => (
                            <IconButton {...tp} label={t("matrix.react") as string} size="sm"><MdOutlineAdd_reaction size={16} /></IconButton>
                          )}
                        >
                          {(close) => (
                            <div class="grid grid-cols-6 gap-0.5">
                              <For each={QUICK_REACTIONS}>
                                {(key) => (
                                  <button type="button" class="w-8 h-8 rounded-lg text-lg hover:bg-elevated" aria-label={key}
                                    onClick={() => { close(); void toggleReaction(ev, key); }}>{key}</button>
                                )}
                              </For>
                            </div>
                          )}
                        </Popover>
                        <IconButton label={t("matrix.reply") as string} size="sm" onClick={() => startReply(ev)}>
                          <MdOutlineReply size={16} />
                        </IconButton>
                      </div>
                      <div class="min-w-0 rounded-2xl px-3 py-1.5 text-sm" classList={{ "bg-accent-muted text-txt": mine, "bg-elevated text-txt": !mine }}>
                        <Show when={quoted}><ReplyQuote id={quoted!} /></Show>
                        <Body ev={ev} />
                      </div>
                    </div>
                    <Show when={reactionsFor(ev).length}>
                      <div class="flex flex-wrap gap-1 mt-0.5 px-1" classList={{ "justify-end": mine }}>
                        <For each={reactionsFor(ev)}>
                          {([key, list]) => {
                            const reacted = () => list.some((e) => e.getSender() === me());
                            return (
                              <button type="button" aria-pressed={reacted()} onClick={() => void toggleReaction(ev, key)}
                                title={list.map((e) => room()?.getMember(e.getSender() ?? "")?.name ?? e.getSender()).join(", ")}
                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs tabular-nums transition-colors"
                                classList={{ "border-accent bg-accent-muted text-txt": reacted(), "border-rim bg-surface text-muted hover:border-accent": !reacted() }}>
                                <span>{key}</span>{list.length}
                              </button>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                    <span class="text-[0.625rem] text-muted px-1 tabular-nums">{time(ev)}</span>
                  </div>
                );
              }}
            </For>
            <Show when={canLoadMore()}>
              <button
                type="button"
                class="self-center py-2 text-xs text-muted hover:text-txt disabled:opacity-50"
                disabled={loadingMore()}
                onClick={() => void loadMore()}
              >
                {t("matrix.load_more")}
              </button>
            </Show>
          </div>

          <Show when={upload()}>
            <div class="flex items-center gap-2 px-3 pt-2 text-xs text-muted shrink-0">
              <Spinner size="sm" />
              <span class="flex-1 min-w-0 truncate">{t("matrix.uploading", { name: upload()!.name })}</span>
              <ProgressBar value={upload()!.fraction * 100} label={t("matrix.uploading", { name: upload()!.name }) as string} class="w-24" />
            </div>
          </Show>
          <Show when={replyTo()}>
            <div class="flex items-center gap-2 px-3 pt-2 text-xs shrink-0 border-t border-rim">
              <MdOutlineReply size={14} class="text-muted shrink-0" />
              <span class="flex-1 min-w-0 truncate text-muted">
                {t("matrix.replying_to", { name: senderName(replyTo()!) })}: <span class="text-txt">{snippet(replyTo()!)}</span>
              </span>
              <IconButton label={t("matrix.cancel_reply") as string} size="sm" onClick={() => setReplyTo(null)}>
                <MdOutlineClose size={14} />
              </IconButton>
            </div>
          </Show>
          <form
            class="flex items-end gap-2 p-3 border-t border-rim shrink-0"
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <input ref={fileInput} type="file" multiple class="hidden"
              onChange={(e) => { const fs = [...(e.currentTarget.files ?? [])]; e.currentTarget.value = ""; void sendFiles(fs); }} />
            <IconButton label={t("matrix.attach") as string} size="sm" disabled={!!upload()} onClick={() => fileInput?.click()}>
              <MdOutlineAttach_file size={18} />
            </IconButton>
            <Textarea
              ref={textarea}
              class="flex-1 min-w-0 max-h-40"
              rows={1}
              value={draft()}
              placeholder={(encrypted() ? t("matrix.composer_encrypted") : t("matrix.composer")) as string}
              onInput={(e) => setDraft(e.currentTarget.value)}
              onPaste={(e) => {
                const fs = [...(e.clipboardData?.files ?? [])];
                if (fs.length) { e.preventDefault(); void sendFiles(fs); }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send(); }
                if (e.key === "Escape" && replyTo()) { e.preventDefault(); setReplyTo(null); }
              }}
            />
            <Button type="submit" size="sm" disabled={sending() || !draft().trim()} aria-label={t("matrix.send") as string}>
              <MdOutlineSend size={16} />
            </Button>
          </form>
        </Show>
      </Show>
    </div>
  );
}
