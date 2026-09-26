import { createSignal, createEffect, createMemo, Show, For, onCleanup } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchCategories } from "@/shared/stream/components/CategoryWidget";
import { fetchDeckList } from "@/modules/cards/api";
import { createComposerStore } from "../store/createComposerStore";
import { useI18n } from "@utsukta/spa-core/i18n";
import RichEditor from "../core/RichEditor";
import { CAPABILITIES } from "../types/editor.types";
import { isAuthorable } from "@utsukta/spa-core/lib/mimetypes";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import AclPicker, { aclModeFrom, aclEntryKeys } from "../components/AclPicker";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { useEncrypt } from "../useEncrypt";
import EncryptToggle from "../components/EncryptToggle";
// Lazy: these panels are only ever shown once a user opts into encrypting or
// decrypting, so their code (and the libsodium-wrappers dependency it
// eventually triggers via postCrypto.ts) shouldn't sit in every composer's
// initial bundle.
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { useMentionEmojiWiring } from "../mention/useMentionEmojiWiring";
import MentionEmojiPopups from "../mention/MentionEmojiPopups";
import AttachmentBar from "../attachments/AttachmentBar";
import ComposerShell, { useEditorFloor } from "../components/ComposerShell";
import { setZenMode } from "@utsukta/spa-core/store/zen";
import { createAttachmentStore } from "../attachments/useAttachments";
import { useAttachmentActions } from "../attachments/useAttachmentActions";
import { bbcodeToInsert, patchInsertedAlt, patchInsertedPoster, appendInsert } from "../attachments/insertHelpers";
import { useAclState } from "../components/useAclState";
import type { AclMode } from "../components/AclPicker";
import { useCategoryTags } from "../components/useCategoryTags";
import CategoryTagsField from "../components/CategoryTagsField";
import SlugField from "../components/SlugField";
import FormatSelect from "../components/FormatSelect";
import SummaryField from "../components/SummaryField";
import DeckField from "../components/DeckField";
import { IconButton } from "../components/buttons";
import ComposerActionBar from "../components/ComposerActionBar";
import { slugify } from "../lib/slugify";
import { underlineFieldClass } from "../lib/fieldStyles";
import { fetchLinkMeta } from "../lib/linkMeta";
import { createWysiwygAvailable } from "../core/wysiwygSafe";
import {
  CARD_TEMPLATES, composeTemplate, parseTemplate, sniffTemplate, emptyTemplateFields,
  type CardTemplate, type TemplateFields,
} from "../lib/cardTemplates";
import { MdOutlineRefresh } from "solid-icons/md";

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
    mimetype?: string;
  };
  onSaved?: () => void;
  /** Close the composer without saving — wired to the left-side Discard button. */
  onCancel?: () => void;
}

export default function CardComposer(props: Props) {
  const floor = useEditorFloor();
  const { t } = useI18n();
  const caps = CAPABILITIES.card;
  const isEditing = () => !!props.initial?.uuid;

  // ── Scope (shared by both stores for matching IDB keys) ─────────────────────
  const scope = props.initial?.uuid
    ? `card:edit:${props.initial.uuid}`
    : "card:new";

  // ── Attachment store ─────────────────────────────────────────────────────────
  const attach = createAttachmentStore(props.nick, scope);
  // Owned here so the editor toolbar and the attachment bar drive the same
  // upload/browse/camera flows (the buttons live in the toolbar now).
  const attachActions = useAttachmentActions(() => attach, () => props.nick, () => "both");

  // ── ACL state — initialize from the existing card's ACL when editing ─────
  // "Only me" is stored as allow_cid = [the owner's own hash], so recovering it
  // needs the viewer's hash; without it the mode falls back to "custom".
  const selfHash = useNavViewer();
  const initialAclMode = (): AclMode =>
    props.initial ? aclModeFrom(props.initial, selfHash()?.hash) : "connections";
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

  // A hand-typed "example.org/a" is a relative URL everywhere downstream — the
  // stored [url=] renders with an empty href and link-meta never fires. Assume
  // https for anything that names no scheme.
  function normalizeLinkUrl() {
    const url = fields().linkUrl.trim();
    if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) setField("linkUrl")(`https://${url}`);
  }

  async function loadLinkMeta(force = false) {
    normalizeLinkUrl();
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
  }, scope, {
    // Autosaved every 5s of quiet — the manual "Save as draft" button is gone.
    autosaveExtra: () => buildDraftExtra(),
  });

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
    // Without this the toolbar (and the WYSIWYG probe) read text/bbcode on
    // every edit, so reopening a markdown card spelled its buttons in bbcode.
    const m = props.initial.mimetype ?? "";
    if (isAuthorable(m)) store.setMimetype(m);
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


  // The slug is never derived from the title as you type — it stays empty until
  // the user asks for one via SlugField's ↻ button (or types it by hand).
  const onTitleChange = (v: string) => store.setTitle(v);

  // Zen shows only the editor, which the assembled templates hide — leaving a
  // blank screen. Drop out of zen rather than render nothing.
  createEffect(() => {
    if (template() !== "freeform") setZenMode(false);
  });

  // This body is stored in the format it was typed in, so the Write tab is
  // offered only while the round trip leaves it byte-identical (wysiwygSafe.ts).
  const wysiwygAvailable = createWysiwygAvailable(store.body, store.mimetype, caps.nonBbcodeWysiwyg);

  return (
    // No mx-auto here, deliberately: every mount point (CardsHeaderWidget's
    // CardModal, CardComposerModal, CardView's edit dialog) puts this in a
    // `flex flex-col` modal body that is already w-full max-w-3xl and already
    // centred. An auto cross-axis margin on a flex item overrides
    // align-self: stretch, so the composer would size to fit-content instead
    // of the row — and since the three assembled templates hide the editor
    // (the one wide child), the quote/definition/link tabs visibly shrank.
    <ComposerShell
      class="p-3"
      editorClass="contents"
      meta={
        <>
          {/* Title */}
          <input
            type="text"
            placeholder={t("editor.card_title_placeholder")}
            value={store.title()}
            onInput={(e) => onTitleChange(e.currentTarget.value)}
            class={`w-full px-0 py-1.5 text-sm font-bold text-txt placeholder:text-muted ${underlineFieldClass}`}
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

          {/* Content format — core's mimetype_select() */}
          <Show when={caps.format}>
            <FormatSelect value={store.mimetype} onChange={store.setMimetype} body={store.body} />
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
        </>
      }
      editor={
        <>
      {/* Template sub-forms — the three assembled templates collect their
          parts here instead of using the rich editor, and take the editor's
          slot so they fill the modal the same way it does. */}
      <Show when={template() !== "freeform"}>
        <div class={`flex-1 ${floor()} flex flex-col gap-4`}>
            <Show when={template() === "quote"}>
              <textarea
                placeholder={t("cards.quote_text")}
                value={fields().quoteText}
                onInput={(e) => setField("quoteText")(e.currentTarget.value)}
                class={`w-full flex-1 min-h-[88px] px-0 py-1.5 text-sm text-txt placeholder:text-muted resize-none ${underlineFieldClass}`}
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
                placeholder={t("cards.definition_body")}
                value={fields().defBody}
                onInput={(e) => setField("defBody")(e.currentTarget.value)}
                class={`w-full flex-1 min-h-[88px] px-0 py-1.5 text-sm text-txt placeholder:text-muted resize-none ${underlineFieldClass}`}
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
                  <MdOutlineRefresh class="w-4 h-4" classList={{ "animate-spin": metaLoading() }} />
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
                placeholder={t("cards.link_note")}
                value={fields().linkNote}
                onInput={(e) => setField("linkNote")(e.currentTarget.value)}
                class={`w-full flex-1 min-h-[88px] px-0 py-1.5 text-sm text-txt placeholder:text-muted resize-none ${underlineFieldClass}`}
              />
            </Show>
        </div>
      </Show>
      {/* Freeform owns its own box (the shell is passed editorClass="contents"),
          and the assembled templates above replace it rather than hiding it:
          a `hidden` next to a reactive `class` (floor() tracks the frame mode)
          was wiped on a dock<->modal switch. */}
        <Show when={template() === "freeform"}>
        <div ref={wiring.wrapperRef} class={`flex-1 ${floor()} flex flex-col`}>
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
            minHeight="150px"
            fill
          />
          <AttachmentBar
            actions={attachActions}
            store={attach}
            nick={props.nick}
            accept="both"
            onInsert={(bbcode) => {
              store.setBody(appendInsert(store.body(), bbcodeToInsert(bbcode, store.mimetype())));
            }}
            onAltChange={(att) => {
              store.setBody(patchInsertedAlt(store.body(), att, store.mimetype()));
            }}
            onPosterChange={(att) => store.setBody(patchInsertedPoster(store.body(), att))}
          />
        </div>
        </Show>
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
          onCancel={() => props.onCancel?.()}
          cancelLabel={isEditing() ? t("editor.cancel_btn") : t("editor.discard")}
          onClear={() => {
            store.reset();
            attach.clear();
            acl.reset();
            categoryTags.setPendingCategory("");
            enc.reset();
            // store.reset() only knows about the editor body — the
            // assembled templates keep theirs here.
            setFields(emptyTemplateFields());
          }}
          submitDisabled={
            store.submitting() ||
            attach.uploading() ||
            !composedBody().trim() ||
            !store.title().trim()
          }
          onSubmit={() => void store.submit({}, composedBody())}
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
