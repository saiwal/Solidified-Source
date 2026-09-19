/**
 * DMComposer.tsx
 * Modal direct-message composer — a slimmed-down PostComposer that swaps
 * the ACL picker for an always-visible "To:" recipient field (RecipientField).
 *
 * DMs are implicit on the backend: POST /spa/item with scope:"custom",
 * contact_allow:[...], and no group_allow is auto-classified item_private=2
 * by Item.php — this already supports multiple recipients, so no backend
 * changes were needed. Groups are intentionally not selectable here, since
 * adding group_allow would break that auto-classification.
 *
 * Bcc is purely a client-side fan-out: each Bcc recipient gets its own POST
 * with contact_allow = [that one], so nobody can see the others. There is no
 * shared thread between the copies — that is what makes them blind.
 */

import { createSignal, createEffect, on, onCleanup, useContext, Show, For, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { createComposerStore } from "../store/createComposerStore";
import RichEditor from "../core/RichEditor";
import ComposerModal from "../components/ComposerModal";
import { ComposerFrameContext } from "../store/composer-host";
import ComposerShell from "../components/ComposerShell";
import { underlineFieldClass } from "../lib/fieldStyles";
import { CAPABILITIES } from "../types/editor.types";
import { fetchConnections, type AclEntry } from "@/modules/network/api";
import { entryKey } from "../components/AclPicker";
import RecipientField from "../components/RecipientField";
import { useMentionEmojiWiring } from "../mention/useMentionEmojiWiring";
import MentionEmojiPopups from "../mention/MentionEmojiPopups";
import ComposerActionBar from "../components/ComposerActionBar";
import AttachmentBar from "../attachments/AttachmentBar";
import { createAttachmentStore } from "../attachments/useAttachments";
import { useAttachmentActions } from "../attachments/useAttachmentActions";
import EditorStats from "../components/EditorStats";
import { countWords } from "../lib/textStats";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import { bbcodeToInsert, patchInsertedAlt, appendInsert } from "../attachments/insertHelpers";
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { toast } from "@utsukta/spa-core/store/toast";
import { MdOutlineSchedule } from "solid-icons/md";
import DateTimePicker from "../components/DateTimePicker";
import { useI18n } from "@utsukta/spa-core/i18n";
import { apiError } from "@utsukta/spa-core/lib/fetch";
import { getCsrfToken } from "@utsukta/spa-core/lib/csrf";
import { useEncrypt } from "../useEncrypt";
import EncryptToggle from "../components/EncryptToggle";
// Lazy: these panels are only ever shown once a user opts into encrypting or
// decrypting, so their code (and the libsodium-wrappers dependency it
// eventually triggers via postCrypto.ts) shouldn't sit in every composer's
// initial bundle.

export interface DMComposerProps {
  open: boolean;
  onClose: () => void;
  /** Hubzilla channel_id of the sender (the local viewer's own channel). */
  profileUid: number;
  onSent?: (itemId: number) => void;
  /** Pre-seeded recipient(s) — e.g. the one contact known from a "Send DM" button. */
  initialRecipients?: AclEntry[];
  /** Override the draft/attachment scope key (default "dm:new"). */
  scopeKey?: string;
}

const DMComposer: Component<DMComposerProps> = (props) => {
  const { t } = useI18n();
  const caps = CAPABILITIES.dm;

  const scope = props.scopeKey ?? "dm:new";
  const attach = createAttachmentStore(currentNick(), scope);
  // Delayed delivery. /spa/item stores a future `created` with item_delayed = 1
  // regardless of scope, so a scheduled DM needs nothing on the server.
  const [publishAt, setPublishAt] = createSignal("");
  // Owned here so the editor toolbar and the attachment bar drive the same
  // upload/browse/camera flows (the buttons live in the toolbar now).
  const attachActions = useAttachmentActions(() => attach, currentNick, () => "both");

  const [recipients, setRecipients] = createSignal<AclEntry[]>(props.initialRecipients ?? []);
  const [bcc, setBcc] = createSignal<AclEntry[]>([]);
  const [showBcc, setShowBcc] = createSignal(false);
  const allRecipients = () => [...recipients(), ...bcc()];

  // Contacts who've granted the local channel the `post_mail` permission —
  // messages to anyone outside this set are silently dropped by the
  // recipient's hub before any delivery is even attempted. RecipientField's
  // search already filters to this set (ACL type "m"), but recipients seeded
  // directly via `initialRecipients` (Send DM from a profile/connection)
  // bypass that filter, so we check them here too.
  const [permitted, setPermitted] = createSignal<AclEntry[] | null>(null);
  function refreshPermitted() {
    void fetchConnections({ type: "m", count: 500 })
      .then((list) => setPermitted(list))
      .catch(() => {});
  }
  refreshPermitted();
  // Re-check on every add/remove — a recipient seeded via `initialRecipients`
  // (Send DM from a profile/connection) can otherwise be judged against a
  // permission snapshot taken before that fetch has resolved.
  createEffect(on(allRecipients, () => refreshPermitted(), { defer: true }));

  // One identity can own several xchan rows (a channel seen over both zot6 and
  // ActivityPub), and /acl?type=m returns only the one the abook uses. A seeded
  // recipient carries whichever hash its source resolved, so fall back to
  // matching on address — otherwise a perfectly permitted contact is reported
  // as blocked, and the ACL would be built from a hash the abook doesn't hold.
  const permittedFor = (r: AclEntry): AclEntry | null => {
    const list = permitted();
    if (!list) return null;
    const addr = (r.link || r.nick || "").toLowerCase();
    return list.find((c) =>
      c.xid === r.xid || (!!addr && (c.link || "").toLowerCase() === addr)
    ) ?? null;
  };

  const unpermittedRecipients = () => {
    if (!permitted()) return [];
    return allRecipients().filter((r) => !permittedFor(r));
  };

  // Same add/remove for both rows; a person already in one row can't be added
  // to the other, since two copies of one message is never what Bcc means.
  const addTo = (set: (fn: (p: AclEntry[]) => AclEntry[]) => void) => (entry: AclEntry) => {
    const key = entryKey(entry);
    if (allRecipients().some((r) => entryKey(r) === key)) return;
    set((prev) => [...prev, entry]);
  };
  const removeFrom = (set: (fn: (p: AclEntry[]) => AclEntry[]) => void) => (entry: AclEntry) => {
    const key = entryKey(entry);
    set((prev) => prev.filter((r) => entryKey(r) !== key));
  };

  const store = createComposerStore(async (body, meta) => {
    if (allRecipients().length === 0) {
      throw new Error(t("editor.dm_recipient_required"));
    }
    const blocked = unpermittedRecipients();
    if (blocked.length > 0) {
      throw new Error(
        t("editor.dm_recipient_not_permitted", { name: blocked.map((r) => r.name).join(", ") }),
      );
    }

    const fileTags = attach.attachments()
      .filter((a) => a.status === "ready" && !a.isImage && (a.hash || a.resourceId))
      .map((a) => `[attachment]${a.hash ?? a.resourceId},0[/attachment]`)
      .join("\n");
    const augmentedBody = fileTags ? `${body}\n${fileTags}` : body;

    const csrf = await getCsrfToken();
    const send = async (contactAllow: string[]): Promise<number> => {
      const res = await fetch("/spa/item", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          body: augmentedBody,
          title: store.title().trim(),
          mimetype: meta.mimetype ?? "text/bbcode",
          profile_uid: props.profileUid,
          scope: "custom",
          contact_allow: contactAllow,
          group_allow: [] as string[],
          contact_deny: [] as string[],
          group_deny: [] as string[],
          created: publishAt() || undefined,
        }),
      });

      if (!res.ok) throw await apiError(res);
      const json = (await res.json().catch(() => ({}))) as {
        data?: { post?: { iid?: number } };
      };
      if (!json.data?.post) {
        throw new Error("Server reported failure. Check Hubzilla logs.");
      }
      return json.data.post.iid ?? 0;
    };

    const xidOf = (r: AclEntry) => permittedFor(r)?.xid ?? r.xid;

    let iid = 0;
    if (recipients().length) {
      iid = await send(recipients().map(xidOf));
      // Sent — drop them so a failed Bcc below can be retried without
      // sending the visible copy twice.
      setRecipients([]);
    }

    const failed: AclEntry[] = [];
    for (const r of bcc()) {
      try {
        const id = await send([xidOf(r)]);
        if (!iid) iid = id;
      } catch {
        failed.push(r);
      }
    }
    setBcc(failed);
    if (failed.length) {
      throw new Error(t("editor.dm_bcc_failed", { names: failed.map((r) => r.name).join(", ") }));
    }

    // A delayed DM is stored with item_delayed = 1, so it appears nowhere until
    // the cron publishes it — say so, or sending looks like it did nothing.
    if (publishAt()) toast.success(t("editor.dm_scheduled"));
    props.onSent?.(iid);
    attach.clear();
    props.onClose();
  }, scope, {
    // Autosaved every 5s of quiet — the manual "Save as draft" button is gone.
    // Read lazily, so it can reference buildDraftExtra declared below.
    autosaveExtra: () => buildDraftExtra(),
    // Same "Markdown" feature as PostComposer/CommentComposer (the mdpost
    // addon's toggle); a DM goes through the same POST and the server converts
    // it to bbcode on save. Missing here, a DM was always text/bbcode, so
    // ==highlight==, **bold** and the rest were stored literally.
    initialMimetype: isFeatureEnabled("markdown") ? "text/markdown" : "text/bbcode",
  });

  // Recipients are the one part of a DM draft the composer store knows
  // nothing about, so they ride in the draft's `extra` bag — whole entries,
  // not just xids, so the restored chips still have a name and avatar.
  const buildDraftExtra = () => ({ to: recipients(), bcc: bcc(), publishAt: publishAt() });

  createEffect(() => {
    const extra = store.restoredExtra();
    if (!extra) return;
    if (Array.isArray(extra.to)) setRecipients(extra.to as AclEntry[]);
    if (Array.isArray(extra.bcc)) {
      setBcc(extra.bcc as AclEntry[]);
      if ((extra.bcc as AclEntry[]).length) setShowBcc(true);
    }
    if (typeof extra.publishAt === "string") setPublishAt(extra.publishAt);
  });


  const enc = useEncrypt(() => store.body(), store.setBody);

  // ── Mention + emoji autocomplete ──────────────────────────────────────────
  const wiring = useMentionEmojiWiring({
    body: store.body,
    setBody: store.setBody,
    mimetype: store.mimetype,
  });

  // Escape minimizes a hosted composer (recoverable from the dock) and closes
  // a locally-mounted one, matching ComposerModal.dismiss.
  const frame = useContext(ComposerFrameContext);

  function onKey(e: KeyboardEvent) {
    if (wiring.onKeyDown(e)) return;
    if (e.key === "Escape") {
      if (frame) frame.setMode("min");
      else props.onClose();
      return;
    }
    if (e.ctrlKey && e.key === "Enter") {
      void store.submit();
    }
  }

  createEffect(() => {
    // Gated on the frame mode too: a minimized composer is still mounted, so
    // without this every pill in the dock would keep a live document listener —
    // one Escape would minimize them all and Ctrl+Enter would post from a
    // composer nobody can see.
    if (props.open && frame?.mode() !== "min") document.addEventListener("keydown", onKey);
    else document.removeEventListener("keydown", onKey);
  });
  onCleanup(() => document.removeEventListener("keydown", onKey));

  return (
    <Show when={props.open}>
      <ComposerModal
        title={t("editor.dm_new_message")}
        onClose={props.onClose}
        helpTarget="shared/dm-composer"
        manageEscape={false}
      >
        <ComposerShell
          class="p-3"
          meta={
            <>
              {/* ── To: field ── */}
              <div>
                <RecipientField
                  entries={recipients}
                  onAdd={addTo(setRecipients)}
                  onRemove={removeFrom(setRecipients)}
                />
                <Show
                  when={showBcc() || bcc().length}
                  fallback={
                    <button
                      type="button"
                      onClick={() => setShowBcc(true)}
                      class="mt-1.5 text-xs text-muted hover:text-txt transition-colors"
                    >
                      {t("editor.bcc_add")}
                    </button>
                  }
                >
                  <div class="mt-1.5">
                    <RecipientField
                      label={t("editor.bcc_label")}
                      entries={bcc}
                      onAdd={addTo(setBcc)}
                      onRemove={removeFrom(setBcc)}
                    />
                  </div>
                </Show>
                <Show when={unpermittedRecipients().length > 0}>
                  <ul class="mt-1.5 space-y-0.5">
                    <For each={unpermittedRecipients()}>
                      {(r) => (
                        <li class="text-xs text-red-500">
                          {t("editor.dm_recipient_not_permitted", { name: r.name })}
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>

              {/* ── Subject ── */}
              <div>
                <input
                  type="text"
                  placeholder={t("editor.dm_subject_placeholder")}
                  value={store.title()}
                  onInput={(e) => store.setTitle(e.currentTarget.value)}
                  class={`w-full px-0 py-1.5 text-sm font-bold text-txt placeholder:text-muted ${underlineFieldClass}`}
                />
              </div>

              <EditorStats
                words={() => countWords(store.body())}
                chars={() => store.body().length}
                tab={store.tab()}
                onToggleTab={() => store.setTab(store.tab() === "wysiwyg" ? "source" : "wysiwyg")}
              />

              {/* ── Editor area — fills the remaining modal height; the surface
                   inside RichEditor scrolls internally past long text while the
                   bottom-docked toolbar stays put. ── */}
              {/* min-h-[360px] (not min-h-0): a real floor covering RichEditor's own
                  300px floor plus AttachmentBar's row — see RichEditor.tsx's
                  wrapper comment for why min-h-0/auto both fail here. */}
            </>
          }
          editor={
            <div ref={wiring.wrapperRef} class="flex flex-col flex-1 min-h-0">
              <RichEditor
                attach={attachActions}
                onImageAlt={(src, alt) => attach.setAltByUrl(src, alt)}
                body={store.body()}
                onInput={store.setBody}
                capabilities={caps}
                tab={store.tab()}
                onTabChange={store.setTab}
                mimetype={store.mimetype()}
                onCtrlEnter={() => { if (!wiring.mention.open()) void store.submit(); }}
                onPasteFiles={(files) => attach.addUploads(files)}
                placeholder={t("editor.write_placeholder")}
                minHeight="150px"
                fill
              />
              <AttachmentBar
                actions={attachActions}
                store={attach}
                nick={currentNick()}
                accept="both"
                onInsert={(bbcode) => {
                  store.setBody(appendInsert(store.body(), bbcodeToInsert(bbcode, store.mimetype())));
                }}
                onAltChange={(att) => {
                  store.setBody(patchInsertedAlt(store.body(), att, store.mimetype()));
                }}
              />
            </div>

          }
          panels={
            <>


            </>
          }
          actions={
            <ComposerActionBar
              menu={
                <>
                  {/* Delayed delivery — gated behind Settings → Features →
                      Delayed Posting, same as a scheduled post. */}
                  <Show when={isFeatureEnabled("delayed_posting")}>
                    <DateTimePicker
                      value={publishAt()}
                      onChange={setPublishAt}
                      min={() => new Date()}
                      icon={<MdOutlineSchedule size={14} />}
                      title={t("editor.publish_at")}
                      placeholder={t("editor.publish_at")}
                    />
                  </Show>
                  <Show when={isFeatureEnabled("content_encrypt")}>
                    <EncryptToggle enc={enc} body={store.body} />
                  </Show>
                </>
              }
              onCancel={props.onClose}
              onClear={() => {
                store.reset();
                attach.clear();
                setRecipients([]);
                setBcc([]);
                setPublishAt("");
                enc.reset();
              }}
              submitDisabled={
                store.submitting() ||
                attach.uploading() ||
                allRecipients().length === 0 ||
                unpermittedRecipients().length > 0 ||
                !store.body().trim()
              }
              onSubmit={() => void store.submit()}
              submitLabel={store.submitting() ? t("editor.sending_dm") : t("editor.send_btn")}
            />
          }
        />
      </ComposerModal>

      <Portal mount={document.body}>
        <MentionEmojiPopups wiring={wiring} />
      </Portal>
    </Show>
  );
};

export default DMComposer;
