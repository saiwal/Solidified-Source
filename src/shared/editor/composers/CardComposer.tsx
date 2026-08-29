import { createSignal, createEffect, createMemo, Show, For, onCleanup, lazy } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchCategories } from "@/shared/stream/components/CategoryWidget";
import { fetchDeckList } from "@/modules/cards/api";
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
import DeckField from "../components/DeckField";
import { PrimarySubmitButton, SecondaryButton, IconButton } from "../components/buttons";
import { slugify } from "../lib/slugify";
import { underlineFieldClass } from "../lib/fieldStyles";
import { countWords } from "../lib/textStats";
import { fetchLinkMeta } from "../lib/linkMeta";
import {
  CARD_TEMPLATES, composeTemplate, parseTemplate, sniffTemplate, emptyTemplateFields,
  type CardTemplate, type TemplateFields,
} from "../lib/cardTemplates";

export type { CardTemplate };

interface Props {
  profileUid: number;
  nick: string;
  /** Pass existing card data to edit rather than create */
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
    deck?: { name: string; order: number | null } | null;
    /** Which authoring tab produced the body — reopens on the same one. */
    template?: CardTemplate;
  };
  onSaved?: () => void;
  /** Close the composer without saving — wired to the left-side Discard button. */
  onCancel?: () => void;
}

export default function CardComposer(props: Props) {
  const { t } = useI18n();
  const caps = CAPABILITIES.card;
  const [wordCount, setWordCount] = createSignal(0);
  const [draftsOpen, setDraftsOpen] = createSignal(false);
  const isEditing = () => !!props.initial?.uuid;

  // ── Scope (shared by both stores for matching IDB keys) ─────────────────────
  const scope = props.initial?.uuid
    ? `card:edit:${props.initial.uuid}`
    : "card:new";

  // ── Attachment store ─────────────────────────────────────────────────────────
  const attach = createAttachmentStore(props.nick, scope);

  // ── ACL state — initialize from the existing card's ACL when editing ─────
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

  // ── Template + deck — local to this composer (cards-only fields,
  // not part of the generic createComposerStore shared with other post types) ──
  const [template, setTemplate] = createSignal<CardTemplate>(
    props.initial?.template
      ?? (props.initial?.body ? sniffTemplate(props.initial.body) : null)
      ?? "freeform",
  );

  // Template sub-form fields. Freeform writes store.body directly; the other
  // three collect parts here and assemble on submit (see ../lib/cardTemplates).
  const [fields, setFields] = createSignal<TemplateFields>(emptyTemplateFields());
  const setField = (k: keyof TemplateFields) => (v: string) =>
    setFields((f) => ({ ...f, [k]: v }));

  // Whether a fetched og:image gets prepended to a link body. Off by default —
  // the thumbnail is offered, not imposed.
  const [includeImage, setIncludeImage] = createSignal(false);

  // The body actually submitted: the editor's for freeform, an assembled one
  // otherwise. Kept as a function so the submit path and the disabled-state
  // check can't disagree about what will be saved.
  function composedBody(): string {
    return template() === "freeform"
      ? store.body()
      : composeTemplate(template(), fields(), {
          title: store.title(),
          includeImage: includeImage(),
        });
  }

  // ── Link metadata — fill Title/Summary/Slug from the page at linkUrl ───────
  // Scraping happens server-side (/spa/link-meta wraps core's Linkinfo
  // scraper); CORS makes fetching an arbitrary page from the browser a
  // non-starter anyway.
  const [metaLoading, setMetaLoading] = createSignal(false);
  const [metaError, setMetaError] = createSignal(false);
  // The URL the last successful/attempted fetch was for, so blurring the field
  // repeatedly doesn't refetch the same page.
  const [fetchedUrl, setFetchedUrl] = createSignal("");

  async function loadLinkMeta(force = false) {
    const url = fields().linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) return;
    if (!force && url === fetchedUrl()) return;
    setMetaLoading(true);
    setMetaError(false);
    setFetchedUrl(url);
    const data = await fetchLinkMeta(url);
    setMetaLoading(false);
    if (!data) {
      setMetaError(true);
      setFetchedUrl("");   // let a retry through
      return;
    }
    // Auto-fetch (on blur) only fills what's still empty, so it can never
    // clobber something typed by hand; the explicit button forces an
    // overwrite, since clicking it *is* the request to re-fill.
    if (data.title && (force || !store.title().trim())) {
      store.setTitle(data.title);
      if (force || !store.slug().trim()) store.setSlug(slugify(data.title));
    }
    if (data.text && (force || !store.summary().trim())) store.setSummary(data.text);
    setFields((f) => ({ ...f, linkImage: data.image }));
  }
  const [deck, setDeck] = createSignal(props.initial?.deck?.name ?? "");
  const [deckOrder, setDeckOrder] =
    createSignal<number | null>(props.initial?.deck?.order ?? null);

  // ── Deck suggestions — existing deck names for this channel ─────────────
  const [existingDecks] = createQueryResource("composer-decks", () => props.nick, fetchDeckList);
  const [deckActiveSuggestion, setDeckActiveSuggestion] = createSignal(-1);
  const deckSuggestions = createMemo<string[]>(() => {
    const q = deck().trim().toLowerCase();
    const names = (existingDecks() ?? []).map((s) => s.name);
    if (!q) return names.slice(0, 8);
    return names
      .filter((n) => n.toLowerCase().startsWith(q) && n.toLowerCase() !== q)
      .slice(0, 8);
  });
  function onDeckNameInput(v: string) {
    setDeck(v);
    setDeckActiveSuggestion(-1);
  }
  function selectDeckSuggestion(name: string) {
    setDeck(name);
    setDeckActiveSuggestion(-1);
  }
  function onDeckKeyDown(e: KeyboardEvent) {
    const items = deckSuggestions();
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDeckActiveSuggestion((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDeckActiveSuggestion((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      const idx = deckActiveSuggestion();
      if (idx >= 0 && items[idx]) {
        e.preventDefault();
        selectDeckSuggestion(items[idx]);
      }
    } else if (e.key === "Escape") {
      setDeckActiveSuggestion(-1);
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
  // matching what Cards.php::resolveAcl() expects.
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
    const res = await apiFetch(`/spa/cards/${props.nick}`, {
      method: "POST",
      body: JSON.stringify({
        post_id:  isEditing() ? props.initial!.iid : undefined,
        body:     withFileAttachments(body),
        title:    meta.title    ?? "",
        summary:  meta.summary  ?? "",
        slug:     meta.slug     ?? "",
        category: meta.category ?? "",
        mimetype: meta.mimetype ?? "text/bbcode",
        deck:   deck(),
        deck_order: deck() ? (deckOrder() ?? 1) : undefined,
        template: template(),
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
    () => ({ channelNick: props.nick, type: "cards" as const }),
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
    // The assembled templates submit composedBody(), not store.body() — so
    // without unpacking the stored body back into their sub-forms, reopening a
    // quote/definition/link card for editing would show empty fields and save
    // an empty body over it.
    const parsed = parseTemplate(props.initial.body);
    setFields((f) => ({ ...f, ...parsed }));
    // A stored thumbnail means the box was ticked when this card was saved —
    // without restoring that, re-saving would silently drop the image.
    if (parsed.linkImage) setIncludeImage(true);
    // The URL is already described by the card, so don't auto-fetch over the
    // author's own edits the first time the field is blurred.
    if (parsed.linkUrl) setFetchedUrl(parsed.linkUrl);
  }

  // ── Draft extra — template, deck, and ACL, which createComposerStore
  // doesn't know about ──
  function buildDraftExtra(): Record<string, unknown> {
    const mode = acl.mode();
    const extra: Record<string, unknown> = {
      aclMode: mode, template: template(), deck: deck(), deckOrder: deckOrder(),
      // The assembled templates keep their parts here, not in store.body —
      // without this a quote/link/definition draft reloads with empty inputs.
      fields: fields(), includeImage: includeImage(),
    };
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
    if (typeof extra.template === "string") setTemplate(extra.template as CardTemplate);
    if (typeof extra.deck === "string") setDeck(extra.deck);
    if (typeof extra.deckOrder === "number") setDeckOrder(extra.deckOrder);
    if (extra.fields && typeof extra.fields === "object") {
      setFields((f) => ({ ...f, ...(extra.fields as Partial<TemplateFields>) }));
    }
    if (typeof extra.includeImage === "boolean") setIncludeImage(extra.includeImage);
  });

  // ── Mention + emoji autocomplete ─────────────────────────────────────────────
  const wiring = useMentionEmojiWiring({
    body: store.body,
    setBody: store.setBody,
    mimetype: store.mimetype,
    tags: { channelNick: () => props.nick, type: () => "cards" },
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
    // No mx-auto here, deliberately: every mount point (CardsHeaderWidget's
    // CardModal, CardComposerModal, CardView's edit dialog) puts this in a
    // `flex flex-col` modal body that is already w-full max-w-3xl and already
    // centred. An auto cross-axis margin on a flex item overrides
    // align-self: stretch, so the composer would size to fit-content instead
    // of the row — and since the three assembled templates hide the editor
    // (the one wide child), the quote/definition/link tabs visibly shrank.
    <div class="flex flex-col flex-1 min-h-0 max-w-3xl gap-4 py-6 px-4">
      {/* Meta fields — fixed height, above the editor */}
      <div class="shrink-0 space-y-4">
        {/* Title */}
        <input
          type="text"
          placeholder={t("editor.card_title_placeholder")}
          value={store.title()}
          onInput={(e) => onTitleChange(e.currentTarget.value)}
          class={`w-full px-0 py-2 text-lg font-bold text-txt placeholder:text-muted ${underlineFieldClass}`}
        />

        {/* Summary */}
        <Show when={caps.summary}>
          <SummaryField
            value={store.summary}
            onInput={store.setSummary}
            placeholder={t("editor.card_summary_placeholder")}
            class={`w-full px-0 py-1.5 text-sm text-txt placeholder:text-muted resize-none ${underlineFieldClass}`}
          />
        </Show>

        {/* Slug — its own line */}
        <Show when={caps.slug}>
          <SlugField value={store.slug} onInput={store.setSlug} title={store.title} hideLabel />
        </Show>

        {/* Authoring template — segmented control */}
        <div role="tablist" class="flex items-center gap-1 p-0.5 rounded-lg bg-elevated w-fit">
          <For each={CARD_TEMPLATES}>
            {(tpl) => (
              <button
                type="button"
                role="tab"
                aria-selected={template() === tpl}
                onClick={() => setTemplate(tpl)}
                class={`px-3 py-1 text-xs font-medium rounded-md transition-colors
                  ${template() === tpl
                    ? "bg-surface text-txt shadow-sm"
                    : "text-muted hover:text-txt"}`}
              >
                {t(`cards.template_${tpl}` as "cards.template_freeform")}
              </button>
            )}
          </For>
        </div>

        {/* Deck — optional */}
        <DeckField
          name={deck}
          onNameInput={onDeckNameInput}
          order={deckOrder}
          onOrderInput={setDeckOrder}
          onKeyDown={onDeckKeyDown}
          suggestions={deckSuggestions}
          activeSuggestion={deckActiveSuggestion}
          onSelectSuggestion={selectDeckSuggestion}
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

      {/* Template sub-forms — the three assembled templates collect their
          parts here instead of using the rich editor. */}
      <Show when={template() !== "freeform"}>
        <div class="shrink-0 space-y-3">
          <Show when={template() === "quote"}>
            <textarea
              rows="4"
              placeholder={t("cards.quote_text")}
              value={fields().quoteText}
              onInput={(e) => setField("quoteText")(e.currentTarget.value)}
              class={`w-full px-0 py-1.5 text-sm text-txt placeholder:text-muted resize-none ${underlineFieldClass}`}
            />
            <input
              type="text"
              placeholder={t("cards.quote_attribution")}
              value={fields().quoteAttribution}
              onInput={(e) => setField("quoteAttribution")(e.currentTarget.value)}
              class={`w-full px-0 py-1.5 text-sm text-txt placeholder:text-muted ${underlineFieldClass}`}
            />
          </Show>

          <Show when={template() === "definition"}>
            <input
              type="text"
              placeholder={t("cards.definition_term")}
              value={fields().defTerm}
              onInput={(e) => setField("defTerm")(e.currentTarget.value)}
              class={`w-full px-0 py-1.5 text-sm text-txt placeholder:text-muted ${underlineFieldClass}`}
            />
            <textarea
              rows="4"
              placeholder={t("cards.definition_body")}
              value={fields().defBody}
              onInput={(e) => setField("defBody")(e.currentTarget.value)}
              class={`w-full px-0 py-1.5 text-sm text-txt placeholder:text-muted resize-none ${underlineFieldClass}`}
            />
          </Show>

          <Show when={template() === "link"}>
            {/* URL + fetch. Blur auto-fills the empty fields above; the button
                forces a re-fetch that overwrites them. */}
            <div class="flex items-center gap-2">
              <input
                type="url"
                placeholder={t("cards.link_url")}
                value={fields().linkUrl}
                onInput={(e) => {
                  setField("linkUrl")(e.currentTarget.value);
                  setMetaError(false);
                }}
                onBlur={() => void loadLinkMeta()}
                class={`flex-1 min-w-0 px-0 py-1.5 text-sm text-txt placeholder:text-muted ${underlineFieldClass}`}
              />
              <IconButton
                title={metaLoading() ? t("cards.link_fetching") : t("cards.link_fetch")}
                onClick={() => void loadLinkMeta(true)}
              >
                <svg
                  class="w-4 h-4"
                  classList={{ "animate-spin": metaLoading() }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </IconButton>
            </div>

            <Show when={metaError()}>
              <p class="text-xs text-red-500">{t("cards.link_fetch_failed")}</p>
            </Show>

            {/* Fetched thumbnail — opt in, since not every link wants one. */}
            <Show when={fields().linkImage}>
              <label class="flex items-center gap-2 text-xs text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeImage()}
                  onChange={(e) => setIncludeImage(e.currentTarget.checked)}
                  class="accent-accent"
                />
                <img
                  src={fields().linkImage}
                  alt=""
                  class="w-16 h-10 object-cover rounded border border-rim"
                  onError={() => setFields((f) => ({ ...f, linkImage: "" }))}
                />
                {t("cards.link_include_image")}
              </label>
            </Show>

            <textarea
              rows="3"
              placeholder={t("cards.link_note")}
              value={fields().linkNote}
              onInput={(e) => setField("linkNote")(e.currentTarget.value)}
              class={`w-full px-0 py-1.5 text-sm text-txt placeholder:text-muted resize-none ${underlineFieldClass}`}
            />
          </Show>
        </div>
      </Show>

      {/* Editor — fills the remaining space; the surface inside RichEditor
           scrolls internally past long text while the bottom-docked toolbar
           stays put. */}
      {/* min-h-[360px] (not min-h-0): a real floor covering RichEditor's own
          300px floor plus AttachmentBar's row — see RichEditor.tsx's
          wrapper comment for why min-h-0/auto both fail here. */}
      <div
        ref={wiring.wrapperRef}
        class="flex-1 min-h-[360px] flex flex-col"
        classList={{ hidden: template() !== "freeform" }}
      >
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
            <Show when={composedBody().trim()}>
              <SecondaryButton onClick={() => void store.saveAsDraft(buildDraftExtra(), composedBody())}>
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
                // store.reset() only knows about the editor body — the
                // assembled templates keep theirs here.
                setFields(emptyTemplateFields());
                setIncludeImage(false);
                setFetchedUrl("");
                setMetaError(false);
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
                !composedBody().trim() ||
                !store.title().trim()
              }
              onClick={() => void store.submit({}, composedBody())}
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
