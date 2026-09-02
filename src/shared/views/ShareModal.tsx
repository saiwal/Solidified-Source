import { createSignal, createMemo, Show, For, lazy, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import {
  MdOutlineContent_copy,
  MdOutlineIos_share,
  MdOutlineMail,
  MdOutlineSend,
} from "solid-icons/md";
import { BiRegularRepost } from "solid-icons/bi";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import type { ShareTarget } from "@utsukta/spa-core/store/share";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchLockview, grantGuest } from "@utsukta/spa-core/lib/lockview-api";
import { saveToken, newTokenValue } from "@/modules/directory/tokens/api";

const PostComposer = lazy(() => import("@/shared/editor/composers/PostComposer"));

interface Props {
  target: ShareTarget;
  onClose: () => void;
}

/**
 * The one share popup, opened from anywhere via openShare(). Deliberately not
 * built on ComposerModal — that shell is editor-sized; this follows the
 * compact copyable-rows shape the old files Info panel used.
 *
 * There are no per-network (X / Facebook / WhatsApp …) buttons: navigator.share
 * hands the OS share sheet to the user on every platform that has one, which
 * covers every network they actually have installed, and desktop falls back to
 * copy-link. Adding network intent URLs would be code we'd have to maintain
 * for a strictly worse list.
 */
const ShareModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const auth = useAuth();

  const [composerOpen, setComposerOpen] = createSignal(false);
  const [emailOpen, setEmailOpen] = createSignal(false);
  const [to, setTo] = createSignal("");
  const [note, setNote] = createSignal("");
  const [sending, setSending] = createSignal(false);

  // Who can see this, and any guest-access links. Only the owner gets an
  // answer — the endpoint refuses other channels' items — so don't even ask
  // unless we're local and the target names a Lockview-addressable resource.
  const lockviewKey = createMemo(() => {
    const lv = props.target.lockview;
    return lv && auth()?.isLocal ? `${lv.type}/${lv.id}` : null;
  });
  const [lockview, { mutate: setLockview }] = createQueryResource("lockview", lockviewKey, (key) => {
    const [type, id] = key.split("/");
    return fetchLockview(type as never, id);
  });

  const guests = () => lockview()?.guests ?? [];
  const otherGuests = () => lockview()?.other_guests ?? [];
  const [guestId, setGuestId] = createSignal<number | null>(null);
  const activeGuest = () => guests().find((g) => g.id === guestId()) ?? null;

  // Everything downstream (copy, native share, email, share-as-post) reads
  // this, so picking a guest carries the credential consistently instead of
  // only into whichever affordance happened to be wired for it.
  const shareUrl = () => activeGuest()?.url ?? props.target.url;

  // Picking a guest who isn't on the ACL yet widens the audience first — the
  // link is useless otherwise, and the owner opened this dialog to share.
  async function pickGuest(value: string) {
    const id = value ? Number(value) : null;
    if (id === null || guests().some((g) => g.id === id)) {
      setGuestId(id);
      return;
    }
    const lv = props.target.lockview!;
    try {
      const guest = await grantGuest(lv.type, lv.id, id);
      setLockview({
        ...lockview()!,
        guests: [...guests(), guest],
        other_guests: otherGuests().filter((g) => g.id !== id),
      });
      setGuestId(id);
      toast.success(t("share.guest_added", { name: guest.name }) as string);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (t("share.email_failed") as string));
    }
  }

  // Creating a guest here saves the round trip to /directory/guest-access when
  // the channel has no guest yet — which is the common case the moment someone
  // wants to hand a private post to an outsider.
  const [newGuestOpen, setNewGuestOpen] = createSignal(false);
  const [newGuestName, setNewGuestName] = createSignal("");
  const [newGuestExpires, setNewGuestExpires] = createSignal("");
  const [creating, setCreating] = createSignal(false);

  async function createGuest(e: Event) {
    e.preventDefault();
    if (creating()) return;
    setCreating(true);
    try {
      const tok = await saveToken(null, {
        name: newGuestName().trim(),
        token: await newTokenValue(),
        expires: newGuestExpires() || undefined,
      });
      setLockview({ ...lockview()!, other_guests: [...otherGuests(), { id: tok.id, name: tok.name }] });
      // pickGuest does the grant, the optimistic list move and the toast.
      await pickGuest(String(tok.id));
      setNewGuestOpen(false);
      setNewGuestName("");
      setNewGuestExpires("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (t("share.guest_new_failed") as string));
    } finally {
      setCreating(false);
    }
  }

  const canPost = () => auth()?.isLocal === true && !!props.target.postBody;
  const canNativeShare = () => typeof navigator !== "undefined" && "share" in navigator;

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("share.copied") as string);
    } catch {
      toast.error(t("share.copy_failed") as string);
    }
  }

  function nativeShare() {
    navigator
      .share({ title: props.target.title, text: props.target.summary, url: shareUrl() })
      // AbortError just means the user dismissed the sheet — not worth a toast.
      .catch(() => {});
  }

  /** Guest-link caveats, so a recipient knows what the ?zat= link is and when it dies. */
  function guestLines(): string[] {
    const g = activeGuest();
    if (!g) return [];
    const lines = [t("share.guest_email_intro", { name: g.name }) as string];
    if (g.expires) lines.push(t("share.guest_email_expires", { date: g.expires }) as string);
    return lines;
  }

  function mailtoHref() {
    const body = [props.target.summary, shareUrl(), ...guestLines()].filter(Boolean).join("\n\n");
    return `mailto:?subject=${encodeURIComponent(props.target.title)}&body=${encodeURIComponent(body)}`;
  }

  async function sendFromSite(e: Event) {
    e.preventDefault();
    if (sending()) return;
    setSending(true);
    try {
      const res = await apiFetch("/spa/share/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to(),
          url: props.target.url,
          zat: activeGuest()?.url ? new URL(activeGuest()!.url).searchParams.get("zat") : undefined,
          title: props.target.title,
          note: note(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || (t("share.email_failed") as string));
      toast.success(t("share.email_sent") as string);
      setEmailOpen(false);
      setTo("");
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (t("share.email_failed") as string));
    } finally {
      setSending(false);
    }
  }

  const rowBtn =
    "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-txt hover:bg-elevated transition-colors";

  return (
    <>
      {/* Hidden, not closed, while composing: ComposerModal is z-50 and this
          overlay is z-[60], so leaving both up buries the composer behind our
          backdrop. Closing the composer drops back to the share popup. */}
      <Show when={!composerOpen()}>
        <Portal>
          <div
            class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
          >
            <div class="w-full max-w-md rounded-xl border border-rim bg-surface shadow-2xl overflow-hidden">
              <header class="flex items-center justify-between px-4 py-3 border-b border-rim">
                <span class="text-sm font-semibold text-txt truncate">
                  {t("share.title")} — <span class="font-normal text-muted">{props.target.title}</span>
                </span>
                <button
                  onClick={props.onClose}
                  aria-label={t("share.close") as string}
                  class="text-muted hover:text-txt text-lg leading-none shrink-0 ml-2"
                >
                  ×
                </button>
              </header>

              <div class="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                {/* Link */}
                <CopyRow
                  label={t("share.link") as string}
                  value={shareUrl()}
                  copyLabel={t("share.copy") as string}
                  onCopy={copy}
                />

                {/* Actions */}
                <div class="pt-1 space-y-0.5">
                  <Show when={canNativeShare()}>
                    <button type="button" class={rowBtn} onClick={nativeShare}>
                      <MdOutlineIos_share size={17} class="text-muted" />
                      <span>{t("share.native_share")}</span>
                    </button>
                  </Show>

                  <Show when={canPost()}>
                    <button type="button" class={rowBtn} onClick={() => setComposerOpen(true)}>
                      <BiRegularRepost size={17} class="text-muted" />
                      <span>{t("share.share_as_post")}</span>
                    </button>
                    <Show when={props.target.restricted}>
                      <p class="px-2 pb-1 text-[0.6875rem] text-amber-600 dark:text-amber-500">
                        {t("share.restricted_warning")}
                      </p>
                    </Show>
                  </Show>

                  <a class={rowBtn} href={mailtoHref()}>
                    <MdOutlineMail size={17} class="text-muted" />
                    <span>{t("share.email_client")}</span>
                  </a>

                  <Show when={auth()?.isLocal}>
                    <button type="button" class={rowBtn} onClick={() => setEmailOpen(v => !v)}>
                      <MdOutlineSend size={17} class="text-muted" />
                      <span>{t("share.email_site")}</span>
                    </button>
                  </Show>
                </div>

                {/* Server-side email form */}
                <Show when={emailOpen()}>
                  <form class="space-y-2 rounded-lg border border-rim p-3" onSubmit={sendFromSite}>
                    <div class="space-y-1">
                      <label class="block text-xs text-muted">{t("share.email_to")}</label>
                      <input
                        type="text"
                        required
                        value={to()}
                        onInput={(e) => setTo(e.currentTarget.value)}
                        placeholder={t("share.email_to_placeholder") as string}
                        class="w-full px-3 py-1.5 rounded-lg border border-rim bg-elevated text-sm text-txt"
                      />
                      <p class="text-[0.6875rem] text-muted">{t("share.email_to_hint")}</p>
                    </div>
                    <div class="space-y-1">
                      <label class="block text-xs text-muted">{t("share.email_note")}</label>
                      <textarea
                        rows={3}
                        maxlength={1000}
                        value={note()}
                        onInput={(e) => setNote(e.currentTarget.value)}
                        class="w-full px-3 py-1.5 rounded-lg border border-rim bg-elevated text-sm text-txt resize-y"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sending()}
                      class="px-3 py-1.5 rounded-lg bg-accent text-white text-sm disabled:opacity-60"
                    >
                      {sending() ? t("share.email_sending") : t("share.email_send")}
                    </button>
                  </form>
                </Show>

                {/* Guest access — only guests already in this item's audience
                    appear here; a token is not a skeleton key. */}
                <Show when={guests().length > 0 || otherGuests().length > 0 || lockview()?.can_create_guest}>
                  <div class="space-y-1 rounded-lg border border-rim p-3">
                    <label class="block text-xs font-semibold text-txt">
                      {t("share.guest_access_title")}
                    </label>
                    <Show when={guests().length > 0 || otherGuests().length > 0}>
                      <select
                        value={guestId() ?? ""}
                        onChange={(e) => pickGuest(e.currentTarget.value)}
                        class="w-full px-3 py-1.5 rounded-lg border border-rim bg-elevated text-sm text-txt"
                      >
                        <option value="">{t("share.use_plain_link")}</option>
                        <For each={guests()}>
                          {(g) => <option value={g.id}>{g.name}</option>}
                        </For>
                        <Show when={otherGuests().length > 0}>
                          <optgroup label={t("share.guest_add_group") as string}>
                            <For each={otherGuests()}>
                              {(g) => <option value={g.id}>{g.name}</option>}
                            </For>
                          </optgroup>
                        </Show>
                      </select>
                    </Show>
                    <Show when={activeGuest()}>
                      <p class="text-[0.6875rem] text-amber-600 dark:text-amber-500">
                        {t("share.guest_access_warning")}
                      </p>
                    </Show>

                    <Show when={lockview()?.can_create_guest}>
                      <Show
                        when={newGuestOpen()}
                        fallback={
                          <button
                            type="button"
                            onClick={() => setNewGuestOpen(true)}
                            class="text-xs text-accent hover:underline"
                          >
                            + {t("share.guest_new")}
                          </button>
                        }
                      >
                        <form class="space-y-2 pt-1" onSubmit={createGuest}>
                          <div class="space-y-1">
                            <label class="block text-xs text-muted">{t("share.guest_new_name")}</label>
                            <input
                              type="text"
                              required
                              value={newGuestName()}
                              onInput={(e) => setNewGuestName(e.currentTarget.value)}
                              class="w-full px-3 py-1.5 rounded-lg border border-rim bg-elevated text-sm text-txt"
                            />
                          </div>
                          <div class="space-y-1">
                            <label class="block text-xs text-muted">{t("share.guest_new_expires")}</label>
                            <input
                              type="date"
                              value={newGuestExpires()}
                              onInput={(e) => setNewGuestExpires(e.currentTarget.value)}
                              class="w-full px-3 py-1.5 rounded-lg border border-rim bg-elevated text-sm text-txt"
                            />
                          </div>
                          <p class="text-[0.6875rem] text-muted">{t("share.guest_new_hint")}</p>
                          <div class="flex gap-2">
                            <button
                              type="submit"
                              disabled={creating()}
                              class="px-3 py-1.5 rounded-lg bg-accent text-white text-sm disabled:opacity-60"
                            >
                              {creating() ? t("share.guest_new_creating") : t("share.guest_new_create")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewGuestOpen(false)}
                              class="px-3 py-1.5 rounded-lg border border-rim text-sm text-muted"
                            >
                              {t("share.close")}
                            </button>
                          </div>
                        </form>
                      </Show>
                    </Show>
                  </div>
                </Show>

                {/* BBCode embed snippets */}
                <For each={props.target.embed}>
                  {(row) => (
                    <CopyRow
                      label={t(row.labelKey) as string}
                      value={row.code}
                      copyLabel={t("share.copy") as string}
                      onCopy={copy}
                      mono
                    />
                  )}
                </For>
              </div>
            </div>
          </div>
        </Portal>
      </Show>

      <Show when={composerOpen()}>
        <PostComposer
          open={true}
          onClose={() => setComposerOpen(false)}
          profileUid={auth()?.uid ?? 0}
          initialBody={props.target.postBody}
        />
      </Show>
    </>
  );
};

export default ShareModal;

function CopyRow(props: {
  label: string;
  value: string;
  copyLabel: string;
  onCopy: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <div class="space-y-1">
      <label class="block text-xs text-muted">{props.label}</label>
      <div class="flex gap-2">
        <input
          type="text"
          readonly
          value={props.value}
          onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
          class={`flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-rim bg-elevated text-xs text-txt ${props.mono ? "font-mono" : ""}`}
        />
        <button
          type="button"
          onClick={() => props.onCopy(props.value)}
          title={props.copyLabel}
          class="px-3 py-1.5 rounded-lg border border-rim text-xs text-muted hover:bg-elevated transition-colors shrink-0"
        >
          <MdOutlineContent_copy size={15} />
        </button>
      </div>
    </div>
  );
}
