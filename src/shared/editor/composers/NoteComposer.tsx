import { Show, lazy } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createComposerStore } from "../store/createComposerStore";
import RichEditor from "../core/RichEditor";
import { CAPABILITIES } from "../types/editor.types";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import SourceToggleButton from "../components/SourceToggleButton";
import AttachmentBar from "../attachments/AttachmentBar";
import { createAttachmentStore } from "../attachments/useAttachments";
import { bbcodeToInsert, patchInsertedAlt } from "../attachments/insertHelpers";
import { currentNick, isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { useEncrypt } from "../useEncrypt";
import EncryptToggle from "../components/EncryptToggle";
// Lazy: only fetched once the user opts into encrypting or decrypting — see
// PostComposer/DMComposer for the same split.
const EncryptPanel = lazy(() => import("../components/EncryptPanel"));
const DecryptPanel = lazy(() => import("../components/DecryptPanel"));

interface Props {
  nick: string;
  /** Pass existing note to edit */
  initial?: {
    mid: string;
    body: string;
    mimetype: string;
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
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
      }
    }

    attach?.clear();
    props.onSaved?.();
  }, scope, { initialBody: props.initial?.body });

  if (props.initial?.mimetype) {
    store.setMimetype(props.initial.mimetype as any);
  }

  const enc = useEncrypt(store.body, store.setBody);

  return (
    <div class={props.fill ? "flex flex-col flex-1 min-h-0 gap-3 p-4" : "space-y-3"}>
      <Show
        when={!props.minimal}
        fallback={
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
        }
      >
        {/* min-h-[340px] (not min-h-0): a real floor covering RichEditor's
            own 300px floor plus the source-toggle row below it — see
            RichEditor.tsx's wrapper comment for why min-h-0/auto both fail
            here. */}
        <div class={props.fill ? "flex-1 min-h-[340px] flex flex-col" : undefined}>
          <RichEditor
            onImageAlt={(src, alt) => attach?.setAltByUrl(src, alt)}
            body={store.body()}
            onInput={store.setBody}
            capabilities={caps}
            tab={store.tab()}
            onTabChange={store.setTab}
            mimetype={store.mimetype()}
            onCtrlEnter={() => void store.submit()}
            placeholder={t("notepad.placeholder")}
            minHeight={props.fill ? "150px" : "120px"}
            fill={props.fill}
          />

          <AttachmentBar
            store={attach!}
            nick={currentNick()}
            accept="both"
            onInsert={(bbcode) => {
              store.setBody(store.body() + "\n" + bbcodeToInsert(bbcode, store.mimetype()));
            }}
            onAltChange={(att) => {
              store.setBody(patchInsertedAlt(store.body(), att, store.mimetype()));
            }}
          />

          <div class="flex justify-end mt-3">
            <SourceToggleButton
              tab={store.tab()}
              onToggle={() => store.setTab(store.tab() === "wysiwyg" ? "source" : "wysiwyg")}
            />
          </div>
        </div>
      </Show>

      {/* ── Encrypt panel ── */}
      <Show when={enc.open()}>
        <EncryptPanel enc={enc} />
      </Show>

      {/* ── Decrypt-to-edit panel ── */}
      <Show when={enc.decryptOpen()}>
        <DecryptPanel enc={enc} body={store.body} />
      </Show>

      <div class="flex items-center gap-2 justify-end shrink-0">
        <Show when={!props.minimal && isFeatureEnabled("content_encrypt")}>
          <EncryptToggle enc={enc} body={store.body} />
        </Show>

        <div class="flex-1" />

        <Show when={props.onCancel}>
          <button
            type="button"
            onClick={() => { store.reset(); attach?.clear(); enc.reset(); props.onCancel?.(); }}
            class="px-3 py-1.5 text-sm rounded-lg border border-rim text-muted
                   hover:bg-elevated transition-colors"
          >
            {t("notepad.cancel")}
          </button>
        </Show>

        <Show when={store.body().trim()}>
          <button
            type="button"
            onClick={() => void store.saveAsDraft()}
            class="px-3 py-1.5 text-sm rounded-lg border border-rim text-muted
                   hover:bg-elevated transition-colors"
          >
            {t("editor.save_draft")}
          </button>
        </Show>

        <button
          type="button"
          onClick={() => void store.submit()}
          disabled={store.submitting() || !!attach?.uploading() || !store.body().trim()}
          class="px-4 py-1.5 text-sm font-medium rounded-lg bg-accent text-accent-fg
                 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {store.submitting() ? t("notepad.saving") : t("notepad.save_btn")}
        </button>
      </div>
    </div>
  );
}
