import { createSignal, createEffect, createMemo, Show, onCleanup, lazy } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchCategories } from "@/shared/stream/components/CategoryWidget";
import { fetchSeriesList } from "@/modules/articles/api";
import { DraftsList } from "../components/DraftsList";
import { createComposerStore } from "../store/createComposerStore";
import { useI18n } from "@utsukta/spa-core/i18n";
import RichEditor from "../core/RichEditor";
import { CAPABILITIES } from "../types/editor.types";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import AclPicker from "../components/AclPicker";
import { useEncrypt } from "../useEncrypt";
import EncryptToggle from "../components/EncryptToggle";
// Lazy: these panels are only ever shown once a user opts into encrypting or
// decrypting, so their code (and the libsodium-wrappers dependency it
// eventually triggers via postCrypto.ts) shouldn't sit in every composer's
// initial bundle.
const EncryptPanel = lazy(() => import("../components/EncryptPanel"));
const DecryptPanel = lazy(() => import("../components/DecryptPanel"));
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { useMentionEmojiWiring } from "../mention/useMentionEmojiWiring";
import MentionEmojiPopups from "../mention/MentionEmojiPopups";
import AttachmentBar from "../attachments/AttachmentBar";
import { createAttachmentStore } from "../attachments/useAttachments";
import { bbcodeToInsert, patchInsertedAlt } from "../attachments/insertHelpers";
import { useAclState } from "../components/useAclState";
import type { AclMode } from "../components/AclPicker";
import { useCategoryTags } from "../components/useCategoryTags";
import CategoryTagsField from "../components/CategoryTagsField";
import SlugField from "../components/SlugField";
import SummaryField from "../components/SummaryField";
import LanguageField from "../components/LanguageField";
import SeriesField from "../components/SeriesField";
import { PrimarySubmitButton, SecondaryButton, IconButton } from "../components/buttons";
import { underlineFieldClass } from "../lib/fieldStyles";
import { countWords } from "../lib/textStats";

interface Props {
  profileUid: number;
  nick: string;
  /** Pass existing article data to edit rather than create */
  initial?: {
    uuid: string;
    iid?: number;
    title: string;
    summary: string;
    slug: string;
    category: string;
    body: string;
    public_policy?: string;
    allow_cid?: string[];
    allow_gid?: string[];
    deny_cid?: string[];
    deny_gid?: string[];
    lang?: string;
    series?: { name: string; order: number | null } | null;
  };
  /**
   * Opens the composer in "add translation" mode: a blank article linked to
   * an existing one's translation group. `excludeLangs` keeps the language
   * dropdown from offering a language the group already has.
   */
  translationOf?: { uuid: string; excludeLangs: string[] };
  onSaved?: () => void;
  /** Close the composer without saving — wired to the left-side Discard button. */
  onCancel?: () => void;
}

export default function ArticleComposer(props: Props) {
  const { t } = useI18n();
  const caps = CAPABILITIES.article;
  const [wordCount, setWordCount] = createSignal(0);
  const [draftsOpen, setDraftsOpen] = createSignal(false);
  const isEditing = () => !!props.initial?.uuid;

  // ── Scope (shared by both stores for matching IDB keys) ─────────────────────
  const scope = props.initial?.uuid
    ? `article:edit:${props.initial.uuid}`
    : "article:new";

  // ── Attachment store ─────────────────────────────────────────────────────────
  const attach = createAttachmentStore(props.nick, scope);

  // ── ACL state — initialize from the existing article's ACL when editing ─────
  const initialAclMode = (): AclMode => {
    const p = props.initial;
    if (!p) return "connections";
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

  // ── Language + series — local to this composer (articles-only fields,
  // not part of the generic createComposerStore shared with other post types) ──
  const [lang, setLang] = createSignal(props.initial?.lang ?? "");
  const [series, setSeries] = createSignal(props.initial?.series?.name ?? "");
  const [seriesOrder, setSeriesOrder] =
    createSignal<number | null>(props.initial?.series?.order ?? null);

  // ── Series suggestions — existing series names for this channel ─────────────
  const [existingSeries] = createQueryResource("composer-series", () => props.nick, fetchSeriesList);
  const [seriesActiveSuggestion, setSeriesActiveSuggestion] = createSignal(-1);
  const seriesSuggestions = createMemo<string[]>(() => {
    const q = series().trim().toLowerCase();
    const names = (existingSeries() ?? []).map((s) => s.name);
    if (!q) return names.slice(0, 8);
    return names
      .filter((n) => n.toLowerCase().startsWith(q) && n.toLowerCase() !== q)
      .slice(0, 8);
  });
  function onSeriesNameInput(v: string) {
    setSeries(v);
    setSeriesActiveSuggestion(-1);
  }
  function selectSeriesSuggestion(name: string) {
    setSeries(name);
    setSeriesActiveSuggestion(-1);
  }
  function onSeriesKeyDown(e: KeyboardEvent) {
    const items = seriesSuggestions();
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSeriesActiveSuggestion((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSeriesActiveSuggestion((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      const idx = seriesActiveSuggestion();
      if (idx >= 0 && items[idx]) {
        e.preventDefault();
        selectSeriesSuggestion(items[idx]);
      }
    } else if (e.key === "Escape") {
      setSeriesActiveSuggestion(-1);
    }
  }

  // ── Composer store ────────────────────────────────────────────────────────────
  // Append [attachment]hash,0[/attachment] BBCode for non-image files.
  // Item.php scans the body for these tags and builds native Hubzilla attachments.
  function withFileAttachments(body: string): string {
    const tags = attach.attachments()
      .filter((a) => a.status === "ready" && !a.isImage && (a.hash || a.resourceId))
      .map((a) => `[attachment]${a.hash ?? a.resourceId},0[/attachment]`)
      .join("\n");
    return tags ? `${body}\n${tags}` : body;
  }

  // Raw contact_allow/group_allow/contact_deny/group_deny arrays + public_policy,
  // matching what Articles.php::resolveAcl() expects.
  function aclPayload(): Record<string, unknown> {
    const mode = acl.mode();
    if (mode === "public") {
      return { contact_allow: [], group_allow: [], contact_deny: [], group_deny: [], public_policy: "" };
    }
    if (mode === "connections") {
      return { contact_allow: [], group_allow: [], contact_deny: [], group_deny: [], public_policy: "contacts" };
    }
    if (mode === "me") {
      return { scope: "private" };
    }
    if (acl.allowEntries().size === 0)
      throw new Error("Select at least one connection or group to allow.");
    const cAllow: string[] = [];
    const gAllow: string[] = [];
    const cDeny: string[]  = [];
    const gDeny: string[]  = [];
    for (const key of acl.allowEntries()) {
      const [type, ...rest] = key.split(":");
      if (type === "c") cAllow.push(rest.join(":"));
      if (type === "g") gAllow.push(rest.join(":"));
    }
    for (const key of acl.denyEntries()) {
      const [type, ...rest] = key.split(":");
      if (type === "c") cDeny.push(rest.join(":"));
      if (type === "g") gDeny.push(rest.join(":"));
    }
    return { contact_allow: cAllow, group_allow: gAllow, contact_deny: cDeny, group_deny: gDeny, public_policy: "" };
  }

  const store = createComposerStore(async (body, meta) => {
    const res = await apiFetch(`/spa/articles/${props.nick}`, {
      method: "POST",
      body: JSON.stringify({
        post_id:  isEditing() ? props.initial!.iid : undefined,
        body:     withFileAttachments(body),
        title:    meta.title    ?? "",
        summary:  meta.summary  ?? "",
        slug:     meta.slug     ?? "",
        category: meta.category ?? "",
        mimetype: meta.mimetype ?? "text/bbcode",
        lang:     lang(),
        series:   series(),
        series_order: series() ? (seriesOrder() ?? 1) : undefined,
        translation_of: (!isEditing() && props.translationOf) ? props.translationOf.uuid : undefined,
        ...aclPayload(),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message ?? err?.error ?? "Save failed");
    }

    attach.clear();
    props.onSaved?.();
  }, scope);

  const enc = useEncrypt(() => store.body(), store.setBody);

  // ── Category tags ──────────────────────────────────────────────────────────
  const [existingCategories] = createQueryResource(
    "composer-categories",
    () => ({ channelNick: props.nick, type: "articles" as const }),
    fetchCategories,
  );
  const categoryTags = useCategoryTags(
    store.category,
    store.setCategory,
    () => (existingCategories() ?? []).map((c) => c.name),
  );

  // Seed from initial if editing
  if (props.initial) {
    store.setTitle(props.initial.title);
    store.setSummary(props.initial.summary);
    store.setSlug(props.initial.slug);
    store.setCategory(props.initial.category);
    store.setBody(props.initial.body);
  }

  // ── Draft extra — lang, series, and ACL, which createComposerStore
  // doesn't know about ──
  function buildDraftExtra(): Record<string, unknown> {
    const mode = acl.mode();
    const extra: Record<string, unknown> = { aclMode: mode, lang: lang(), series: series(), seriesOrder: seriesOrder() };
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
    if (typeof extra.lang === "string") setLang(extra.lang);
    if (typeof extra.series === "string") setSeries(extra.series);
    if (typeof extra.seriesOrder === "number") setSeriesOrder(extra.seriesOrder);
  });

  // ── Mention + emoji autocomplete ─────────────────────────────────────────────
  const wiring = useMentionEmojiWiring({
    body: store.body,
    setBody: store.setBody,
    mimetype: store.mimetype,
    tags: { channelNick: () => props.nick, type: () => "articles" },
  });

  window.addEventListener("keydown", wiring.onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", wiring.onKeyDown));

  const charCount = () => store.body().length;

  const onBodyChange = (v: string) => {
    store.setBody(v);
    const text = v.replace(/<[^>]*>/g, " ");
    setWordCount(countWords(text));
  };

  // The slug is never derived from the title as you type — it stays empty until
  // the user asks for one via SlugField's ↻ button (or types it by hand).
  const onTitleChange = (v: string) => store.setTitle(v);

  return (
    <div class="flex flex-col flex-1 min-h-0 max-w-3xl mx-auto gap-4 py-6 px-4">
      {/* Meta fields — fixed height, above the editor */}
      <div class="shrink-0 space-y-4">
        {/* Title */}
        <input
          type="text"
          placeholder={t("editor.article_title_placeholder")}
          value={store.title()}
          onInput={(e) => onTitleChange(e.currentTarget.value)}
          class={`w-full px-0 py-2 text-lg font-bold text-txt placeholder:text-muted ${underlineFieldClass}`}
        />

        {/* Summary */}
        <Show when={caps.summary}>
          <SummaryField
            value={store.summary}
            onInput={store.setSummary}
            placeholder={t("editor.article_summary_placeholder")}
            class={`w-full px-0 py-1.5 text-sm text-txt placeholder:text-muted resize-none ${underlineFieldClass}`}
          />
        </Show>

        {/* Slug — its own line */}
        <Show when={caps.slug}>
          <SlugField value={store.slug} onInput={store.setSlug} title={store.title} hideLabel />
        </Show>

        {/* Language — required */}
        <LanguageField
          value={lang}
          onInput={setLang}
          exclude={props.translationOf?.excludeLangs}
          hideLabel
        />

        {/* Series — optional */}
        <SeriesField
          name={series}
          onNameInput={onSeriesNameInput}
          order={seriesOrder}
          onOrderInput={setSeriesOrder}
          onKeyDown={onSeriesKeyDown}
          suggestions={seriesSuggestions}
          activeSuggestion={seriesActiveSuggestion}
          onSelectSuggestion={selectSeriesSuggestion}
          hideLabel
        />

        {/* Category — its own line */}
        <Show when={caps.category}>
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
            placeholder={t("editor.category_field_placeholder")}
            showLabel
            hideLabel
          />
        </Show>

        <div class="flex items-center justify-end gap-2">
          <span class="text-xs text-muted">{t("editor.words_count", { count: wordCount() })}</span>
          <span class="text-xs text-muted">·</span>
          <span class="text-xs text-muted">{t("editor.chars_count", { count: charCount() })}</span>
        </div>
      </div>

      {/* Editor — fills the remaining space; the surface inside RichEditor
           scrolls internally past long text while the bottom-docked toolbar
           stays put. */}
      {/* min-h-[360px] (not min-h-0): a real floor covering RichEditor's own
          300px floor plus AttachmentBar's row — see RichEditor.tsx's
          wrapper comment for why min-h-0/auto both fail here. */}
      <div ref={wiring.wrapperRef} class="flex-1 min-h-[360px] flex flex-col">
        <RichEditor
          onImageAlt={(src, alt) => attach.setAltByUrl(src, alt)}
          body={store.body()}
          onInput={onBodyChange}
          capabilities={caps}
          tab={store.tab()}
          onTabChange={store.setTab}
          mimetype={store.mimetype()}
          placeholder={t("editor.start_writing")}
          minHeight="150px"
          fill
        />
        <AttachmentBar
          store={attach}
          nick={props.nick}
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

      {/* Trailing panels + action rows — fixed height, below the editor */}
      <div class="shrink-0 space-y-4">
        {/* Encrypt panel */}
        <Show when={enc.open()}>
          <EncryptPanel enc={enc} />
        </Show>

        {/* Decrypt-to-edit panel */}
        <Show when={enc.decryptOpen()}>
          <DecryptPanel enc={enc} body={store.body} />
        </Show>

        <MentionEmojiPopups wiring={wiring} />

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
            <SecondaryButton onClick={() => props.onCancel?.()}>
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
                categoryTags.setPendingCategory("");
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
                !store.body().trim() ||
                !store.title().trim() ||
                !lang()
              }
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
    </div>
  );
}
