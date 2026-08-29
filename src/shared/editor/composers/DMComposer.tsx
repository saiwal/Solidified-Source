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
 */

import { createSignal, createEffect, on, onCleanup, Show, For, lazy, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { createComposerStore } from "../store/createComposerStore";
import RichEditor from "../core/RichEditor";
import ComposerModal from "../components/ComposerModal";
import { CAPABILITIES } from "../types/editor.types";
import { fetchConnections, type AclEntry } from "@/modules/network/api";
import { entryKey } from "../components/AclPicker";
import RecipientField from "../components/RecipientField";
import { useMentionEmojiWiring } from "../mention/useMentionEmojiWiring";
import MentionEmojiPopups from "../mention/MentionEmojiPopups";
import { PrimarySubmitButton, SecondaryButton, IconButton } from "../components/buttons";
import AttachmentBar from "../attachments/AttachmentBar";
import { createAttachmentStore } from "../attachments/useAttachments";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import { bbcodeToInsert, patchInsertedAlt } from "../attachments/insertHelpers";
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { apiError } from "@utsukta/spa-core/lib/fetch";
import { getCsrfToken } from "@utsukta/spa-core/lib/csrf";
import { useEncrypt } from "../useEncrypt";
import EncryptToggle from "../components/EncryptToggle";
// Lazy: these panels are only ever shown once a user opts into encrypting or
// decrypting, so their code (and the libsodium-wrappers dependency it
// eventually triggers via postCrypto.ts) shouldn't sit in every composer's
// initial bundle.
const EncryptPanel = lazy(() => import("../components/EncryptPanel"));
const DecryptPanel = lazy(() => import("../components/DecryptPanel"));

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

  const [recipients, setRecipients] = createSignal<AclEntry[]>(props.initialRecipients ?? []);

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
  createEffect(on(recipients, () => refreshPermitted(), { defer: true }));

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
    return recipients().filter((r) => !permittedFor(r));
  };

  function addRecipient(entry: AclEntry) {
    const key = entryKey(entry);
    if (recipients().some((r) => entryKey(r) === key)) return;
    setRecipients((prev) => [...prev, entry]);
  }

  function removeRecipient(entry: AclEntry) {
    const key = entryKey(entry);
    setRecipients((prev) => prev.filter((r) => entryKey(r) !== key));
  }

  const store = createComposerStore(async (body, meta) => {
    if (recipients().length === 0) {
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
    const payload = {
      body: augmentedBody,
      title: store.title().trim(),
      mimetype: meta.mimetype ?? "text/bbcode",
      profile_uid: props.profileUid,
      scope: "custom",
      contact_allow: recipients().map((r) => permittedFor(r)?.xid ?? r.xid),
      group_allow: [] as string[],
      contact_deny: [] as string[],
      group_deny: [] as string[],
    };

    const res = await fetch("/spa/item", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw await apiError(res);
    const json = (await res.json().catch(() => ({}))) as {
      data?: { post?: { iid?: number } };
    };
    if (!json.data?.post) {
      throw new Error("Server reported failure. Check Hubzilla logs.");
    }

    props.onSent?.(json.data.post.iid ?? 0);
    attach.clear();
    props.onClose();
  }, scope);

  const enc = useEncrypt(() => store.body(), store.setBody);

  // ── Mention + emoji autocomplete ──────────────────────────────────────────
  const wiring = useMentionEmojiWiring({
    body: store.body,
    setBody: store.setBody,
    mimetype: store.mimetype,
  });

  function onKey(e: KeyboardEvent) {
    if (wiring.onKeyDown(e)) return;
    if (e.key === "Escape") {
      props.onClose();
      return;
    }
    if (e.ctrlKey && e.key === "Enter") {
      void store.submit();
    }
  }

  createEffect(() => {
    if (props.open) document.addEventListener("keydown", onKey);
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
        footer={
          <>
            {/* Options row: encrypt */}
            <div class="flex flex-wrap items-center gap-2">
                <Show when={isFeatureEnabled("content_encrypt")}>
                  <EncryptToggle enc={enc} body={store.body} />
                </Show>
              </div>

              {/* Action row: discard on the left, clear/send on the right */}
              <div class="flex flex-wrap items-center gap-2">
                <SecondaryButton onClick={props.onClose}>
                  {t("editor.discard")}
                </SecondaryButton>

                <div class="flex items-center gap-2 ml-auto">
                  <IconButton
                    title={t("editor.clear_composer")}
                    variant="danger"
                    onClick={() => {
                      store.reset();
                      attach.clear();
                      setRecipients([]);
                      enc.reset();
                    }}
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </IconButton>
                  <PrimarySubmitButton
                    disabled={
                      store.submitting() ||
                      attach.uploading() ||
                      recipients().length === 0 ||
                      unpermittedRecipients().length > 0 ||
                      !store.body().trim()
                    }
                    onClick={() => void store.submit()}
                  >
                    {store.submitting() ? t("editor.sending_dm") : t("editor.send_btn")}
                  </PrimarySubmitButton>
                </div>
              </div>
          </>
        }
      >
        {/* Single flex-col root for all body content — mirrors ArticleComposer's
            structure exactly (one flex-1 min-h-0 wrapper containing the
            shrink-0/flex-1/shrink-0 groups), rather than passing them as
            separate top-level children of ComposerModal's body. */}
        <div class="flex flex-col flex-1 min-h-0">
        {/* ── To: field ── */}
        <div class="px-4 pt-3 pb-2 border-b border-rim shrink-0">
          <RecipientField
            entries={recipients}
            onAdd={addRecipient}
            onRemove={removeRecipient}
          />
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
        <div class="px-4 pt-3 pb-2 border-b border-rim shrink-0">
          <input
            type="text"
            placeholder={t("editor.dm_subject_placeholder")}
            value={store.title()}
            onInput={(e) => store.setTitle(e.currentTarget.value)}
            class="w-full px-0 py-1.5 text-base font-semibold text-txt placeholder:text-muted bg-transparent border-0 focus:outline-none"
          />
        </div>

        {/* ── Editor area — fills the remaining modal height; the surface
             inside RichEditor scrolls internally past long text while the
             bottom-docked toolbar stays put. ── */}
        {/* min-h-[360px] (not min-h-0): a real floor covering RichEditor's own
            300px floor plus AttachmentBar's row — see RichEditor.tsx's
            wrapper comment for why min-h-0/auto both fail here. */}
        <div ref={wiring.wrapperRef} class="flex flex-col flex-1 min-h-[360px]">
          <RichEditor
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
            store={attach}
            nick={currentNick()}
            accept="both"
            onInsert={(bbcode) => {
              store.setBody(store.body() + "\n" + bbcodeToInsert(bbcode, store.mimetype()));
            }}
            onAltChange={(att) => {
              store.setBody(patchInsertedAlt(store.body(), att, store.mimetype()));
            }}
            tab={store.tab()}
            onToggleTab={() => store.setTab(store.tab() === "wysiwyg" ? "source" : "wysiwyg")}
          />
        </div>

        {/* ── Encrypt panel ── */}
        <Show when={enc.open()}>
          <EncryptPanel enc={enc} />
        </Show>

        {/* ── Decrypt-to-edit panel ── */}
        <Show when={enc.decryptOpen()}>
          <DecryptPanel enc={enc} body={store.body} />
        </Show>
        </div>
      </ComposerModal>

      <Portal mount={document.body}>
        <MentionEmojiPopups wiring={wiring} />
      </Portal>
    </Show>
  );
};

export default DMComposer;
