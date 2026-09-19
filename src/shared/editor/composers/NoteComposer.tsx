import { Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createComposerStore } from "../store/createComposerStore";
import RichEditor from "../core/RichEditor";
import { CAPABILITIES } from "../types/editor.types";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import AttachmentBar from "../attachments/AttachmentBar";
import ComposerShell from "../components/ComposerShell";
import EditorStats from "../components/EditorStats";
import { zenMode } from "@utsukta/spa-core/store/zen";
import { countWords } from "../lib/textStats";
import ComposerActionBar from "../components/ComposerActionBar";
import { createWysiwygAvailable } from "../core/wysiwygSafe";
import { createAttachmentStore } from "../attachments/useAttachments";
import { useAttachmentActions } from "../attachments/useAttachmentActions";
import { bbcodeToInsert, patchInsertedAlt, appendInsert } from "../attachments/insertHelpers";
import { currentNick, isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { useEncrypt } from "../useEncrypt";
import { useCategoryTags } from "../components/useCategoryTags";
import CategoryTagsField from "../components/CategoryTagsField";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchCategories } from "@/shared/stream/components/CategoryWidget";
import EncryptToggle from "../components/EncryptToggle";
// Lazy: only fetched once the user opts into encrypting or decrypting — see
// PostComposer/DMComposer for the same split.

interface Props {
  nick: string;
  /** Pass existing note to edit */
  initial?: {
    mid: string;
    body: string;
    mimetype: string;
    /** Existing notebooks; undefined means "unknown", so the edit won't clear them. */
    categories?: string[];
  };
  onSaved?: () => void;
  onCancel?: () => void;
  /** Plain textarea, no toolbar/source-toggle (used by the sidebar quick-note widget) */
  minimal?: boolean;
  /** Stretches to fill an ancestor with a bounded height (e.g. ComposerModal)
   *  instead of the default auto-grow-then-cap layout used inline. */
  fill?: boolean;
}

export default function NoteComposer(props: Props) {
  const { t } = useI18n();
  const caps = CAPABILITIES.note;
  const isEditing = () => !!props.initial?.mid;
  const scope = props.initial?.mid
    ? `note:edit:${props.initial.mid}`
    : "note:new";

  const attach = props.minimal ? null : createAttachmentStore(currentNick(), scope);
  // Owned here so the editor toolbar and the attachment bar drive the same
  // upload/browse/camera flows (the buttons live in the toolbar now).
  const attachActions = useAttachmentActions(() => attach!, currentNick, () => "both");

  const store = createComposerStore(async (body, meta) => {
    // Files (non-image) attach automatically; images are inserted inline via
    // the AttachmentBar's Insert button — same convention as PostComposer/DMComposer.
    const fileTags = attach?.attachments()
      .filter((a) => a.status === "ready" && !a.isImage && (a.hash || a.resourceId))
      .map((a) => `[attachment]${a.hash ?? a.resourceId},0[/attachment]`)
      .join("\n") ?? "";
    const augmentedBody = fileTags ? `${body}\n${fileTags}` : body;

    if (isEditing()) {
      // Edit via existing item-edit endpoint
      const res = await apiFetch(`/spa/item/${props.initial!.mid}/edit`, {
        method: "POST",
        body: JSON.stringify({
          body: augmentedBody,
          title:    "",
          summary:  "",
          mimetype: meta.mimetype ?? "text/bbcode",
          // Authoritative when sent (Item.php editItem): only safe because the
          // notepad list hands us the note's existing categories.
          ...(props.initial!.categories !== undefined ? { category: meta.category ?? "" } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Save failed");
      }
    } else {
      const res = await apiFetch("/spa/notes", {
        method: "POST",
        body: JSON.stringify({
          body: augmentedBody,
          mimetype: meta.mimetype ?? "text/bbcode",
          category: meta.category ?? "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
      }
    }

    attach?.clear();
    props.onSaved?.();
  }, scope, {
    initialBody: props.initial?.body,
    initialCategory: props.initial?.categories?.join(","),
  });

  if (props.initial?.mimetype) {
    store.setMimetype(props.initial.mimetype as any);
  }

  const enc = useEncrypt(store.body, store.setBody);

  // Notebooks are plain categories, shared with the note category widget.
  const [existingCategories] = createQueryResource(
    "composer-categories",
    () => ({ channelNick: currentNick(), type: "notes" as const }),
    fetchCategories,
  );
  const categoryTags = useCategoryTags(
    store.category,
    store.setCategory,
    () => (existingCategories() ?? []).map((c) => c.name),
  );

  // Rendered in both the full editor and the sidebar quick-note's bare
  // textarea, so a note can be filed into a notebook either way.
  // shrink-0 wrapper: showLabel's own box is `flex-1`, which in the editor
  // region's flex *column* (zen mode) would make it eat half the height.
  const notebookField = () => (
    <div class="shrink-0 flex">
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
      placeholder={t("notepad.notebook_placeholder")}
      showLabel
      hideLabel
    />
    </div>
  );

  // This body is stored in the format it was typed in, so the Write tab is
  // offered only while the round trip leaves it byte-identical (wysiwygSafe.ts).
  const wysiwygAvailable = createWysiwygAvailable(store.body, store.mimetype, caps.nonBbcodeWysiwyg);

  return (
    <ComposerShell
      class={props.fill ? "p-3" : undefined}
      // Mirrors the pre-shell wrapper exactly: a real floor only in fill mode,
      // and none for the inline widget or the `minimal` plain-textarea mode,
      // whose own max-h-[50vh] textarea must stay small.
      editorClass={
        props.fill && !props.minimal ? "flex-1 min-h-[340px] flex flex-col" : "contents"
      }
      // `minimal` is a bare textarea with no toolbar, so there is nothing for
      // zen to strip down to — and no counter row there either, keeping the
      // sidebar quick-note widget exactly as it was.
      meta={
        <Show when={!props.minimal}>
          {notebookField()}
          <EditorStats
            words={() => countWords(store.body())}
            chars={() => store.body().length}
            tab={store.tab()}
            onToggleTab={() => store.setTab(store.tab() === "wysiwyg" ? "source" : "wysiwyg")}
          />
        </Show>
      }
      editor={
        <Show
        when={!props.minimal}
        fallback={
          <>
            {notebookField()}
            <textarea
              value={store.body()}
              onInput={(e) => store.setBody(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void store.submit();
                }
              }}
              placeholder={t("notepad.placeholder")}
              class="w-full min-h-[120px] max-h-[50vh] p-3 text-sm rounded-lg border border-rim bg-elevated text-txt
                     outline-none focus:border-accent/50 resize-y overflow-y-auto"
            />
          </>
        }
      >
        <>
          <RichEditor
            attach={attach ? attachActions : undefined}
            onImageAlt={(src, alt) => attach?.setAltByUrl(src, alt)}
            body={store.body()}
            wysiwygAvailable={wysiwygAvailable()}
            onInput={store.setBody}
            capabilities={caps}
            tab={store.tab()}
            onTabChange={store.setTab}
            mimetype={store.mimetype()}
            onCtrlEnter={() => void store.submit()}
            placeholder={t("notepad.placeholder")}
            minHeight={props.fill ? "150px" : "120px"}
            fill={props.fill || zenMode()}
          />

          <AttachmentBar
            actions={attachActions}
            store={attach!}
            nick={currentNick()}
            accept="both"
            onInsert={(bbcode) => {
              store.setBody(appendInsert(store.body(), bbcodeToInsert(bbcode, store.mimetype())));
            }}
            onAltChange={(att) => {
              store.setBody(patchInsertedAlt(store.body(), att, store.mimetype()));
            }}
          />
        </>
      </Show>
      }
      panels={
        <>

        </>
      }
      actions={
        <ComposerActionBar
          menu={
            <Show when={!props.minimal && isFeatureEnabled("content_encrypt")}>
              <EncryptToggle enc={enc} body={store.body} />
            </Show>
          }
          onCancel={
            props.onCancel
              ? () => { store.reset(); attach?.clear(); enc.reset(); props.onCancel?.(); }
              : undefined
          }
          cancelLabel={t("notepad.cancel")}
          submitDisabled={store.submitting() || !!attach?.uploading() || !store.body().trim()}
          onSubmit={() => void store.submit()}
          submitLabel={store.submitting() ? t("notepad.saving") : t("notepad.save_btn")}
        />
      }
    />
  );
}
