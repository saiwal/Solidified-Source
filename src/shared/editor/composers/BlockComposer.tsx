import { Show, onCleanup, createSignal, createEffect, lazy } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { getCsrfToken } from "@utsukta/spa-core/lib/csrf";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { createComposerStore } from "../store/createComposerStore";
import { DraftsList } from "../components/DraftsList";
import RichEditor from "../core/RichEditor";
import { CAPABILITIES } from "../types/editor.types";
import { useEncrypt } from "../useEncrypt";
import EncryptToggle from "../components/EncryptToggle";
// Lazy: these panels are only ever shown once a user opts into encrypting or
// decrypting, so their code (and the libsodium-wrappers dependency it
// eventually triggers via postCrypto.ts) shouldn't sit in every composer's
// initial bundle.
const EncryptPanel = lazy(() => import("../components/EncryptPanel"));
const DecryptPanel = lazy(() => import("../components/DecryptPanel"));
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import AttachmentBar from "../attachments/AttachmentBar";
import { createAttachmentStore } from "../attachments/useAttachments";
import { bbcodeToInsert, patchInsertedAlt } from "../attachments/insertHelpers";
import AclPicker, { type AclMode } from "../components/AclPicker";
import { useAclState, splitAclEntries } from "../components/useAclState";
import { useMentionEmojiWiring } from "../mention/useMentionEmojiWiring";
import MentionEmojiPopups from "../mention/MentionEmojiPopups";
import SlugField from "../components/SlugField";
import { PrimarySubmitButton, SecondaryButton, IconButton } from "../components/buttons";
import { slugify } from "../lib/slugify";
import { underlineFieldClass } from "../lib/fieldStyles";
import { countWords } from "../lib/textStats";

interface Props {
  nick: string;
  initial?: {
    uuid: string;
    mid: string;
    title: string;
    name: string;
    body: string;
    mimetype: string;
    item_private?: number;
    public_policy?: string;
    allow_cid?: string[];
    allow_gid?: string[];
    deny_cid?: string[];
    deny_gid?: string[];
  };
  onSaved?: () => void;
  onCancel?: () => void;
}

// Trimmed sibling of WebpageComposer.tsx — same building blocks (RichEditor,
// AclPicker, AttachmentBar, drafts, encrypt), but a block has no summary and
// no per-page layout-template assignment (it's not a routable page), and its
// "slug" field is really the Comanche-style name a [block]name[/block] /
// the HTML Block widget preset dropdown looks it up by — hence the relabeled
// SlugField and the /spa/blocks endpoint instead of /spa/webpages.
export default function BlockComposer(props: Props) {
  const { t } = useI18n();
  const caps = CAPABILITIES.block;
  const isEditing = () => !!props.initial?.uuid;
  const scope = props.initial?.uuid
    ? `block:edit:${props.initial.uuid}`
    : "block:new";

  const attach = createAttachmentStore(props.nick, scope);
  const [draftsOpen, setDraftsOpen] = createSignal(false);

  // ── ACL state — initialize from existing block data when editing ─────────────
  const initialAclMode = (): AclMode => {
    const p = props.initial;
    if (!p) return "public";
    if (p.public_policy === "contacts") return "connections";
    if ((p.allow_cid?.length ?? 0) > 0 || (p.allow_gid?.length ?? 0) > 0) return "custom";
    return "public";
  };
  const initialAllowEntries = (): Set<string> => {
    const p = props.initial;
    if (!p) return new Set();
    return new Set([
      ...(p.allow_cid ?? []).map((h) => `c:${h}`),
      ...(p.allow_gid ?? []).map((g) => `g:${g}`),
    ]);
  };
  const initialDenyEntries = (): Set<string> => {
    const p = props.initial;
    if (!p) return new Set();
    return new Set([
      ...(p.deny_cid ?? []).map((h) => `c:${h}`),
      ...(p.deny_gid ?? []).map((g) => `g:${g}`),
    ]);
  };

  const acl = useAclState({
    mode: initialAclMode(),
    allowEntries: initialAllowEntries(),
    denyEntries: initialDenyEntries(),
  });

  function aclJson(): Record<string, unknown> {
    const mode = acl.mode();
    if (mode === "public")      return { scope: "public" };
    if (mode === "connections") return { scope: "connections" };
    if (mode === "me")          return { scope: "private" };

    const { contactIds: allow_cid, groupIds: allow_gid } = splitAclEntries(acl.allowEntries());
    const { contactIds: deny_cid, groupIds: deny_gid } = splitAclEntries(acl.denyEntries());
    return { scope: "custom", allow_cid, allow_gid, deny_cid, deny_gid };
  }

  function withFileAttachments(body: string): string {
    const tags = attach.attachments()
      .filter((a) => a.status === "ready" && !a.isImage && (a.hash || a.resourceId))
      .map((a) => `[attachment]${a.hash ?? a.resourceId},0[/attachment]`)
      .join("\n");
    return tags ? `${body}\n${tags}` : body;
  }

  const store = createComposerStore(async (body, meta) => {
    if (isEditing()) {
      const csrf = await getCsrfToken();
      const res = await fetch("/spa/blocks", {
        method:      "POST",
        headers:     { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action:   "update",
          nick:     props.nick,
          uuid:     props.initial!.uuid,
          title:    meta.title    ?? "",
          body:     withFileAttachments(body),
          mimetype: meta.mimetype ?? "text/bbcode",
          name:     meta.slug     ?? "",
          ...aclJson(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? err?.error ?? "Save failed");
      }
    } else {
      const csrf = await getCsrfToken();
      const res = await fetch("/spa/blocks", {
        method: "POST",
        headers: { "X-CSRF-Token": csrf, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action:   "create",
          nick:     props.nick,
          title:    meta.title    ?? "",
          body:     withFileAttachments(body),
          mimetype: meta.mimetype ?? "text/bbcode",
          name:     meta.slug     ?? "",
          ...aclJson(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Save failed");
      }
    }

    void queryClient.invalidateQueries({ queryKey: ["block"] });

    attach.clear();
    props.onSaved?.();
  }, scope, { initialBody: props.initial?.body });

  const wordCount = () => countWords(store.body());
  const charCount = () => store.body().length;

  const enc = useEncrypt(() => store.body(), store.setBody);

  if (props.initial) {
    store.setTitle(props.initial.title);
    store.setSlug(props.initial.name);
    if (props.initial.mimetype) store.setMimetype(props.initial.mimetype as any);
  }

  // ── Draft extra — ACL, which createComposerStore doesn't know about ──────
  function buildDraftExtra(): Record<string, unknown> {
    const mode = acl.mode();
    const extra: Record<string, unknown> = { aclMode: mode };
    if (mode === "custom") {
      extra.allow = [...acl.allowEntries()];
      extra.deny = [...acl.denyEntries()];
    }
    return extra;
  }

  createEffect(() => {
    const extra = store.restoredExtra();
    if (!extra) return;
    if (typeof extra.aclMode === "string") acl.setMode(extra.aclMode as AclMode);
    if (Array.isArray(extra.allow)) acl.setAllowEntries(new Set(extra.allow as string[]));
    if (Array.isArray(extra.deny)) acl.setDenyEntries(new Set(extra.deny as string[]));
  });

  // ── Mention + emoji autocomplete ─────────────────────────────────────────────
  const wiring = useMentionEmojiWiring({
    body: store.body,
    setBody: store.setBody,
    mimetype: store.mimetype,
  });

  window.addEventListener("keydown", wiring.onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", wiring.onKeyDown));

  const onTitleChange = (v: string) => {
    store.setTitle(v);
    if (!isEditing() && !store.slug()) {
      store.setSlug(slugify(v));
    }
  };

  return (
    <div class="max-w-3xl mx-auto space-y-4 py-6 px-4">
      {/* Title */}
      <input
        type="text"
        placeholder={t("webpages.block_title_placeholder")}
        value={store.title()}
        onInput={(e) => onTitleChange(e.currentTarget.value)}
        class={`w-full px-0 py-2 text-lg font-bold text-txt placeholder:text-muted ${underlineFieldClass}`}
      />

      {/* Name — the identifier the HTML Block widget's preset dropdown looks it up by */}
      <Show when={caps.slug}>
        <SlugField
          value={store.slug}
          onInput={store.setSlug}
          title={store.title}
          label={t("webpages.block_name_label") as string}
          placeholder={t("webpages.block_name_placeholder") as string}
        />
      </Show>

      <div class="flex items-center justify-end gap-2">
        <span class="text-xs text-muted">{t("editor.words_count", { count: wordCount() })}</span>
        <span class="text-xs text-muted">·</span>
        <span class="text-xs text-muted">{t("editor.chars_count", { count: charCount() })}</span>
      </div>

      {/* Editor */}
      <div ref={wiring.wrapperRef}>
        <RichEditor
          onImageAlt={(src, alt) => attach.setAltByUrl(src, alt)}
          body={store.body()}
          onInput={store.setBody}
          capabilities={caps}
          tab={store.tab()}
          onTabChange={store.setTab}
          mimetype={store.mimetype()}
          placeholder={t("editor.start_writing")}
          minHeight="400px"
        />
        <AttachmentBar
          store={attach}
          nick={props.nick}
          accept="files"
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

      <MentionEmojiPopups wiring={wiring} />

      {/* Encrypt panel */}
      <Show when={enc.open()}>
        <EncryptPanel enc={enc} />
      </Show>

      {/* Decrypt-to-edit panel */}
      <Show when={enc.decryptOpen()}>
        <DecryptPanel enc={enc} body={store.body} />
      </Show>

      {/* Drafts panel */}
      <Show when={draftsOpen()}>
        <DraftsList
          drafts={store.savedDrafts()}
          onLoad={(d) => { store.loadSavedDraft(d); setDraftsOpen(false); }}
          onDelete={(id) => void store.deleteSavedDraft(id)}
          onClose={() => setDraftsOpen(false)}
        />
      </Show>

      {/* Options row: ACL + encrypt */}
      <div class="flex flex-wrap items-center gap-3 border-t border-rim pt-4">
        <Show when={caps.aclPicker}>
          <AclPicker
            mode={acl.mode()}
            onModeChange={acl.setMode}
            allowEntries={acl.allowEntries()}
            denyEntries={acl.denyEntries()}
            onToggle={acl.toggleEntry}
            onClear={acl.clearEntries}
          />
        </Show>

        <Show when={isFeatureEnabled("content_encrypt")}>
          <EncryptToggle enc={enc} body={store.body} />
        </Show>
      </div>

      {/* Action row: discard/save-draft/drafts on the left, clear/submit on the right */}
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex gap-2 items-center">
          <SecondaryButton
            onClick={() => {
              store.reset();
              attach.clear();
              acl.reset();
              enc.reset();
              props.onCancel?.();
            }}
          >
            {isEditing() ? t("editor.cancel_btn") : t("editor.discard")}
          </SecondaryButton>
          <Show when={store.body().trim()}>
            <SecondaryButton onClick={() => void store.saveAsDraft(buildDraftExtra())}>
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3v5H9V3m0 14h6" />
              </svg>
              {t("editor.save_draft")}
            </SecondaryButton>
          </Show>
          <Show when={store.savedDrafts().length > 0}>
            <button
              type="button"
              onClick={() => setDraftsOpen((o) => !o)}
              class={
                "px-2.5 py-1.5 rounded-lg border text-xs transition-colors " +
                (draftsOpen()
                  ? "border-rim bg-elevated text-txt"
                  : "border-rim text-muted hover:text-txt hover:bg-elevated")
              }
            >
              {t("editor.drafts_btn", { count: store.savedDrafts().length })}
            </button>
          </Show>
        </div>

        <div class="flex items-center gap-2 ml-auto">
          <IconButton
            title={t("editor.clear_composer")}
            variant="danger"
            onClick={() => {
              store.reset();
              attach.clear();
              acl.reset();
              enc.reset();
            }}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </IconButton>
          <PrimarySubmitButton
            disabled={store.submitting() || attach.uploading() || !store.body().trim() || !store.title().trim()}
            onClick={() => void store.submit()}
          >
            {store.submitting()
              ? t("editor.saving")
              : isEditing()
                ? t("editor.save_changes")
                : t("editor.publish_btn")}
          </PrimarySubmitButton>
        </div>
      </div>
    </div>
  );
}
