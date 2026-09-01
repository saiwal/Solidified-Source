/**
 * PostComposer.tsx
 * Modal post composer for the Hubzilla SolidJS frontend.
 *
 * - Portal-mounted (always renders at document.body)
 * - Uses shared createComposerStore + RichEditor + EditorToolbar infrastructure
 * - ACL picker with per-connection allow/deny (contacts + groups)
 * - Expiry picker
 * - Draft auto-save to IndexedDB (via createComposerStore)
 * - Ctrl+Enter to post, Escape to close
 * - Submits to POST /spa/item (SPA Item handler) with JSON body + CSRF token
 */

import {
  createSignal,
  createEffect,
  onCleanup,
  Show,
  lazy,
  type Component,
} from "solid-js";
import { DraftsList } from "../components/DraftsList";
import { Portal } from "solid-js/web";
import { MdOutlineTimer, MdOutlineSchedule } from "solid-icons/md";
import { createComposerStore } from "../store/createComposerStore";
import RichEditor from "../core/RichEditor";
import ComposerModal from "../components/ComposerModal";
import ComposerShell from "../components/ComposerShell";
import { CAPABILITIES, type MimeType } from "../types/editor.types";
import type { EditPayload } from "@utsukta/spa-core/lib/item-api";
import AclPicker from "../components/AclPicker";
import DateTimePicker from "../components/DateTimePicker";
import type { AclMode } from "../components/AclPicker";
import type { AclEntry } from "@/modules/network/api";
import { useAclState } from "../components/useAclState";
import { useCategoryTags } from "../components/useCategoryTags";
import CategoryTagsField from "../components/CategoryTagsField";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchCategories } from "@/shared/stream/components/CategoryWidget";
import { usePollState } from "../poll/usePollState";
import PollToggleButton from "../poll/PollToggleButton";
import PollPanel from "../poll/PollPanel";
import { useMentionEmojiWiring } from "../mention/useMentionEmojiWiring";
import MentionEmojiPopups from "../mention/MentionEmojiPopups";
import SummaryField from "../components/SummaryField";
import { PrimarySubmitButton, SecondaryButton, ToggleButton, IconButton } from "../components/buttons";
import AttachmentBar from "../attachments/AttachmentBar";
import { createAttachmentStore } from "../attachments/useAttachments";
import { currentNick, isFeatureEnabled, isLocalOnlyPostsEnabled } from "@utsukta/spa-core/store/auth-store";
import { bbcodeToInsert, patchInsertedAlt } from "../attachments/insertHelpers";
import type { FileAcl } from "@/modules/files/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { getCsrfToken } from "@utsukta/spa-core/lib/csrf";
import { useEncrypt } from "../useEncrypt";
import EncryptToggle from "../components/EncryptToggle";
// Lazy: these panels are only ever shown once a user opts into encrypting or
// decrypting, so their code (and the libsodium-wrappers dependency it
// eventually triggers via postCrypto.ts) shouldn't sit in every composer's
// initial bundle.
const EncryptPanel = lazy(() => import("../components/EncryptPanel"));
const DecryptPanel = lazy(() => import("../components/DecryptPanel"));
import { underlineFieldClass } from "../lib/fieldStyles";
import { countWords } from "../lib/textStats";
import { canUseWysiwyg } from "@utsukta/spa-core/lib/mimetypes";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { AclMode };

export interface ComposerProps {
  open: boolean;
  onClose: () => void;
  /** Hubzilla channel_id — required by Item::post() for ownership/permissions */
  profileUid: number;
  onPosted?: (itemId: number) => void;
  initialBody?: string;
  initialAclMode?: AclMode;
  initialAllowEntries?: Set<string>;
  /** Entries the caller already knows about (e.g. a DM recipient) so their
   *  allow/deny chip resolves to a name/photo immediately. */
  initialResolvedEntries?: AclEntry[];
  parentId?: number;
  /** Hide the ACL picker and lock scope to "connections" (channel owner's default).
   *  Use when the poster is a visitor — they don't control the wall's privacy. */
  hideAcl?: boolean;
  /** Override the draft/attachment scope key (default "post:new" /
   *  "post:reply:<parentId>"). Pass a distinct key for special flows like
   *  reshares so their autosave never clobbers the regular composer draft. */
  scopeKey?: string;

  // ── Edit mode ─────────────────────────────────────────────────────────────
  // Setting onSubmitEdit turns the composer into an editor for an existing
  // item: it hands the changed fields back instead of POSTing to /spa/item, so
  // the caller keeps ownership of the refresh (see StreamHandlers.onEdit).
  // Only content fields are editable — privacy, expiry, scheduling and polls
  // are properties of the original post and stay as stored, so their controls
  // are hidden rather than shown with values that wouldn't be saved.
  onSubmitEdit?: (fields: EditPayload) => Promise<void>;
  /** Seed values for edit mode — fetch them from /spa/item/:uuid/compose. */
  initialTitle?: string;
  initialSummary?: string;
  initialCategory?: string;
  initialMimetype?: MimeType;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PostComposer: Component<ComposerProps> = (props) => {
  const { t } = useI18n();
  const caps = CAPABILITIES.post;
  const isEdit = () => !!props.onSubmitEdit;

  // Format for a *new* post: markdown when the "Markdown" feature is on. That
  // is the mdpost addon's own toggle (Settings -> Features -> Editor); the SPA
  // deliberately does not add a second one. The flag only reaches the client
  // when that addon is loaded, since /spa/pconfig builds its feature map from
  // get_features() — so the addon gates the feature and its toggle gates the
  // composer.
  //
  // Editing is driven by props.initialMimetype instead, which the compose
  // endpoint sets from the Markdown source it remembered for the item
  // (ContentTypes::recallMarkdown); this is only the fallback for when that
  // seed is missing, where bbcode is the safe assumption since the stored body
  // always is bbcode.
  const postMimetype = (): MimeType =>
    !isEdit() && isFeatureEnabled("markdown") ? "text/markdown" : "text/bbcode";

  // ── Scope (shared by both stores for matching IDB keys) ───────────────────
  const scope =
    props.scopeKey ??
    (props.parentId ? `post:reply:${props.parentId}` : "post:new");

  // ── Attachment store ───────────────────────────────────────────────────────
  const attach = createAttachmentStore(currentNick(), scope);

  // ── ACL state ───────────────────────────────────────────────────────────────
  const acl = useAclState({
    mode: props.hideAcl ? "connections" : (props.initialAclMode ?? "connections"),
    allowEntries: props.initialAllowEntries,
  });
  const [expiry, setExpiry] = createSignal("");
  const [fullscreen, setFullscreen] = createSignal(false);
  const [draftsOpen, setDraftsOpen] = createSignal(false);

  // ── Location / delayed publish / comment lock ─────────────────────────────
  const [locationOpen, setLocationOpen] = createSignal(false);
  const [location, setLocation] = createSignal("");
  const [coord, setCoord] = createSignal("");
  const [locating, setLocating] = createSignal(false);
  const [publishAt, setPublishAt] = createSignal("");
  const [noComment, setNoComment] = createSignal(false);
  const [localOnly, setLocalOnly] = createSignal(false);

  function geotag() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Core stores browser coordinates as "lat lon" (jot_geotag.tpl)
        setCoord(`${pos.coords.latitude} ${pos.coords.longitude}`);
        setLocating(false);
      },
      () => setLocating(false),
    );
  }

  // ── Poll state ─────────────────────────────────────────────────────────────
  const poll = usePollState();

  // ── Sync ACL to attachment store ───────────────────────────────────────────
  createEffect(() => {
    const mode = acl.mode();
    if (mode === "connections") {
      attach.setAcl(null); // leave files at channel defaults
      return;
    }
    const fileAcl: FileAcl = { allow_cid: [], allow_gid: [], deny_cid: [], deny_gid: [] };
    if (mode === "me") {
      fileAcl.scope = "private";
    } else if (mode === "custom") {
      for (const key of acl.allowEntries()) {
        const [type, ...rest] = key.split(":");
        const xid = rest.join(":");
        if (type === "c") fileAcl.allow_cid.push(xid);
        if (type === "g") fileAcl.allow_gid.push(xid);
      }
      for (const key of acl.denyEntries()) {
        const [type, ...rest] = key.split(":");
        const xid = rest.join(":");
        if (type === "c") fileAcl.deny_cid.push(xid);
        if (type === "g") fileAcl.deny_gid.push(xid);
      }
    }
    // mode === "public": all arrays stay empty (public)
    attach.setAcl(fileAcl);
  });

  // ── Composer store ─────────────────────────────────────────────────────────

  const store = createComposerStore(
    async (body, meta) => {
      // ── Append [attachment] BBCode tags for all attached files/photos ────────
      // Item.php strips these tags from the body and stores them in item.attach.
      // Photos use resource_id (= hash in the attach table) as the identifier.
      // inline via [img] when the user clicks Insert; files always auto-append.
      const fileTags = attach.attachments()
        .filter((a) => a.status === "ready" && !a.isImage && (a.hash || a.resourceId))
        .map((a) => `[attachment]${a.hash ?? a.resourceId},0[/attachment]`)
        .join("\n");
      const augmentedBody = fileTags ? `${body}\n${fileTags}` : body;

      // ── Edit: hand the content fields back and let the caller save ────────
      // `category` is authoritative when sent, including empty — that is what
      // makes removing every category possible (see Item.php editItem()). But
      // sending it is only safe when we actually know the item's categories:
      // `initialCategory === undefined` means the caller could not load them
      // (a failed /compose fetch), and sending "" then would silently delete
      // every category on the post. Omitting the key tells the server to leave
      // them alone. Still send whatever the user typed, so an addition made in
      // a degraded editor isn't thrown away.
      const cat = meta.category ?? "";
      const catKnown = props.initialCategory !== undefined;
      if (props.onSubmitEdit) {
        await props.onSubmitEdit({
          body: augmentedBody,
          title: meta.title ?? "",
          summary: meta.summary ?? "",
          ...(catKnown || cat ? { category: cat } : {}),
          mimetype: meta.mimetype ?? "text/bbcode",
        });
        toast.success(t("editor.post_updated"));
        attach.clear();
        props.onClose();
        return;
      }

      const csrf = await getCsrfToken();

      // ── Build ACL scope ──
      const mode = acl.mode();
      const payload: Record<string, unknown> = {
        body: augmentedBody,
        mimetype: meta.mimetype ?? "text/bbcode",
        profile_uid: props.profileUid,
      };
      if (meta.title) payload.title = meta.title;
      if (meta.summary) payload.summary = meta.summary;
      if (meta.category) payload.category = meta.category;
      if (expiry()) payload.expire = expiry();
      if (location().trim()) payload.location = location().trim();
      if (coord()) payload.coord = coord();
      if (publishAt()) {
        payload.created = publishAt();
        payload.delayed = 1;
      }
      if (noComment()) payload.nocomment = 1;
      if (localOnly()) payload.local_only = 1;

      if (mode === "public") {
        payload.scope = "public";
      } else if (mode === "connections") {
        payload.scope = "contacts";
      } else if (mode === "me") {
        payload.scope = "private";
      } else {
        // Custom — require at least one allow entry
        if (acl.allowEntries().size === 0) {
          throw new Error("Select at least one connection or group to allow.");
        }
        payload.scope = "custom";
        const contactAllow: string[] = [];
        const groupAllow: string[] = [];
        const contactDeny: string[] = [];
        const groupDeny: string[] = [];
        for (const key of acl.allowEntries()) {
          const [type, ...rest] = key.split(":");
          const xid = rest.join(":");
          if (type === "c") contactAllow.push(xid);
          if (type === "g") groupAllow.push(xid);
        }
        for (const key of acl.denyEntries()) {
          const [type, ...rest] = key.split(":");
          const xid = rest.join(":");
          if (type === "c") contactDeny.push(xid);
          if (type === "g") groupDeny.push(xid);
        }
        payload.contact_allow = contactAllow;
        payload.group_allow = groupAllow;
        payload.contact_deny = contactDeny;
        payload.group_deny = groupDeny;
      }

      // ── Poll ──
      const pollPayload = poll.toFormPayload();
      if (pollPayload) {
        payload.poll_answers = pollPayload.answers;
        payload.poll_expire_value = pollPayload.expireValue;
        payload.poll_expire_unit = pollPayload.expireUnit;
      }

      const res = await fetch("/spa/item", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = (await res.json().catch(() => ({}))) as {
        data?: { post?: { iid?: number } };
      };
      if (!json.data?.post) {
        throw new Error("Server reported failure. Check Hubzilla logs.");
      }

      toast.success(publishAt() ? t("editor.post_scheduled") : t("editor.post_published"));
      props.onPosted?.(json.data.post.iid ?? 0);
      attach.clear();
      props.onClose();
    },
    scope,
    {
      initialBody: props.initialBody,
      initialTitle: props.initialTitle,
      initialSummary: props.initialSummary,
      initialCategory: props.initialCategory,
      initialMimetype: props.initialMimetype ?? postMimetype(),
    },
  );

  const wordCount = () => countWords(store.body());
  const charCount = () => store.body().length;

  // ── Draft extra — the type-specific fields createComposerStore doesn't
  // know about (ACL, expiry, location, delayed publish, no-comment, poll) ──
  function buildDraftExtra(): Record<string, unknown> {
    const mode = acl.mode();
    const extra: Record<string, unknown> = {
      aclMode: mode,
      expiry: expiry(),
      location: location(),
      coord: coord(),
      publishAt: publishAt(),
      noComment: noComment(),
      localOnly: localOnly(),
    };
    if (mode === "custom") {
      extra.allow = [...acl.allowEntries()];
      extra.deny = [...acl.denyEntries()];
    }
    if (poll.enabled()) {
      extra.poll = { answers: poll.answers(), expireValue: poll.expireValue(), expireUnit: poll.expireUnit() };
    }
    return extra;
  }

  createEffect(() => {
    const extra = store.restoredExtra();
    if (!extra) return;
    if (typeof extra.aclMode === "string") acl.setMode(extra.aclMode as AclMode);
    if (Array.isArray(extra.allow)) acl.setAllowEntries(new Set(extra.allow as string[]));
    if (Array.isArray(extra.deny)) acl.setDenyEntries(new Set(extra.deny as string[]));
    if (typeof extra.expiry === "string") setExpiry(extra.expiry);
    if (typeof extra.location === "string") setLocation(extra.location);
    if (typeof extra.coord === "string") setCoord(extra.coord);
    if (typeof extra.publishAt === "string") setPublishAt(extra.publishAt);
    if (typeof extra.noComment === "boolean") setNoComment(extra.noComment);
    if (typeof extra.localOnly === "boolean") setLocalOnly(extra.localOnly);
    const p = extra.poll as { answers: string[]; expireValue: string; expireUnit: string } | undefined;
    if (p) {
      poll.setEnabled(true);
      p.answers.forEach((a, i) => {
        while (poll.answers().length <= i) poll.addAnswer();
        poll.updateAnswer(i, a);
      });
      poll.setExpireValue(p.expireValue);
      poll.setExpireUnit(p.expireUnit);
    }
  });

  // ── Encrypt ─────────────────────────────────────────────────────────────────
  const enc = useEncrypt(() => store.body(), store.setBody);

  // ── Category tags ──────────────────────────────────────────────────────────
  const [existingCategories] = createQueryResource(
    "composer-categories",
    () => ({ channelNick: currentNick(), type: "posts" as const }),
    fetchCategories,
  );
  const categoryTags = useCategoryTags(
    store.category,
    store.setCategory,
    () => (existingCategories() ?? []).map((c) => c.name),
  );

  // ── Reset ──────────────────────────────────────────────────────────────────
  function resetAll() {
    store.reset();
    attach.clear();
    acl.reset();
    setExpiry("");
    setLocationOpen(false);
    setLocation("");
    setCoord("");
    setPublishAt("");
    setNoComment(false);
    setLocalOnly(false);
    poll.reset();
    categoryTags.setPendingCategory("");
    enc.reset();
  }

  // ── Mention + emoji autocomplete ──────────────────────────────────────────
  const wiring = useMentionEmojiWiring({
    body: store.body,
    setBody: store.setBody,
    mimetype: store.mimetype,
    tags: { channelNick: () => currentNick(), type: () => "posts" },
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Show when={props.open}>
      <ComposerModal
        title={
          isEdit()
            ? t("editor.edit_post")
            : props.parentId
              ? t("editor.reply_header")
              : t("editor.new_post")
        }
        ariaLabel={t("editor.composer_label")}
        onClose={props.onClose}
        fullscreen={fullscreen()}
        helpTarget="shared/post-composer"
        manageEscape={false}
        headerExtra={
          <IconButton
            title={fullscreen() ? t("editor.fullscreen_exit") : t("editor.fullscreen_enter")}
            onClick={() => setFullscreen((f) => !f)}
          >
            <Show
              when={fullscreen()}
              fallback={
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              }
            >
              <svg
                class="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </Show>
          </IconButton>
        }
      >
        {/* Single flex-col root for all body content — mirrors ArticleComposer's
            structure exactly (one flex-1 min-h-0 wrapper containing the
            shrink-0/flex-1/shrink-0 groups), rather than passing them as
            separate top-level children of ComposerModal's body. */}
        <ComposerShell
          class="p-4"
          meta={
            <>
              <Show when={caps.title}>
                <input
                  type="text"
                  placeholder={t("editor.title_placeholder")}
                  value={store.title()}
                  onInput={(e) => store.setTitle(e.currentTarget.value)}
                  class={`w-full px-0 py-2 text-lg font-bold text-txt placeholder:text-muted ${underlineFieldClass}`}
                />
              </Show>

              <Show when={caps.summary && !props.parentId}>
                <SummaryField
                  value={store.summary}
                  onInput={store.setSummary}
                  placeholder={t("editor.post_summary_placeholder")}
                  class={`w-full px-0 py-1.5 text-sm text-txt placeholder:text-muted resize-none ${underlineFieldClass}`}
                />
              </Show>

              <Show when={caps.category && !props.parentId}>
                <CategoryTagsField
                  tags={categoryTags.categoryTags}
                  pending={categoryTags.pendingCategory}
                  onPendingInput={categoryTags.setPendingCategory}
                  onKeyDown={categoryTags.onCategoryKeyDown}
                  onRemove={categoryTags.removeCategoryTag}
                  onBlur={() => {
                    if (categoryTags.pendingCategory().trim()) {
                      categoryTags.addCategoryTag(categoryTags.pendingCategory());
                    }
                  }}
                  suggestions={categoryTags.suggestions}
                  activeSuggestion={categoryTags.activeSuggestion}
                  onSelectSuggestion={categoryTags.addCategoryTag}
                  placeholder={t("editor.category_placeholder")}
                  showLabel
                  hideLabel
                />
              </Show>

              <div class="flex items-center justify-end gap-2">
                <span class="text-xs text-muted">{t("editor.words_count", { count: wordCount() })}</span>
                <span class="text-xs text-muted">·</span>
                <span class="text-xs text-muted">{t("editor.chars_count", { count: charCount() })}</span>
              </div>
            </>
          }
          editor={
          <div ref={wiring.wrapperRef} class="flex flex-col flex-1 min-h-0">
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
              placeholder={props.parentId ? t("editor.write_reply_placeholder") : t("editor.write_placeholder")}
              minHeight="150px"
              fill
            />
            {/* Also shown while editing: editItem() extracts the appended
                [attachment] tags and merges them onto the item's existing
                attach column, same as createPost(). Detaching an existing file
                still isn't possible — the edit seed only carries the body.
                ponytail: add-only attachments on edit; seed the bar from
                item.attach if removing files matters. */}
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
              canWysiwyg={canUseWysiwyg(store.mimetype(), caps.markdownWysiwyg)}
            />
          </div>

          }
          panels={
            <>
              {/* ── Drafts panel ── */}
              <Show when={draftsOpen()}>
                <DraftsList
                  drafts={store.savedDrafts()}
                  onLoad={(d) => { store.loadSavedDraft(d); setDraftsOpen(false); }}
                  onDelete={(id) => void store.deleteSavedDraft(id)}
                  onClose={() => setDraftsOpen(false)}
                />
              </Show>

              {/* ── Editor area — fills the remaining modal height; the surface
                   inside RichEditor scrolls internally past long text while the
                   bottom-docked toolbar stays put. ── */}
              {/* min-h-[360px] (not min-h-0): a real floor covering RichEditor's own
                  300px floor plus AttachmentBar's row, so this can't be squeezed
                  smaller than its children need — see RichEditor.tsx's wrapper
                  comment for why min-h-0/auto both fail here. */}
              {/* ── Location panel ── */}
              <Show when={locationOpen()}>
                <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-rim bg-elevated/40 shrink-0">
                  <input
                    type="text"
                    value={location()}
                    placeholder={t("editor.location_placeholder")}
                    onInput={(e) => setLocation(e.currentTarget.value)}
                    class="flex-1 min-w-40 bg-transparent border border-rim rounded px-2.5 py-1 text-sm
                           text-txt placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
                  />
                  <Show
                    when={!coord()}
                    fallback={
                      <button
                        type="button"
                        onClick={() => setCoord("")}
                        title={t("editor.location_clear_coord")}
                        class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border bg-accent/10 text-accent border-accent/30 hover:opacity-80 transition-opacity"
                      >
                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        {coord().split(" ").map((c) => Number(c).toFixed(3)).join(", ")}
                      </button>
                    }
                  >
                    <button
                      type="button"
                      onClick={geotag}
                      disabled={locating()}
                      title={t("editor.location_use_browser")}
                      class="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border border-rim text-muted
                             hover:text-txt hover:bg-elevated transition-colors disabled:opacity-40"
                    >
                      <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="3" stroke-width="2" />
                        <path stroke-linecap="round" stroke-width="2" d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                      </svg>
                      {locating() ? t("editor.location_locating") : t("editor.location_use_browser")}
                    </button>
                  </Show>
                </div>
              </Show>

              {/* ── Poll panel ── */}
              <Show when={caps.poll && poll.enabled()}>
                <PollPanel poll={poll} />
              </Show>

              {/* ── Encrypt panel ── */}
              <Show when={enc.open()}>
                <EncryptPanel enc={enc} />
              </Show>

              {/* ── Decrypt-to-edit panel ── */}
              <Show when={enc.decryptOpen()}>
                <DecryptPanel enc={enc} body={store.body} />
              </Show>
            </>
          }
          options={
            <>
              {/* ACL Picker — hidden for visitors posting to another channel's
                  wall (replaced by a note), and entirely absent when editing,
                  where privacy isn't among the editable fields. */}
              <Show when={!isEdit()}>
                <Show
                  when={!props.hideAcl}
                  fallback={
                    <span class="text-xs text-muted px-1">{t("editor.posting_to_wall")}</span>
                  }
                >
                  <AclPicker
                    dataTour="post.composer.acl"
                    mode={acl.mode()}
                    onModeChange={acl.setMode}
                    allowEntries={acl.allowEntries()}
                    denyEntries={acl.denyEntries()}
                    onToggle={acl.toggleEntry}
                    onClear={acl.clearEntries}
                    seedEntries={props.initialResolvedEntries}
                  />
                </Show>
              </Show>

              {/* Expiry — gated behind Settings → Features → Content Expiration */}
              <Show when={isFeatureEnabled("content_expire") && !props.parentId && !isEdit()}>
                <DateTimePicker
                  value={expiry()}
                  onChange={setExpiry}
                  min={() => new Date()}
                  icon={<MdOutlineTimer size={14} />}
                  title={t("editor.expire_at")}
                  placeholder={t("editor.expire_at")}
                />
              </Show>

              {/* Location toggle */}
              <ToggleButton
                active={locationOpen() || !!location().trim() || !!coord()}
                onClick={() => setLocationOpen((o) => !o)}
                title={t("editor.location_toggle")}
              >
                <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <circle cx="12" cy="11" r="3" stroke-width="2" />
                </svg>
              </ToggleButton>

              {/* Delayed publish — gated behind Settings → Features → Delayed Posting */}
              <Show when={isFeatureEnabled("delayed_posting") && !props.parentId && !isEdit()}>
                <DateTimePicker
                  value={publishAt()}
                  onChange={setPublishAt}
                  min={() => new Date()}
                  icon={<MdOutlineSchedule size={14} />}
                  title={t("editor.publish_at")}
                  placeholder={t("editor.publish_at")}
                />
              </Show>

              {/* Disable comments — gated behind Settings → Features → Disable Comments */}
              <Show when={isFeatureEnabled("disable_comments") && !props.parentId && !isEdit()}>
                <ToggleButton
                  active={noComment()}
                  onClick={() => setNoComment((v) => !v)}
                  title={t("editor.nocomment_toggle")}
                >
                  <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M8 12h8m-4-9a9 9 0 100 18 9 9 0 000-18z" />
                  </svg>
                </ToggleButton>
              </Show>

              {/* Local-only (undelivered) post — gated behind Settings → Privacy
                  opt-in; hidden for wall-to-wall visitor posts since delivery
                  gates on the poster, not the wall owner (same reasoning as
                  the hidden ACL picker above). */}
              <Show when={isLocalOnlyPostsEnabled() && !props.hideAcl && !props.parentId && !isEdit()}>
                <ToggleButton
                  active={localOnly()}
                  onClick={() => setLocalOnly((v) => !v)}
                  title={t("editor.local_only_toggle")}
                >
                  <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  </svg>
                </ToggleButton>
              </Show>

              {/* Poll toggle */}
              <Show when={caps.poll && !props.parentId && !isEdit()}>
                <PollToggleButton
                  active={poll.enabled()}
                  onToggle={() => poll.setEnabled((p) => !p)}
                />
              </Show>

              {/* Encrypt toggle — gated behind Settings → Features → Content Encryption */}
              <Show when={isFeatureEnabled("content_encrypt") && !props.parentId}>
                <EncryptToggle enc={enc} body={store.body} />
              </Show>
            </>
          }
          actions={
            <>
              <div class="flex items-center gap-2">
                <SecondaryButton onClick={props.onClose}>
                  {t("editor.discard")}
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
                    title={t("editor.saved_drafts")}
                    onClick={() => setDraftsOpen((o) => !o)}
                    class={
                      "px-2 py-1 rounded-md text-xs transition-colors " +
                      (draftsOpen()
                        ? "bg-overlay text-txt"
                        : "text-muted hover:text-txt hover:bg-overlay")
                    }
                  >
                    {t("editor.drafts_btn", { count: store.savedDrafts().length })}
                  </button>
                </Show>
              </div>

              <div class="flex items-center gap-3 ml-auto shrink-0">
                <IconButton title={t("editor.clear_composer")} onClick={resetAll} variant="danger">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </IconButton>
                <PrimarySubmitButton
                  disabled={store.submitting() || attach.uploading()}
                  onClick={() => void store.submit()}
                >
                  {store.submitting()
                    ? t(isEdit() ? "editor.saving" : "editor.posting")
                    : t(isEdit() ? "editor.save_changes" : "editor.post_btn")}
                </PrimarySubmitButton>
              </div>
            </>
          }
        />
      </ComposerModal>

      <Portal mount={document.body}>
        <MentionEmojiPopups wiring={wiring} />
      </Portal>
    </Show>
  );
};

export default PostComposer;
