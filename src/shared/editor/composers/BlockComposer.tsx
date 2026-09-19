import { Show, onCleanup, createEffect } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { getCsrfToken } from "@utsukta/spa-core/lib/csrf";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { createComposerStore } from "../store/createComposerStore";
import RichEditor from "../core/RichEditor";
import { CAPABILITIES } from "../types/editor.types";
import { useEncrypt } from "../useEncrypt";
import EncryptToggle from "../components/EncryptToggle";
// Lazy: these panels are only ever shown once a user opts into encrypting or
// decrypting, so their code (and the libsodium-wrappers dependency it
// eventually triggers via postCrypto.ts) shouldn't sit in every composer's
// initial bundle.
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import AttachmentBar from "../attachments/AttachmentBar";
import ComposerShell from "../components/ComposerShell";
import { zenMode } from "@utsukta/spa-core/store/zen";
import EditorStats from "../components/EditorStats";
import { createAttachmentStore } from "../attachments/useAttachments";
import { useAttachmentActions } from "../attachments/useAttachmentActions";
import { bbcodeToInsert, patchInsertedAlt, appendInsert } from "../attachments/insertHelpers";
import AclPicker, { aclModeFrom, aclEntryKeys, type AclMode } from "../components/AclPicker";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { useAclState, splitAclEntries } from "../components/useAclState";
import { useMentionEmojiWiring } from "../mention/useMentionEmojiWiring";
import MentionEmojiPopups from "../mention/MentionEmojiPopups";
import SlugField from "../components/SlugField";
import FormatSelect from "../components/FormatSelect";
import { isAuthorable } from "@utsukta/spa-core/lib/mimetypes";
import { createWysiwygAvailable } from "../core/wysiwygSafe";
import { pageMimetype } from "@utsukta/spa-core/store/auth-store";
import ComposerActionBar from "../components/ComposerActionBar";
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
  // Owned here so the editor toolbar and the attachment bar drive the same
  // upload/browse/camera flows (the buttons live in the toolbar now).
  const attachActions = useAttachmentActions(() => attach, () => props.nick, () => "both");

  // ── ACL state — initialize from existing block data when editing ─────────────
  // "Only me" is stored as allow_cid = [the owner's own hash], so recovering it
  // needs the viewer's hash; without it the mode falls back to "custom".
  const selfHash = useNavViewer();
  const initialAclMode = (): AclMode =>
    props.initial ? aclModeFrom(props.initial, selfHash()?.hash) : "public";
  // Entries are only meaningful for "custom" — seeding them for "me" would
  // leave the owner's own hash sitting in the picker as an unresolvable chip.
  const initialEntries = () =>
    aclEntryKeys(props.initial ?? {}, initialAclMode());

  const acl = useAclState({
    mode: initialAclMode(),
    allowEntries: initialEntries().allow,
    denyEntries: initialEntries().deny,
    // /spa/nav may not have answered yet; re-derive once the viewer's hash
    // lands, unless the user has already touched the picker.
    resync: () => selfHash()?.hash
      ? { mode: initialAclMode(), allowEntries: initialEntries().allow, denyEntries: initialEntries().deny }
      : undefined,
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
  }, scope, {
    initialBody: props.initial?.body,
    // Autosaved every 5s of quiet — the manual "Save as draft" button is gone.
    autosaveExtra: () => buildDraftExtra(),
  });

  const wordCount = () => countWords(store.body());
  const charCount = () => store.body().length;

  const enc = useEncrypt(() => store.body(), store.setBody);

  const defaultPageMime = pageMimetype();
  if (props.initial) {
    store.setTitle(props.initial.title);
    store.setSlug(props.initial.name);
    if (props.initial.mimetype) store.setMimetype(props.initial.mimetype as any);
  } else if (isAuthorable(defaultPageMime)) {
    // New page: seed the channel's default format, the same pconfig core
    // reads for its own composer (system/page_mimetype — Blocks.php:84).
    store.setMimetype(defaultPageMime);
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

  // The slug is never derived from the title as you type — it stays empty until
  // the user asks for one via SlugField's ↻ button (or types it by hand).
  const onTitleChange = (v: string) => store.setTitle(v);

  // This body is stored in the format it was typed in, so the Write tab is
  // offered only while the round trip leaves it byte-identical (wysiwygSafe.ts).
  const wysiwygAvailable = createWysiwygAvailable(store.body, store.mimetype, caps.nonBbcodeWysiwyg);

  return (
    <ComposerShell
      meta={
        <>
          {/* Title */}
          <input
            type="text"
            placeholder={t("webpages.block_title_placeholder")}
            value={store.title()}
            onInput={(e) => onTitleChange(e.currentTarget.value)}
            class={`w-full px-0 py-1.5 text-sm font-bold text-txt placeholder:text-muted ${underlineFieldClass}`}
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

          {/* Content format — core's mimetype_select() */}
          <Show when={caps.format}>
            <FormatSelect value={store.mimetype} onChange={store.setMimetype} body={store.body} />
          </Show>

          <EditorStats
            words={wordCount}
            chars={charCount}
            tab={store.tab()}
            onToggleTab={() => store.setTab(store.tab() === "wysiwyg" ? "source" : "wysiwyg")}
          />
        </>
      }
      editor={
        <>
          <div ref={wiring.wrapperRef} class="flex flex-col flex-1 min-h-0">
            <RichEditor
            attach={attachActions}
              onImageAlt={(src, alt) => attach.setAltByUrl(src, alt)}
              body={store.body()}
              wysiwygAvailable={wysiwygAvailable()}
              onInput={store.setBody}
              capabilities={caps}
              tab={store.tab()}
              onTabChange={store.setTab}
              mimetype={store.mimetype()}
              placeholder={t("editor.start_writing")}
              minHeight={zenMode() ? "0px" : "60vh"}
              fill={zenMode()}
            />
            <AttachmentBar
            actions={attachActions}
              store={attach}
              nick={props.nick}
              accept="files"
              onInsert={(bbcode) => {
                store.setBody(appendInsert(store.body(), bbcodeToInsert(bbcode, store.mimetype())));
              }}
              onAltChange={(att) => {
                store.setBody(patchInsertedAlt(store.body(), att, store.mimetype()));
              }}
            />
          </div>
        </>
      }
      panels={
        <>
          <MentionEmojiPopups wiring={wiring} />



          {/* Drafts panel */}
        </>
      }
      actions={
        <ComposerActionBar
          leading={
            <>
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
            </>
          }
          menu={
            <>
          <Show when={isFeatureEnabled("content_encrypt")}>
            <EncryptToggle enc={enc} body={store.body} />
          </Show>
            </>
          }
          onCancel={() => {
            store.reset();
            attach.clear();
            acl.reset();
            enc.reset();
            props.onCancel?.();
          }}
          cancelLabel={isEditing() ? t("editor.cancel_btn") : t("editor.discard")}
          onClear={() => {
            store.reset();
            attach.clear();
            acl.reset();
            enc.reset();
          }}
          submitDisabled={
            store.submitting() || attach.uploading() || !store.body().trim() || !store.title().trim()
          }
          onSubmit={() => void store.submit()}
          submitLabel={
            store.submitting()
              ? t("editor.saving")
              : isEditing()
                ? t("editor.save_changes")
                : t("editor.publish_btn")
          }
        />
      }
    />
  );
}
